import { app, BrowserWindow, ipcMain, shell, dialog, screen } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync, appendFileSync } from 'fs'
import { ps } from './system/powershell'
import { setLang, T, type Lang } from './system/i18n'
import { getSystemReport, getLiveStats } from './system/sysinfo'
import { getInsights } from './system/analyzer'
import { getDetailedInfo } from './system/details'
import { listTweaks, getTweakStates, applyTweak, revertTweak, getTweakRelevance } from './system/optimizer'
import { diskBench } from './system/bench'
import { previewClean, runClean } from './system/cleaner'
import {
  scanDrivers,
  getWingetUpgrades,
  getVendorLinks,
  getGpuDriverStatus,
  getProblemDevices,
  getComponentChecklist
} from './system/drivers'
import { getStartupItems, setStartupEnabled } from './system/startup'
import { getNetInfo, pingTest, dnsBench, setDns, speedTest } from './system/network'
import { getBrowserReport, installBrowser } from './system/browser'
import { initDiscordPresence, destroyPresence } from './system/discord'
import { generateReport } from './system/report'
import {
  searchDriverUpdates,
  installDriverUpdates,
  wingetUpgradePackage,
  rebootNow,
  checkPendingReboot,
  downloadAndRunNvidiaInstaller,
  installIntelDsa
} from './system/updater'

let isAdminCached: boolean | null = null
if (process.argv.includes('--safe-mode')) app.disableHardwareAcceleration()
let mainWin: BrowserWindow | null = null
let diskController: AbortController | null = null
let speedController: AbortController | null = null

// Jamais de crash silencieux : on logge et on continue.
function logError(context: string, error: unknown): void {
  console.error(`[Pkaizen] ${context}:`, error)
  try {
    appendFileSync(join(app.getPath('userData'), 'errors.log'),
      `${new Date().toISOString()} ${context}: ${error instanceof Error ? error.stack : String(error)}\n`)
  } catch { /* logging must not prevent startup */ }
}
process.on('uncaughtException', (error) => logError('uncaughtException', error))
process.on('unhandledRejection', (error) => logError('unhandledRejection', error))

// Spam-proof : un même appel IPC déjà en cours n'est jamais relancé en parallèle.
const inflight = new Map<string, Promise<unknown>>()
function handle(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown): void {
  ipcMain.handle(channel, (e, ...args) => {
    const key = channel + JSON.stringify(args)
    const existing = inflight.get(key)
    if (existing) return existing
    const p = Promise.resolve()
      .then(() => fn(e, ...(args as never[])))
      .catch((err) => {
        logError(`IPC ${channel}`, err)
        throw err
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
  })
}

async function isAdmin(): Promise<boolean> {
  if (isAdminCached != null) return isAdminCached
  const result = await ps('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)', 15000)
  if (!/^(true|false)$/i.test(result)) throw new Error('Invalid administrator status')
  isAdminCached = result.toLowerCase() === 'true'
  return isAdminCached
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const win = new BrowserWindow({
    width: Math.min(1240, width),
    height: Math.min(800, height),
    minWidth: Math.min(640, width),
    minHeight: Math.min(480, height),
    backgroundColor: '#050609',
    autoHideMenuBar: true,
    title: 'Pkaizen Forge',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0d16', symbolColor: '#9aa3b8', height: 38 },
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWin = win
  win.on('closed', () => {
    speedController?.abort()
    diskController?.abort()
    if (mainWin === win) mainWin = null
  })
  win.webContents.on('unresponsive', () => console.error('[Pkaizen] renderer unresponsive'))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  win.webContents.session.setPermissionCheckHandler(() => false)
  win.webContents.on('render-process-gone', (_e, details) => {
    speedController?.abort()
    diskController?.abort()
    logError('renderer gone', details.reason)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('app:setLang', (_e, l: Lang) => setLang(l))
  ipcMain.handle('app:version', () => app.getVersion())
  handle('app:checkUpdates', async () => {
    if (!app.isPackaged || !updaterRef) return { status: 'dev', current: app.getVersion() }
    try {
      const res = await updaterRef.checkForUpdates()
      const newVersion = res?.updateInfo?.version
      const available = !!newVersion && newVersion !== app.getVersion()
      return { status: available ? 'available' : 'uptodate', current: app.getVersion(), newVersion }
    } catch (e) {
      return { status: 'error', current: app.getVersion(), message: (e as Error).message }
    }
  })
  handle('system:report', () => getSystemReport())
  handle('system:live', () => getLiveStats())
  handle('system:insights', () => getInsights())
  handle('system:details', () => getDetailedInfo())
  handle('system:isAdmin', () => isAdmin())
  handle('app:relaunchAdmin', async () => {
    if (!app.isPackaged) {
      return { ok: false, message: T('Dev mode: relaunch your terminal as admin instead.', 'En dev : relance ton terminal en admin.') }
    }
    const exe = process.execPath.replace(/'/g, "''")
    app.releaseSingleInstanceLock()
    try {
      await ps(`$ErrorActionPreference='Stop'; Start-Process -FilePath '${exe}' -Verb RunAs -ErrorAction Stop`)
    } catch (error) {
      if (!app.requestSingleInstanceLock()) app.quit()
      throw error
    }
    setTimeout(() => app.quit(), 500)
    return { ok: true }
  })

  handle('system:restorePoint', async () => {
    try {
      await ps(
        `Checkpoint-Computer -Description 'Pkaizen Forge avant optimisation' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop`,
        120000
      )
      return { ok: true, message: 'Point de restauration créé.' }
    } catch (e) {
      return {
        ok: false,
        message:
          'Impossible de créer le point de restauration (droits admin requis, ou protection système désactivée). ' +
          (e as Error).message
      }
    }
  })

  handle('system:batteryReport', async () => {
    try {
      const path = await ps(
        `$p = Join-Path $env:TEMP 'pkaizen-battery.html'; powercfg /batteryreport /output $p | Out-Null; $p`,
        30000
      )
      if (path) await shell.openPath(path.trim())
      return { ok: true }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })

  handle('tweaks:list', () => listTweaks())
  handle('tweaks:states', () => getTweakStates())
  handle('tweaks:apply', (_e, id: string) => applyTweak(id))
  handle('tweaks:revert', (_e, id: string) => revertTweak(id))
  handle('tweaks:relevance', () => getTweakRelevance())
  handle('bench:disk', async () => {
    if (diskController) throw new Error('Disk benchmark already running')
    diskController = new AbortController()
    try {
      return await diskBench(diskController.signal)
    } finally {
      diskController = null
    }
  })
  handle('bench:cancel', () => { diskController?.abort() })

  handle('clean:preview', () => previewClean())
  handle('clean:run', (_e, ids: string[]) => runClean(ids))

  handle('drivers:scan', () => scanDrivers())
  handle('drivers:winget', () => getWingetUpgrades())
  handle('drivers:links', () => getVendorLinks())
  handle('drivers:gpuStatus', () => getGpuDriverStatus())
  handle('drivers:problems', () => getProblemDevices())
  handle('drivers:checklist', () => getComponentChecklist())
  handle('drivers:wuSearch', () => searchDriverUpdates())
  handle('drivers:wuInstall', (_e, ids: string[]) => installDriverUpdates(ids))
  handle('drivers:wingetUpgrade', (_e, id: string) => wingetUpgradePackage(id))
  handle('drivers:installNvidia', (e, url: string) =>
    downloadAndRunNvidiaInstaller(url, (p) => e.sender.send('drivers:nvidiaProgress', p))
  )
  handle('drivers:installIntelDsa', () => installIntelDsa())
  handle('system:reboot', () => rebootNow())
  handle('system:pendingReboot', () => checkPendingReboot())

  handle('startup:list', () => getStartupItems())
  handle('startup:set', (_e, name: string, enable: boolean) => setStartupEnabled(name, enable))

  handle('net:info', () => getNetInfo())
  handle('net:ping', () => pingTest())
  handle('net:dns', () => dnsBench())
  handle('net:setDns', (_e, preset: string) => setDns(preset))
  handle('net:speedtest', async (event) => {
    if (speedController) throw new Error('Speed test already running')
    speedController = new AbortController()
    try {
      return await speedTest((phase, mbps, percent) => {
        if (!event.sender.isDestroyed()) event.sender.send('net:speedProgress', { phase, mbps, percent })
      }, speedController.signal)
    } finally {
      speedController = null
    }
  })
  handle('net:cancelSpeed', () => { speedController?.abort() })
  handle('browser:report', () => getBrowserReport())
  handle('browser:install', (_e, id: string) => installBrowser(id))
  handle('report:generate', () => generateReport())

  handle('shell:open', (_e, url: string) => {
    if (url.startsWith('https://') || url.startsWith('ms-settings:')) shell.openExternal(url)
  })
}

// Auto-update via les releases GitHub (repo privé : token optionnel dans userData/update-token.txt).
let updaterRef: typeof import('electron-updater').autoUpdater | null = null

async function setupAutoUpdate(): Promise<void> {
  if (!app.isPackaged) return
  try {
    const tokenFile = join(app.getPath('userData'), 'update-token.txt')
    if (existsSync(tokenFile)) {
      const token = readFileSync(tokenFile, 'utf8').trim()
      if (token) process.env.GH_TOKEN = token
    }
    const { autoUpdater } = await import('electron-updater')
    updaterRef = autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-downloaded', (info) => {
      const res = dialog.showMessageBoxSync({
        type: 'info',
        title: 'Pkaizen Forge',
        message: T(`Update ${info.version} ready`, `Mise à jour ${info.version} prête`),
        detail: T(
          'The new version has been downloaded. Restart now to apply it?',
          'La nouvelle version a été téléchargée. Redémarrer maintenant pour l\u2019appliquer ?'
        ),
        buttons: [T('Restart now', 'Redémarrer maintenant'), T('Later', 'Plus tard')],
        defaultId: 0
      })
      if (res === 0) autoUpdater.quitAndInstall()
    })
    autoUpdater.on('error', (e) => console.error('[Pkaizen] autoUpdater:', e.message))
    // L'app peut rester ouverte des heures : re-check toutes les 30 min.
    setInterval(() => autoUpdater.checkForUpdates().catch(() => undefined), 30 * 60_000)
    await autoUpdater.checkForUpdates()
  } catch (e) {
    console.error('[Pkaizen] autoUpdate setup:', e)
  }
}

// Une seule instance : relancer l'app ramène la fenêtre existante.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.focus()
    }
  })

  app.whenReady().then(() => {
    registerIpc()
    createWindow()
    setupAutoUpdate()
    initDiscordPresence()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }).catch((error) => {
    logError('startup failed', error)
    dialog.showErrorBox('Pkaizen Forge', `Startup failed.\n${String(error)}\n\n${join(app.getPath('userData'), 'errors.log')}`)
    app.exit(1)
  })
}

app.on('window-all-closed', () => {
  destroyPresence()
  app.quit()
})

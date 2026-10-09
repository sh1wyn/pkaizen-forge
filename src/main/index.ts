import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { ps } from './system/powershell'
import { setLang, type Lang } from './system/i18n'
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
import { getNetInfo, pingTest, dnsBench } from './system/network'
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
let mainWin: BrowserWindow | null = null

// Jamais de crash silencieux : on logge et on continue.
process.on('uncaughtException', (err) => console.error('[Pkaizen] uncaughtException:', err))
process.on('unhandledRejection', (reason) => console.error('[Pkaizen] unhandledRejection:', reason))

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
        console.error(`[Pkaizen] IPC ${channel}:`, err)
        throw err
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
  })
}

async function isAdmin(): Promise<boolean> {
  if (isAdminCached != null) return isAdminCached
  try {
    const out = await ps(
      `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`
    )
    isAdminCached = out.trim().toLowerCase() === 'true'
  } catch {
    isAdminCached = false
  }
  return isAdminCached
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    title: 'Pkaizen Forge',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWin = win
  win.on('closed', () => {
    if (mainWin === win) mainWin = null
  })
  win.webContents.on('unresponsive', () => console.error('[Pkaizen] renderer unresponsive'))
  win.webContents.on('render-process-gone', (_e, details) =>
    console.error('[Pkaizen] renderer gone:', details.reason)
  )

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
  handle('system:report', () => getSystemReport())
  handle('system:live', () => getLiveStats())
  handle('system:insights', () => getInsights())
  handle('system:details', () => getDetailedInfo())
  handle('system:isAdmin', () => isAdmin())

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
  handle('bench:disk', () => diskBench())

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
  handle('report:generate', () => generateReport())

  handle('shell:open', (_e, url: string) => {
    if (url.startsWith('https://') || url.startsWith('ms-settings:')) shell.openExternal(url)
  })
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
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  app.quit()
})

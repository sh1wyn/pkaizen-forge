import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { ps } from './system/powershell'
import { getSystemReport, getLiveStats } from './system/sysinfo'
import { getInsights } from './system/analyzer'
import { listTweaks, getTweakStates, applyTweak, revertTweak } from './system/optimizer'
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
  ipcMain.handle('system:report', () => getSystemReport())
  ipcMain.handle('system:live', () => getLiveStats())
  ipcMain.handle('system:insights', () => getInsights())
  ipcMain.handle('system:isAdmin', () => isAdmin())

  ipcMain.handle('system:restorePoint', async () => {
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

  ipcMain.handle('system:batteryReport', async () => {
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

  ipcMain.handle('tweaks:list', () => listTweaks())
  ipcMain.handle('tweaks:states', () => getTweakStates())
  ipcMain.handle('tweaks:apply', (_e, id: string) => applyTweak(id))
  ipcMain.handle('tweaks:revert', (_e, id: string) => revertTweak(id))

  ipcMain.handle('clean:preview', () => previewClean())
  ipcMain.handle('clean:run', (_e, ids: string[]) => runClean(ids))

  ipcMain.handle('drivers:scan', () => scanDrivers())
  ipcMain.handle('drivers:winget', () => getWingetUpgrades())
  ipcMain.handle('drivers:links', () => getVendorLinks())
  ipcMain.handle('drivers:gpuStatus', () => getGpuDriverStatus())
  ipcMain.handle('drivers:problems', () => getProblemDevices())
  ipcMain.handle('drivers:checklist', () => getComponentChecklist())
  ipcMain.handle('drivers:wuSearch', () => searchDriverUpdates())
  ipcMain.handle('drivers:wuInstall', (_e, ids: string[]) => installDriverUpdates(ids))
  ipcMain.handle('drivers:wingetUpgrade', (_e, id: string) => wingetUpgradePackage(id))
  ipcMain.handle('drivers:installNvidia', (e, url: string) =>
    downloadAndRunNvidiaInstaller(url, (p) => e.sender.send('drivers:nvidiaProgress', p))
  )
  ipcMain.handle('drivers:installIntelDsa', () => installIntelDsa())
  ipcMain.handle('system:reboot', () => rebootNow())
  ipcMain.handle('system:pendingReboot', () => checkPendingReboot())

  ipcMain.handle('startup:list', () => getStartupItems())
  ipcMain.handle('startup:set', (_e, name: string, enable: boolean) => setStartupEnabled(name, enable))

  ipcMain.handle('net:info', () => getNetInfo())
  ipcMain.handle('net:ping', () => pingTest())
  ipcMain.handle('net:dns', () => dnsBench())
  ipcMain.handle('report:generate', () => generateReport())

  ipcMain.handle('shell:open', (_e, url: string) => {
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

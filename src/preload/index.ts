import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSystemReport: () => ipcRenderer.invoke('system:report'),
  getLiveStats: () => ipcRenderer.invoke('system:live'),
  getInsights: () => ipcRenderer.invoke('system:insights'),
  isAdmin: () => ipcRenderer.invoke('system:isAdmin'),
  createRestorePoint: () => ipcRenderer.invoke('system:restorePoint'),
  openBatteryReport: () => ipcRenderer.invoke('system:batteryReport'),

  listTweaks: () => ipcRenderer.invoke('tweaks:list'),
  getTweakStates: () => ipcRenderer.invoke('tweaks:states'),
  applyTweak: (id: string) => ipcRenderer.invoke('tweaks:apply', id),
  revertTweak: (id: string) => ipcRenderer.invoke('tweaks:revert', id),

  previewClean: () => ipcRenderer.invoke('clean:preview'),
  runClean: (ids: string[]) => ipcRenderer.invoke('clean:run', ids),

  scanDrivers: () => ipcRenderer.invoke('drivers:scan'),
  getWingetUpgrades: () => ipcRenderer.invoke('drivers:winget'),
  getVendorLinks: () => ipcRenderer.invoke('drivers:links'),
  getGpuDriverStatus: () => ipcRenderer.invoke('drivers:gpuStatus'),
  getProblemDevices: () => ipcRenderer.invoke('drivers:problems'),
  getComponentChecklist: () => ipcRenderer.invoke('drivers:checklist'),
  searchDriverUpdates: () => ipcRenderer.invoke('drivers:wuSearch'),
  installDriverUpdates: (ids: string[]) => ipcRenderer.invoke('drivers:wuInstall', ids),
  wingetUpgradePackage: (id: string) => ipcRenderer.invoke('drivers:wingetUpgrade', id),
  rebootNow: () => ipcRenderer.invoke('system:reboot'),
  checkPendingReboot: () => ipcRenderer.invoke('system:pendingReboot'),

  getStartupItems: () => ipcRenderer.invoke('startup:list'),
  setStartupEnabled: (name: string, enable: boolean) => ipcRenderer.invoke('startup:set', name, enable),

  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

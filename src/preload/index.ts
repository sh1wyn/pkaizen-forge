import { contextBridge, ipcRenderer } from 'electron'

const api = {
  setLang: (lang: string) => ipcRenderer.invoke('app:setLang', lang),
  getSystemReport: () => ipcRenderer.invoke('system:report'),
  getLiveStats: () => ipcRenderer.invoke('system:live'),
  getInsights: () => ipcRenderer.invoke('system:insights'),
  getDetailedInfo: () => ipcRenderer.invoke('system:details'),
  isAdmin: () => ipcRenderer.invoke('system:isAdmin'),
  createRestorePoint: () => ipcRenderer.invoke('system:restorePoint'),
  openBatteryReport: () => ipcRenderer.invoke('system:batteryReport'),

  listTweaks: () => ipcRenderer.invoke('tweaks:list'),
  getTweakStates: () => ipcRenderer.invoke('tweaks:states'),
  applyTweak: (id: string) => ipcRenderer.invoke('tweaks:apply', id),
  revertTweak: (id: string) => ipcRenderer.invoke('tweaks:revert', id),
  getTweakRelevance: () => ipcRenderer.invoke('tweaks:relevance'),
  diskBench: () => ipcRenderer.invoke('bench:disk'),

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
  installNvidiaDriver: (url: string) => ipcRenderer.invoke('drivers:installNvidia', url),
  onNvidiaProgress: (cb: (percent: number) => void) => {
    const listener = (_e: unknown, p: number): void => cb(p)
    ipcRenderer.on('drivers:nvidiaProgress', listener)
    return () => ipcRenderer.removeListener('drivers:nvidiaProgress', listener)
  },
  installIntelDsa: () => ipcRenderer.invoke('drivers:installIntelDsa'),
  rebootNow: () => ipcRenderer.invoke('system:reboot'),
  checkPendingReboot: () => ipcRenderer.invoke('system:pendingReboot'),

  getStartupItems: () => ipcRenderer.invoke('startup:list'),
  setStartupEnabled: (name: string, enable: boolean) => ipcRenderer.invoke('startup:set', name, enable),

  getNetInfo: () => ipcRenderer.invoke('net:info'),
  pingTest: () => ipcRenderer.invoke('net:ping'),
  dnsBench: () => ipcRenderer.invoke('net:dns'),
  generateReport: () => ipcRenderer.invoke('report:generate'),

  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

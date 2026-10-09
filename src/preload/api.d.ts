import type {
  SystemReport,
  LiveStats,
  TweakInfo,
  TweakState,
  ActionResult,
  CleanTarget,
  CleanResult,
  DriverEntry,
  WingetUpgrade,
  VendorLink,
  StartupItem,
  WuDriverUpdate,
  WuInstallResult,
  Insight,
  GpuDriverStatus,
  ProblemDevice,
  ComponentCheck,
  PingResult,
  NetInfo,
  DnsBench,
  TweakRelevance,
  DiskBenchResult,
  DetailedInfo,
  BrowserReport,
  SpeedResult
} from '../shared/types'

declare global {
  interface Window {
    api: {
      setLang: (lang: string) => Promise<void>
      getVersion: () => Promise<string>
      checkUpdates: () => Promise<{ status: 'dev' | 'available' | 'uptodate' | 'error'; current: string; newVersion?: string; message?: string }>
      getSystemReport: () => Promise<SystemReport>
      getLiveStats: () => Promise<LiveStats>
      getInsights: () => Promise<Insight[]>
      getDetailedInfo: () => Promise<DetailedInfo>
      isAdmin: () => Promise<boolean>
      createRestorePoint: () => Promise<ActionResult>
      openBatteryReport: () => Promise<ActionResult>

      listTweaks: () => Promise<TweakInfo[]>
      getTweakStates: () => Promise<TweakState[]>
      applyTweak: (id: string) => Promise<ActionResult>
      revertTweak: (id: string) => Promise<ActionResult>
      getTweakRelevance: () => Promise<TweakRelevance[]>
      diskBench: () => Promise<DiskBenchResult>

      previewClean: () => Promise<CleanTarget[]>
      runClean: (ids: string[]) => Promise<CleanResult[]>

      scanDrivers: () => Promise<DriverEntry[]>
      getWingetUpgrades: () => Promise<WingetUpgrade[]>
      getVendorLinks: () => Promise<VendorLink[]>
      getGpuDriverStatus: () => Promise<GpuDriverStatus[]>
      getProblemDevices: () => Promise<ProblemDevice[]>
      getComponentChecklist: () => Promise<ComponentCheck[]>
      searchDriverUpdates: () => Promise<WuDriverUpdate[]>
      installDriverUpdates: (ids: string[]) => Promise<WuInstallResult>
      wingetUpgradePackage: (id: string) => Promise<ActionResult>
      installNvidiaDriver: (url: string) => Promise<ActionResult>
      onNvidiaProgress: (cb: (percent: number) => void) => () => void
      installIntelDsa: () => Promise<ActionResult>
      rebootNow: () => Promise<void>
      checkPendingReboot: () => Promise<boolean>

      getStartupItems: () => Promise<StartupItem[]>
      setStartupEnabled: (name: string, enable: boolean) => Promise<ActionResult>

      getNetInfo: () => Promise<NetInfo>
      pingTest: () => Promise<PingResult[]>
      dnsBench: () => Promise<DnsBench[]>
      setDns: (preset: string) => Promise<ActionResult>
      speedTest: () => Promise<SpeedResult>
      onSpeedProgress: (cb: (p: { phase: 'down' | 'up'; mbps: number; percent: number }) => void) => () => void
      getBrowserReport: () => Promise<BrowserReport>
      installBrowser: (id: string) => Promise<ActionResult>
      generateReport: () => Promise<ActionResult & { path?: string }>

      openExternal: (url: string) => Promise<void>
    }
  }
}

export {}

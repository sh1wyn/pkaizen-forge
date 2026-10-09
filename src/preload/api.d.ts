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
  DnsBench
} from '../shared/types'

declare global {
  interface Window {
    api: {
      getSystemReport: () => Promise<SystemReport>
      getLiveStats: () => Promise<LiveStats>
      getInsights: () => Promise<Insight[]>
      isAdmin: () => Promise<boolean>
      createRestorePoint: () => Promise<ActionResult>
      openBatteryReport: () => Promise<ActionResult>

      listTweaks: () => Promise<TweakInfo[]>
      getTweakStates: () => Promise<TweakState[]>
      applyTweak: (id: string) => Promise<ActionResult>
      revertTweak: (id: string) => Promise<ActionResult>

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
      generateReport: () => Promise<ActionResult & { path?: string }>

      openExternal: (url: string) => Promise<void>
    }
  }
}

export {}

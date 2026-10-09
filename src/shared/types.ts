export interface CpuInfo {
  brand: string
  cores: number
  physicalCores: number
  speedMax: number
}

export interface GpuInfo {
  model: string
  vendor: string
  vramMB: number
}

export interface DiskInfo {
  name: string
  type: string
  interfaceType: string
  sizeGB: number
}

export interface FsInfo {
  mount: string
  sizeGB: number
  usedGB: number
  usePercent: number
}

export interface BatteryInfo {
  hasBattery: boolean
  percent: number
  isCharging: boolean
  designedCapacity: number
  maxCapacity: number
  healthPercent: number | null
}

export interface SystemReport {
  isLaptop: boolean
  manufacturer: string
  model: string
  os: { distro: string; release: string; build: string; arch: string }
  cpu: CpuInfo
  gpus: GpuInfo[]
  ram: { totalGB: number; slots: string }
  disks: DiskInfo[]
  volumes: FsInfo[]
  battery: BatteryInfo
  baseboard: { manufacturer: string; model: string }
}

export interface LiveStats {
  cpuLoad: number
  memUsedGB: number
  memTotalGB: number
  memPercent: number
  cpuTemp: number | null
  gpuLoad: number | null
  gpuTemp: number | null
}

export type TweakCategory = 'performance' | 'latence' | 'gaming' | 'systeme' | 'avance'

export interface TweakInfo {
  id: string
  name: string
  description: string
  category: TweakCategory
  needsAdmin: boolean
  laptopWarning: boolean
  needsReboot: boolean
  recommended: boolean
}

export interface TweakState {
  id: string
  applied: boolean
  available: boolean
}

export interface CleanTarget {
  id: string
  name: string
  description: string
  needsAdmin: boolean
  sizeMB: number | null
}

export interface CleanResult {
  id: string
  freedMB: number
  ok: boolean
  message?: string
}

export interface DriverEntry {
  device: string
  provider: string
  version: string
  date: string
  className: string
  ageYears: number | null
}

export interface WingetUpgrade {
  name: string
  id: string
  current: string
  available: string
}

export interface VendorLink {
  label: string
  url: string
  why: string
}

export interface WuDriverUpdate {
  title: string
  driverClass: string
  provider: string
  version: string
  sizeMB: number
  id: string
}

export interface WuInstallResult {
  ok: boolean
  rebootRequired: boolean
  installed: number
  message?: string
}

export interface GpuDriverStatus {
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown'
  model: string
  installed: string | null
  latest: string | null
  upToDate: boolean | null
  downloadUrl: string
  note: string
}

export interface ComponentCheck {
  component: string
  name: string
  installed: string | null
  installedDate: string | null
  status: 'update' | 'probably-update' | 'manual' | 'ok'
  officialUrl: string
  advice: string
}

export interface ProblemDevice {
  name: string
  deviceId: string
  code: number
  className: string
  problem: string
  missingDriver: boolean
}

export interface StartupItem {
  name: string
  command: string
  scope: 'user' | 'machine' | 'folder'
  enabled: boolean
  canToggle: boolean
}

export interface Insight {
  severity: 'critical' | 'warn' | 'info' | 'ok'
  title: string
  detail: string
  action?: { label: string; url: string }
}

export interface PingResult {
  host: string
  label: string
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
  jitterMs: number | null
  loss: number
}

export interface NetInfo {
  iface: string
  type: string
  speedMbps: number | null
  gateway: string | null
}

export interface DnsBench {
  server: string
  ms: number | null
}

export interface BrowserReport {
  defaultBrowser: string | null
  installed: string[]
  running: { id: string; name: string; ramMB: number }[]
}

export interface TweakRelevance {
  id: string
  impact: 'high' | 'medium' | 'low'
  reason: string
}

export interface DiskBenchResult {
  writeMBps: number
  readMBps: number
  sizeMB: number
}

export interface DetailedInfo {
  bios: { vendor: string; version: string; date: string; uefi: boolean; secureBoot: boolean } | null
  tpm: { present: boolean; version: string } | null
  windows: {
    edition: string
    displayVersion: string
    build: string
    installDate: string
    fastStartup: boolean
    hvci: boolean
    antivirus: string
    uptimeHours: number
  } | null
  ramSlots: {
    bank: string
    maker: string
    part: string
    sizeGB: number
    configuredMHz: number
    ratedMHz: number
    xmpActive: boolean | null
  }[]
  diskHealth: {
    model: string
    health: string
    tempC: number | null
    powerOnHours: number | null
    wearPercent: number | null
  }[]
  displays: { model: string; main: boolean; resX: number; resY: number; hz: number; connection: string }[]
}

export interface ActionResult {
  ok: boolean
  message?: string
}

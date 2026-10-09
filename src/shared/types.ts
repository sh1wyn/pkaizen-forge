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

export interface ActionResult {
  ok: boolean
  message?: string
}

import si from './hardware'
import { cpus, freemem, totalmem } from 'os'
import type { SystemReport, LiveStats } from '../../shared/types'

const toGB = (b: number): number => Math.round((b / 1024 ** 3) * 10) / 10

let reportCache: { value: SystemReport; expires: number } | null = null
let reportPending: Promise<SystemReport> | null = null

export function getSystemReport(): Promise<SystemReport> {
  if (reportCache && Date.now() < reportCache.expires) return Promise.resolve(reportCache.value)
  if (reportPending) return reportPending
  reportPending = collectSystemReport()
    .then((value) => {
      reportCache = { value, expires: Date.now() + 300_000 }
      return value
    })
    .finally(() => { reportPending = null })
  return reportPending
}

async function collectSystemReport(): Promise<SystemReport> {
  const cpu = await si.cpu()
  const graphics = await si.graphics()
  const mem = { total: totalmem() }
  const memLayout = await si.memLayout()
  const osInfo = await si.osInfo()
  const diskLayout = await si.diskLayout()
  const fsSize = await si.fsSize()
  const battery = await si.battery()
  const baseboard = await si.baseboard()
  const system = await si.system()
  const chassis = await si.chassis()

  const laptopTypes = ['notebook', 'laptop', 'portable', 'sub notebook', 'convertible', 'detachable', 'tablet']
  const isLaptop =
    battery.hasBattery || laptopTypes.includes((chassis.type || '').toLowerCase())

  const healthPercent =
    battery.hasBattery && battery.designedCapacity > 0 && battery.maxCapacity > 0
      ? Math.round((battery.maxCapacity / battery.designedCapacity) * 100)
      : null

  // ProductName/distro peut dire "Windows 10" sur Win11 : le build fait foi.
  const buildNum = parseInt(osInfo.build, 10) || 0
  const distro = buildNum >= 22000 ? osInfo.distro.replace(/Windows 10/i, 'Windows 11') : osInfo.distro

  return {
    isLaptop,
    manufacturer: system.manufacturer || baseboard.manufacturer || 'Inconnu',
    model: system.model || baseboard.model || 'Inconnu',
    os: { distro, release: osInfo.release, build: osInfo.build, arch: osInfo.arch },
    cpu: {
      brand: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      speedMax: cpu.speedMax || cpu.speed
    },
    gpus: graphics.controllers
      .filter((g) => g.model)
      .map((g) => ({
        model: g.model,
        vendor: g.vendor || '',
        vramMB: g.vram || 0
      })),
    ram: {
      totalGB: toGB(mem.total),
      slots: memLayout
        .filter((m) => m.size > 0)
        .map((m) => `${toGB(m.size)} Go ${m.type || ''} ${m.clockSpeed ? m.clockSpeed + ' MHz' : ''}`.trim())
        .join(' + ')
    },
    disks: diskLayout.map((d) => ({
      name: d.name,
      type: d.type || 'Inconnu',
      interfaceType: d.interfaceType || '',
      sizeGB: toGB(d.size)
    })),
    volumes: fsSize
      .filter((f) => f.size > 0)
      .map((f) => ({
        mount: f.mount,
        sizeGB: toGB(f.size),
        usedGB: toGB(f.used),
        usePercent: Math.round(f.use)
      })),
    battery: {
      hasBattery: battery.hasBattery,
      percent: battery.percent,
      isCharging: battery.isCharging,
      designedCapacity: battery.designedCapacity,
      maxCapacity: battery.maxCapacity,
      healthPercent
    },
    baseboard: { manufacturer: baseboard.manufacturer || '', model: baseboard.model || '' }
  }
}

let previousCpu = cpus()

export async function getLiveStats(): Promise<LiveStats> {
  const currentCpu = cpus()
  let idleDelta = 0
  let totalDelta = 0
  if (currentCpu.length === previousCpu.length) {
    currentCpu.forEach((cpu, index) => {
      const previous = previousCpu[index].times
      idleDelta += cpu.times.idle - previous.idle
      totalDelta += Object.values(cpu.times).reduce((sum, value) => sum + value, 0) -
        Object.values(previous).reduce((sum, value) => sum + value, 0)
    })
  }
  previousCpu = currentCpu
  const total = totalmem()
  const used = Math.max(0, Math.min(total, total - freemem()))
  return {
    cpuLoad: totalDelta > 0 ? Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))) : 0,
    memUsedGB: toGB(used),
    memTotalGB: toGB(total),
    memPercent: total > 0 ? Math.round((used / total) * 100) : 0,
    cpuTemp: null,
    gpuLoad: null,
    gpuTemp: null
  }
}

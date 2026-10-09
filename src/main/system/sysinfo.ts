import si from 'systeminformation'
import type { SystemReport, LiveStats } from '../../shared/types'

const toGB = (b: number): number => Math.round((b / 1024 ** 3) * 10) / 10

export async function getSystemReport(): Promise<SystemReport> {
  const [cpu, graphics, mem, memLayout, osInfo, diskLayout, fsSize, battery, baseboard, system, chassis] =
    await Promise.all([
      si.cpu(),
      si.graphics(),
      si.mem(),
      si.memLayout(),
      si.osInfo(),
      si.diskLayout(),
      si.fsSize(),
      si.battery(),
      si.baseboard(),
      si.system(),
      si.chassis()
    ])

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

export async function getLiveStats(): Promise<LiveStats> {
  // Léger : pas de WMI graphics à chaque poll — nvidia-smi direct si dispo, sinon rien.
  const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
  const gpu = await getGpuLive()
  const cpuTemp = await getCpuTempThrottled()
  return {
    cpuLoad: Math.round(load.currentLoad),
    memUsedGB: toGB(mem.active),
    memTotalGB: toGB(mem.total),
    memPercent: Math.round((mem.active / mem.total) * 100),
    cpuTemp,
    gpuLoad: gpu.load,
    gpuTemp: gpu.temp
  }
}

let hasNvidiaSmi: boolean | null = null
let gpuTick = 0
let lastGpu: { load: number | null; temp: number | null } = { load: null, temp: null }

async function getGpuLive(): Promise<{ load: number | null; temp: number | null }> {
  if (hasNvidiaSmi === false) return { load: null, temp: null }
  // 1 spawn nvidia-smi sur 2 : moitié moins de processus pendant le polling live.
  if (gpuTick++ % 2 !== 0) return lastGpu
  try {
    const { execFile } = await import('child_process')
    const out = await new Promise<string>((resolve, reject) => {
      execFile(
        'nvidia-smi',
        ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
        { timeout: 4000, windowsHide: true },
        (err, stdout) => (err ? reject(err) : resolve(stdout))
      )
    })
    hasNvidiaSmi = true
    const [load, temp] = out.trim().split(',').map((s) => parseInt(s.trim(), 10))
    lastGpu = { load: Number.isNaN(load) ? null : load, temp: Number.isNaN(temp) ? null : temp }
    return lastGpu
  } catch {
    hasNvidiaSmi = false
    return { load: null, temp: null }
  }
}

// La température CPU passe par WMI (coûteux) : au max 1 lecture sur 4, cache entre-temps.
let tempCounter = 0
let lastTemp: number | null = null
let tempSupported = true

async function getCpuTempThrottled(): Promise<number | null> {
  if (!tempSupported) return null
  if (tempCounter++ % 4 !== 0) return lastTemp
  try {
    const t = await si.cpuTemperature()
    lastTemp = t.main && t.main > 0 ? Math.round(t.main) : null
    if (lastTemp === null && tempCounter > 4) tempSupported = false
  } catch {
    tempSupported = false
  }
  return lastTemp
}

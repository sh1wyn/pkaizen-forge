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

  return {
    isLaptop,
    manufacturer: system.manufacturer || baseboard.manufacturer || 'Inconnu',
    model: system.model || baseboard.model || 'Inconnu',
    os: { distro: osInfo.distro, release: osInfo.release, build: osInfo.build, arch: osInfo.arch },
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
  const [load, mem, temp, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpuTemperature(),
    si.graphics()
  ])
  const gpu = graphics.controllers.find((g) => g.utilizationGpu != null || g.temperatureGpu != null)
  return {
    cpuLoad: Math.round(load.currentLoad),
    memUsedGB: toGB(mem.active),
    memTotalGB: toGB(mem.total),
    memPercent: Math.round((mem.active / mem.total) * 100),
    cpuTemp: temp.main && temp.main > 0 ? Math.round(temp.main) : null,
    gpuLoad: gpu?.utilizationGpu != null ? Math.round(gpu.utilizationGpu) : null,
    gpuTemp: gpu?.temperatureGpu != null ? Math.round(gpu.temperatureGpu) : null
  }
}

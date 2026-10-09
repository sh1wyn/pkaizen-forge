import si from 'systeminformation'
import { runSystemTask } from './powershell'
import { platform, release } from 'os'

export function windowsBuild(value: string): number | null {
  const match = value.trim().match(/^(?:\d+\.\d+\.)?(\d{4,6})(?:\.\d+)?$/)
  return match ? Number(match[1]) : null
}

export function windowsName(name: string, build: number | null): string {
  if (build === null || build < 10240 || /server/i.test(name)) return name
  const family = build >= 22000 ? 'Windows 11' : 'Windows 10'
  if (/Windows (?:10|11)/i.test(name)) return name.replace(/Windows (?:10|11)/i, family)
  return name.trim() && !/^(unknown|windows|microsoft windows)$/i.test(name.trim()) ? name : family
}

export function normalizeWindowsInfo(info: Awaited<ReturnType<typeof si.osInfo>>, nativeRelease: string): typeof info {
  const build = windowsBuild(nativeRelease) ?? windowsBuild(info.build)
  return { ...info, build: build === null ? info.build : String(build), distro: windowsName(info.distro, build) }
}

function cachedProbe<Result>(probe: () => Promise<Result>): () => Promise<Result> {
  let cached: { value: Result; expires: number } | undefined
  let pending: Promise<Result> | undefined
  return () => {
    if (cached && Date.now() < cached.expires) return Promise.resolve(cached.value)
    if (pending) return pending
    pending = runSystemTask(probe)
      .then((value) => {
        cached = { value, expires: Date.now() + 300_000 }
        return value
      })
      .finally(() => { pending = undefined })
    return pending
  }
}

export default {
  cpu: cachedProbe(() => si.cpu()),
  graphics: cachedProbe(() => si.graphics()),
  mem: () => runSystemTask(() => si.mem()),
  memLayout: cachedProbe(() => si.memLayout()),
  osInfo: cachedProbe(async () => {
    const info = await si.osInfo()
    return platform() === 'win32' ? normalizeWindowsInfo(info, release()) : info
  }),
  diskLayout: cachedProbe(() => si.diskLayout()),
  fsSize: () => runSystemTask(() => si.fsSize()),
  battery: () => runSystemTask(() => si.battery()),
  baseboard: cachedProbe(() => si.baseboard()),
  system: cachedProbe(() => si.system()),
  chassis: cachedProbe(() => si.chassis()),
  networkInterfaces: () => runSystemTask(() => si.networkInterfaces()),
  networkInterfaceDefault: () => runSystemTask(() => si.networkInterfaceDefault()),
  networkGatewayDefault: () => runSystemTask(() => si.networkGatewayDefault()),
  time: si.time
}
import si from 'systeminformation'
import { runSystemTask } from './powershell'

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
  osInfo: cachedProbe(() => si.osInfo()),
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
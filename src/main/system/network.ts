import { psJson, asArray } from './powershell'
import si from 'systeminformation'
import type { PingResult, NetInfo, DnsBench } from '../../shared/types'

export async function getNetInfo(): Promise<NetInfo> {
  const [ifaces, def, gw] = await Promise.all([
    si.networkInterfaces(),
    si.networkInterfaceDefault(),
    si.networkGatewayDefault()
  ])
  const d = ifaces.find((i) => i.iface === def)
  return {
    iface: d?.ifaceName || d?.iface || 'Inconnu',
    type: d?.type === 'wireless' ? 'Wi-Fi' : d?.type === 'wired' ? 'Ethernet' : 'Inconnu',
    speedMbps: d?.speed ?? null,
    gateway: gw || null
  }
}

export async function pingTest(): Promise<PingResult[]> {
  const gw = (await si.networkGatewayDefault()) || ''
  const targets = [
    gw ? { host: gw, label: 'Routeur (box)' } : null,
    { host: '1.1.1.1', label: 'Cloudflare (internet proche)' },
    { host: '8.8.8.8', label: 'Google DNS' }
  ].filter(Boolean) as { host: string; label: string }[]

  const raw = await psJson<
    { host: string; times: number[] | number | null }[] | { host: string; times: number[] | number | null }
  >(
    `
    $targets = @(${targets.map((t) => `'${t.host}'`).join(',')})
    $out = foreach ($t in $targets) {
      $times = @()
      try {
        $r = Test-Connection -ComputerName $t -Count 4 -ErrorAction SilentlyContinue
        $times = @($r | ForEach-Object { [int]$_.ResponseTime })
      } catch {}
      [pscustomobject]@{ host = $t; times = $times }
    }
    ConvertTo-Json -InputObject @($out) -Depth 3
    `,
    60000
  )

  return asArray(raw).map((r) => {
    const label = targets.find((t) => t.host === r.host)?.label || r.host
    const times = (Array.isArray(r.times) ? r.times : r.times != null ? [r.times] : []).filter(
      (t) => typeof t === 'number' && !Number.isNaN(t)
    ) as number[]
    if (times.length === 0) {
      return { host: r.host, label, avgMs: null, minMs: null, maxMs: null, jitterMs: null, loss: 100 }
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const jitter =
      times.length > 1
        ? times.slice(1).reduce((a, t, i) => a + Math.abs(t - times[i]), 0) / (times.length - 1)
        : 0
    return {
      host: r.host,
      label,
      avgMs: Math.round(avg * 10) / 10,
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      jitterMs: Math.round(jitter * 10) / 10,
      loss: Math.round(((4 - times.length) / 4) * 100)
    }
  })
}

export async function dnsBench(): Promise<DnsBench[]> {
  const raw = await psJson<{ server: string; ms: number }[] | { server: string; ms: number }>(
    `
    $servers = @(@{n='DNS actuel';s=$null}, @{n='Cloudflare 1.1.1.1';s='1.1.1.1'}, @{n='Google 8.8.8.8';s='8.8.8.8'}, @{n='Quad9 9.9.9.9';s='9.9.9.9'})
    $out = foreach ($srv in $servers) {
      $total = 0; $okRuns = 0
      foreach ($domain in @('example.com','wikipedia.org')) {
        try {
          $t = Measure-Command {
            if ($srv.s) { Resolve-DnsName -Name $domain -Server $srv.s -DnsOnly -NoHostsFile -ErrorAction Stop | Out-Null }
            else { Resolve-DnsName -Name $domain -DnsOnly -ErrorAction Stop | Out-Null }
          }
          $total += $t.TotalMilliseconds; $okRuns++
        } catch {}
      }
      [pscustomobject]@{ server = [string]$srv.n; ms = if ($okRuns -gt 0) { [math]::Round($total / $okRuns, 1) } else { -1 } }
    }
    ConvertTo-Json -InputObject @($out) -Depth 3
    `,
    60000
  )
  return asArray(raw).map((r) => ({ server: r.server, ms: r.ms >= 0 ? r.ms : null }))
}

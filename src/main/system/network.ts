import { psJson, ps, asArray } from './powershell'
import si from 'systeminformation'
import { T } from './i18n'
import type { PingResult, NetInfo, DnsBench, ActionResult, SpeedResult } from '../../shared/types'

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
    gw ? { host: gw, label: T('Router (box)', 'Routeur (box)') } : null,
    { host: '1.1.1.1', label: T('Cloudflare (nearby internet)', 'Cloudflare (internet proche)') },
    { host: '8.8.8.8', label: T('Google DNS', 'Google DNS') }
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
  const current = T('Current DNS', 'DNS actuel')
  const raw = await psJson<{ server: string; ms: number }[] | { server: string; ms: number }>(
    `
    $servers = @(@{n='${current.replace(/'/g, "''")}';s=$null}, @{n='Cloudflare 1.1.1.1';s='1.1.1.1'}, @{n='Google 8.8.8.8';s='8.8.8.8'}, @{n='Quad9 9.9.9.9';s='9.9.9.9'})
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

const DNS_PRESETS: Record<string, string[] | null> = {
  cloudflare: ['1.1.1.1', '1.0.0.1'],
  google: ['8.8.8.8', '8.8.4.4'],
  quad9: ['9.9.9.9', '149.112.112.112'],
  auto: null
}

/** Change le DNS de l'interface par défaut en 1 clic (admin requis). */
export async function setDns(preset: string): Promise<ActionResult> {  const servers = DNS_PRESETS[preset]
  try {
    const script = `
      $idx = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex
      ${servers ? `Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses ${servers.join(',')} -ErrorAction Stop` : `Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses -ErrorAction Stop`}
      Clear-DnsClientCache
      'OK'
    `
    const out = await ps(script, 30000)
    if (!out.includes('OK')) {
      return {
        ok: false,
        message: T(
          'Failed — administrator rights are required to change DNS.',
          'Échec — les droits administrateur sont requis pour changer le DNS.'
        )
      }
    }
    return {
      ok: true,
      message: servers
        ? T(`DNS switched to ${servers[0]} ✔ (instant, reversible)`, `DNS basculé sur ${servers[0]} ✔ (instantané, réversible)`)
        : T('DNS restored to automatic (DHCP) ✔', 'DNS remis en automatique (DHCP) ✔')
    }
  } catch (e) {
    return {
      ok: false,
      message: T('Failed (admin required): ', 'Échec (admin requis) : ') + (e as Error).message
    }
  }
}

/* ------------------------------------------------------------- */
/*  Speedtest réel via l'endpoint officiel Cloudflare (speed.cloudflare.com) */
/* ------------------------------------------------------------- */

const DOWN_BYTES = 200_000_000
const DOWN_MAX_MS = 10_000
const UP_BYTES = 25_000_000

export async function speedTest(
  onProgress: (phase: 'down' | 'up', mbps: number, percent: number) => void
): Promise<SpeedResult> {
  let downMbps: number | null = null
  let upMbps: number | null = null

  try {
    const ctrl = new AbortController()
    const started = performance.now()
    let received = 0
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${DOWN_BYTES}`, { signal: ctrl.signal })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value?.length ?? 0
        const elapsed = performance.now() - started
        const mbps = (received * 8) / (elapsed / 1000) / 1e6
        onProgress('down', Math.round(mbps * 10) / 10, Math.min(100, Math.round((elapsed / DOWN_MAX_MS) * 100)))
        if (elapsed > DOWN_MAX_MS) {
          ctrl.abort()
          break
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e
    }
    const downMs = Math.min(performance.now() - started, DOWN_MAX_MS)
    if (received > 0) downMbps = Math.round(((received * 8) / (downMs / 1000) / 1e6) * 10) / 10
  } catch {
    downMbps = null
  }

  try {
    onProgress('up', 0, 0)
    const payload = Buffer.alloc(UP_BYTES, 0x50)
    const t1 = performance.now()
    await fetch('https://speed.cloudflare.com/__up', {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/octet-stream' }
    })
    const upMs = performance.now() - t1
    upMbps = Math.round(((UP_BYTES * 8) / (upMs / 1000) / 1e6) * 10) / 10
    onProgress('up', upMbps, 100)
  } catch {
    upMbps = null
  }

  return { downMbps, upMbps }
}

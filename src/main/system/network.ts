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

// Cloudflare renvoie 403 sans ces en-têtes de navigateur.
const CF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://speed.cloudflare.com/'
}

const DOWN_STREAMS = 4
const DOWN_MS = 6000
const UP_STREAMS = 3
const UP_BYTES_EACH = 10_000_000

export async function speedTest(
  onProgress: (phase: 'down' | 'up', mbps: number, percent: number) => void
): Promise<SpeedResult> {
  let downMbps: number | null = null
  let upMbps: number | null = null

  // --- Download : 4 connexions parallèles (comme Speedtest), mesure après la montée TCP ---
  try {
    const ctrl = new AbortController()
    let total = 0
    let started = 0
    let warmupBytes = -1 // octets reçus à t=1s, exclus de la mesure finale

    const streamJob = async (): Promise<void> => {
      const res = await fetch('https://speed.cloudflare.com/__down?bytes=500000000', {
        signal: ctrl.signal,
        headers: CF_HEADERS
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (started === 0) started = performance.now()
        total += value?.length ?? 0
        const elapsed = performance.now() - started
        if (warmupBytes < 0 && elapsed >= 1000) warmupBytes = total
        if (elapsed > 400) {
          const mbps = (total * 8) / (elapsed / 1000) / 1e6
          onProgress('down', Math.round(mbps * 10) / 10, Math.min(100, Math.round((elapsed / DOWN_MS) * 100)))
        }
        if (elapsed > DOWN_MS) {
          ctrl.abort()
          break
        }
      }
    }

    await Promise.allSettled(Array.from({ length: DOWN_STREAMS }, streamJob))
    const elapsed = started > 0 ? Math.min(performance.now() - started, DOWN_MS + 500) : 0
    if (total > 0 && elapsed > 0) {
      // Vitesse stabilisée : on exclut la 1re seconde (montée en charge TCP) si possible.
      const mbps =
        warmupBytes > 0 && elapsed > 2500
          ? ((total - warmupBytes) * 8) / ((elapsed - 1000) / 1000) / 1e6
          : (total * 8) / (elapsed / 1000) / 1e6
      downMbps = Math.round(mbps * 10) / 10
      onProgress('down', downMbps, 100)
    }
  } catch {
    downMbps = null
  }

  // --- Upload : 3 envois parallèles, 2e passe plus grosse si la ligne est rapide ---
  try {
    onProgress('up', 0, 0)
    const measureUpload = async (bytesEach: number): Promise<{ mbps: number; ms: number } | null> => {
      const payload = Buffer.alloc(bytesEach, 0x50)
      const t1 = performance.now()
      const results = await Promise.allSettled(
        Array.from({ length: UP_STREAMS }, () =>
          fetch('https://speed.cloudflare.com/__up', {
            method: 'POST',
            body: payload,
            headers: { ...CF_HEADERS, 'Content-Type': 'application/octet-stream' }
          })
        )
      )
      const okCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
      const ms = performance.now() - t1
      if (okCount === 0 || ms <= 0) return null
      return { mbps: (okCount * bytesEach * 8) / (ms / 1000) / 1e6, ms }
    }

    let m = await measureUpload(UP_BYTES_EACH)
    // Ligne rapide : mesure trop courte pour être fiable → 2e passe avec 4× plus de données.
    if (m && m.ms < 2000) {
      onProgress('up', Math.round(m.mbps * 10) / 10, 50)
      m = (await measureUpload(UP_BYTES_EACH * 4)) ?? m
    }
    if (m) {
      upMbps = Math.round(m.mbps * 10) / 10
      onProgress('up', upMbps, 100)
    }
  } catch {
    upMbps = null
  }

  return { downMbps, upMbps }
}

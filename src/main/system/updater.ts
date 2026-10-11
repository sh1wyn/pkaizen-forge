import { ps } from './powershell'
import { T } from './i18n'
import type { ActionResult, WuDriverUpdate, WuInstallResult } from '../../shared/types'

/**
 * Installation de pilotes via l'API COM officielle Windows Update Agent.
 * Pilotes proposés pour le matériel par le service Windows Update configuré.
 * Pkaizen Forge n'installe JAMAIS de pilotes depuis des sources non officielles.
 */

export async function searchDriverUpdates(): Promise<WuDriverUpdate[]> {
  const output = await ps(
    `
    $ErrorActionPreference='Stop'
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $searcher.Online = $true
    $result = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Driver'")
    if ($result.ResultCode -ne 2) { throw "Windows Update search failed: $($result.ResultCode)" }
    $list = @()
    foreach ($u in $result.Updates) {
      if ($u.DriverClass -eq 'Firmware') { continue }
      $sizeMB = [math]::Round($u.MaxDownloadSize / 1MB, 1)
      $list += [pscustomobject]@{
        title    = $u.Title
        driverClass = $u.DriverClass
        provider = $u.DriverProvider
        version  = $u.DriverVerDate
        sizeMB   = $sizeMB
        id       = $u.Identity.UpdateID
      }
    }
    ConvertTo-Json -InputObject @($list) -Depth 3
    `,
    300000,
    true
  )
  const raw: unknown = JSON.parse(output)
  if (!Array.isArray(raw) || raw.some((update) => !update || typeof update.id !== 'string' || typeof update.title !== 'string')) {
    throw new Error('Invalid Windows Update search response')
  }
  return raw as WuDriverUpdate[]
}

export async function installDriverUpdates(ids: string[]): Promise<WuInstallResult> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || ids.some((id) =>
    typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { ok: false, rebootRequired: false, installed: 0, message: T('Invalid driver selection.', 'Sélection de pilotes invalide.') }
  }
  const idFilter = [...new Set(ids)].map((id) => `'${id}'`).join(',')
  try {
    const output = await ps(
      `
      $ErrorActionPreference='Stop'
      $wanted = @(${idFilter})
      $session = New-Object -ComObject Microsoft.Update.Session
      $searcher = $session.CreateUpdateSearcher()
      $searcher.Online = $true
      $result = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Driver'")
      if ($result.ResultCode -ne 2) { throw "Windows Update search failed: $($result.ResultCode)" }
      $coll = New-Object -ComObject Microsoft.Update.UpdateColl
      foreach ($u in $result.Updates) {
        if ($wanted -contains $u.Identity.UpdateID -and $u.DriverClass -ne 'Firmware') {
          if (-not $u.EulaAccepted) { $u.AcceptEula() }
          $coll.Add($u) | Out-Null
        }
      }
      $installer = $session.CreateUpdateInstaller()
      if ($installer.IsBusy) { throw 'Windows Update installer is busy.' }
      if ($installer.RebootRequiredBeforeInstallation) { throw 'Windows must restart before installing drivers.' }
      $details = @()
      foreach ($id in $wanted) {
        if (-not (@($coll | ForEach-Object { $_.Identity.UpdateID }) -contains $id)) {
          $details += @{ id = $id; title = $id; ok = $false; message = 'No longer offered by Windows Update.' }
        }
      }
      $ready = New-Object -ComObject Microsoft.Update.UpdateColl
      if ($coll.Count -gt 0) {
        $downloader = $session.CreateUpdateDownloader()
        $downloader.Updates = $coll
        $download = $downloader.Download()
        for ($index = 0; $index -lt $coll.Count; $index++) {
          $update = $coll.Item($index)
          if ($update.IsDownloaded) {
            $ready.Add($update) | Out-Null
          } else {
            $details += @{ id = $update.Identity.UpdateID; title = $update.Title; ok = $false; message = ('Download HRESULT: 0x{0:X8}' -f $download.GetUpdateResult($index).HResult) }
          }
        }
      }
      $installed = 0
      $reboot = $false
      if ($ready.Count -gt 0) {
        $installer.Updates = $ready
        $r = $installer.Install()
        $reboot = [bool]$r.RebootRequired
        for ($index = 0; $index -lt $ready.Count; $index++) {
          $update = $ready.Item($index)
          $item = $r.GetUpdateResult($index)
          $ok = $item.ResultCode -eq 2
          if ($ok) { $installed++ }
          $reboot = $reboot -or [bool]$item.RebootRequired
          $details += @{ id = $update.Identity.UpdateID; title = $update.Title; ok = $ok; message = ('Result: {0}; HRESULT: 0x{1:X8}' -f $item.ResultCode, $item.HResult) }
        }
      }
      ConvertTo-Json @{ installed = $installed; requested = $wanted.Count; reboot = $reboot; results = @($details) } -Depth 4
      `,
      1800000,
      true
    )
    const raw = JSON.parse(output) as { installed: number; requested: number; reboot: boolean; results: NonNullable<WuInstallResult['results']> }
    if (!raw || !Array.isArray(raw.results) || !Number.isInteger(raw.installed) || raw.requested !== new Set(ids).size) {
      throw new Error('Invalid Windows Update installation response')
    }
    return {
      ok: raw.installed > 0 && raw.installed === raw.requested,
      rebootRequired: raw.reboot,
      installed: raw.installed,
      results: raw.results,
      message: T(`${raw.installed}/${raw.requested} drivers installed.`, `${raw.installed}/${raw.requested} pilotes installés.`)
    }
  } catch (e) {
    return {
      ok: false,
      rebootRequired: false,
      installed: 0,
      message:
        T('Driver installation failed: ', 'Échec de l’installation des pilotes : ') + (e as Error).message
    }
  }
}

export async function wingetUpgradePackage(id: string): Promise<ActionResult> {
  const safeId = id.replace(/[^A-Za-z0-9._+-]/g, '')
  if (!safeId) return { ok: false, message: 'Id invalide.' }
  try {
    const out = await ps(
      `winget upgrade --id ${safeId} --exact --silent --accept-source-agreements --accept-package-agreements --disable-interactivity`,
      900000
    )
    const okish = /Successfully installed|installé avec succès|No applicable update|aucune mise à jour/i.test(out)
    return { ok: okish, message: okish ? 'Mise à jour installée.' : out.split(/\r?\n/).slice(-3).join(' ') }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function rebootNow(): Promise<void> {
  await ps(`shutdown /r /t 5 /c "Pkaizen Forge : redémarrage pour finaliser les optimisations"`)
}

/**
 * Télécharge l'installeur NVIDIA directement depuis le CDN officiel (URL fournie
 * par l'API nvidia.com) puis lance l'installeur. Refuse toute URL hors nvidia.com.
 */
export async function fetchNvidiaInstaller(url: string, signal: AbortSignal): Promise<Response> {
  let current = new URL(url)
  for (let redirects = 0; redirects <= 5; redirects++) {
    const host = current.hostname.toLowerCase()
    if (current.protocol !== 'https:' || current.username || current.password ||
      !(host === 'nvidia.com' || host.endsWith('.nvidia.com'))) {
      throw new Error('Only official NVIDIA HTTPS downloads are allowed')
    }
    const response = await fetch(current.href, { signal, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location) throw new Error('NVIDIA redirect has no destination')
    current = new URL(location, current)
  }
  throw new Error('Too many NVIDIA redirects')
}

export async function downloadAndRunNvidiaInstaller(
  url: string,
  onProgress?: (percent: number) => void
): Promise<ActionResult> {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (u.protocol !== 'https:' || !(host === 'nvidia.com' || host.endsWith('.nvidia.com'))) {
      return { ok: false, message: 'URL refusée : seul le CDN officiel nvidia.com est autorisé.' }
    }

    const { app, shell } = await import('electron')
    const { createWriteStream } = await import('fs')
    const { pipeline } = await import('stream/promises')
    const { Readable } = await import('stream')
    const { join } = await import('path')

    const signal = AbortSignal.timeout(20 * 60_000)
    const res = await fetchNvidiaInstaller(url, signal)
    if (!res.ok || !res.body) return { ok: false, message: `Téléchargement échoué (HTTP ${res.status}).` }

    const total = Number(res.headers.get('content-length') || 0)
    const dest = join(app.getPath('temp'), `pkaizen-nvidia-${Date.now()}.exe`)
    let done = 0
    let lastPercent = -1
    const reader = Readable.fromWeb(res.body as never)
    reader.on('data', (chunk: Buffer) => {
      done += chunk.length
      const percent = Math.min(100, Math.round((done / total) * 100))
      if (total > 0 && percent !== lastPercent && onProgress) {
        lastPercent = percent
        onProgress(percent)
      }
    })
    try {
      await pipeline(reader, createWriteStream(dest, { flags: 'wx' }), { signal })
    } catch (error) {
      const { unlink } = await import('fs/promises')
      await unlink(dest).catch(() => undefined)
      throw error
    }

    const err = await shell.openPath(dest)
    if (err) return { ok: false, message: T(`Could not launch the installer: ${err}`, `Impossible de lancer l'installeur : ${err}`) }
    return {
      ok: true,
      message: T(
        'Official NVIDIA installer launched — follow the steps (Express installation recommended).',
        'Installeur NVIDIA officiel lancé — suis les étapes (Installation express recommandée).'
      )
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

/** Installe l'assistant officiel Intel (DSA) via winget — il gère ensuite chipset/GPU/réseau Intel. */
export async function installIntelDsa(): Promise<ActionResult> {
  try {
    const out = await ps(
      `winget install --id Intel.IntelDriverAndSupportAssistant --exact --silent --accept-source-agreements --accept-package-agreements --disable-interactivity`,
      900000
    )
    const ok = /Successfully installed|install\u00e9 avec succ\u00e8s|already installed|d\u00e9j\u00e0 install\u00e9/i.test(out)
    return {
      ok,
      message: ok
        ? T(
            'Intel DSA installed — open it, it detects and installs all official Intel drivers.',
            'Intel DSA installé — ouvre-le, il détecte et installe tous les pilotes Intel officiels.'
          )
        : out.split(/\r?\n/).slice(-3).join(' ')
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function checkPendingReboot(): Promise<boolean> {
  const out = await ps(
    `
    $p = $false
    if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') { $p = $true }
    if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $p = $true }
    if ($p) { '1' }
    `,
    15000
  )
  return out.includes('1')
}

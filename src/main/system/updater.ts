import { ps, psJson, asArray } from './powershell'
import type { ActionResult, WuDriverUpdate, WuInstallResult } from '../../shared/types'

/**
 * Installation de pilotes via l'API COM officielle Windows Update Agent.
 * Uniquement des pilotes signés distribués par Microsoft — aucun risque anticheat.
 * Pkaizen Forge n'installe JAMAIS de pilotes depuis des sources non officielles.
 */

export async function searchDriverUpdates(): Promise<WuDriverUpdate[]> {
  const raw = await psJson<WuDriverUpdate | WuDriverUpdate[]>(
    `
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $result = $searcher.Search("IsInstalled=0 and Type='Driver'")
    $list = @()
    foreach ($u in $result.Updates) {
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
    300000
  )
  return asArray(raw).filter((u) => u && u.title)
}

export async function installDriverUpdates(ids: string[]): Promise<WuInstallResult> {
  if (ids.length === 0) return { ok: false, rebootRequired: false, installed: 0, message: 'Aucun pilote sélectionné.' }
  const idFilter = ids.map((i) => `'${i.replace(/'/g, '')}'`).join(',')
  try {
    const raw = await psJson<{ installed: number; reboot: boolean; status: string }>(
      `
      $wanted = @(${idFilter})
      $session = New-Object -ComObject Microsoft.Update.Session
      $searcher = $session.CreateUpdateSearcher()
      $result = $searcher.Search("IsInstalled=0 and Type='Driver'")
      $coll = New-Object -ComObject Microsoft.Update.UpdateColl
      foreach ($u in $result.Updates) {
        if ($wanted -contains $u.Identity.UpdateID) {
          if (-not $u.EulaAccepted) { $u.AcceptEula() }
          $coll.Add($u) | Out-Null
        }
      }
      if ($coll.Count -eq 0) {
        ConvertTo-Json @{ installed = 0; reboot = $false; status = 'Aucun pilote correspondant.' }
        return
      }
      $downloader = $session.CreateUpdateDownloader()
      $downloader.Updates = $coll
      $downloader.Download() | Out-Null
      $installer = $session.CreateUpdateInstaller()
      $installer.Updates = $coll
      $r = $installer.Install()
      ConvertTo-Json @{ installed = $coll.Count; reboot = [bool]$r.RebootRequired; status = "Code resultat: $($r.ResultCode)" }
      `,
      1800000
    )
    if (!raw) return { ok: false, rebootRequired: false, installed: 0, message: 'Réponse vide de Windows Update.' }
    return {
      ok: raw.installed > 0,
      rebootRequired: raw.reboot,
      installed: raw.installed,
      message: raw.status
    }
  } catch (e) {
    return {
      ok: false,
      rebootRequired: false,
      installed: 0,
      message:
        'Échec (droits administrateur requis pour installer des pilotes). ' + (e as Error).message
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

    const res = await fetch(url)
    if (!res.ok || !res.body) return { ok: false, message: `Téléchargement échoué (HTTP ${res.status}).` }

    const total = Number(res.headers.get('content-length') || 0)
    const dest = join(app.getPath('temp'), `pkaizen-nvidia-${Date.now()}.exe`)
    let done = 0
    const reader = Readable.fromWeb(res.body as never)
    reader.on('data', (chunk: Buffer) => {
      done += chunk.length
      if (total > 0 && onProgress) onProgress(Math.round((done / total) * 100))
    })
    await pipeline(reader, createWriteStream(dest))

    const err = await shell.openPath(dest)
    if (err) return { ok: false, message: `Impossible de lancer l'installeur : ${err}` }
    return {
      ok: true,
      message: 'Installeur NVIDIA officiel lancé — suis les étapes (Installation express recommandée).'
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
        ? 'Intel DSA installé — ouvre-le, il détecte et installe tous les pilotes Intel officiels.'
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

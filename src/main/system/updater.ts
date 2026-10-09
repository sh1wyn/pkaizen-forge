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

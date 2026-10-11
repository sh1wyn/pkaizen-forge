import { psJson, ps, asArray } from './powershell'
import { T } from './i18n'
import type { BrowserReport, ActionResult } from '../../shared/types'

export function identifyBrowser(value: string, command = ''): string | null {
  const executable = command.match(/(?:^|[\\/"\s])(librewolf|vivaldi|brave|msedge|firefox|chrome|opera)\.exe(?:["\s]|$)/i)?.[1]?.toLowerCase()
  if (executable === 'opera') return /opera[\s_-]*gx/i.test(command + value) ? 'operagx' : 'opera'
  if (executable) return executable === 'msedge' ? 'edge' : executable
  const name = value.toLowerCase()
  if (/librewolf/.test(name)) return 'librewolf'
  if (/vivaldi/.test(name)) return 'vivaldi'
  if (/brave/.test(name)) return 'brave'
  if (/firefox/.test(name)) return 'firefox'
  if (/msedge|microsoft edge/.test(name)) return 'edge'
  if (/chrome/.test(name)) return 'chrome'
  if (/opera[\s_-]*gx/.test(name)) return 'operagx'
  if (/opera/.test(name)) return 'opera'
  return null
}

const PROCESS_MAP: Record<string, string> = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  brave: 'Brave',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
  librewolf: 'LibreWolf'
}

export async function getBrowserReport(): Promise<BrowserReport> {
  const raw = await psJson<{
    http: { progId: string; command: string }
    https: { progId: string; command: string }
    installed: string[] | string | null
    registrations: { name: string; scope: 'user' | 'machine'; identity: string }[] | null
    running: { name: string; ramMB: number }[] | { name: string; ramMB: number } | null
  }>(
    `
    $ErrorActionPreference='Stop'
    Add-Type @'
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public static class BrowserAssociation {
      [DllImport("Shlwapi.dll", CharSet = CharSet.Unicode)]
      public static extern int AssocQueryString(uint flags, uint kind, string association, string extra, StringBuilder output, ref uint length);
    }
'@
    function Read-Association([string]$protocol) {
      $progId = (Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\$protocol\\UserChoice" -ErrorAction SilentlyContinue).ProgId
      $buffer = New-Object System.Text.StringBuilder 32768
      [uint32]$length = $buffer.Capacity
      $status = [BrowserAssociation]::AssocQueryString(0x1000, 2, $protocol, $null, $buffer, [ref]$length)
      @{ progId = [string]$progId; command = if ($status -eq 0) { $buffer.ToString() } else { '' } }
    }
    $http = Read-Association 'http'
    $https = Read-Association 'https'
    $installed = @()
    foreach ($root in @('HKLM:\\SOFTWARE\\Clients\\StartMenuInternet', 'HKCU:\\SOFTWARE\\Clients\\StartMenuInternet', 'HKLM:\\SOFTWARE\\WOW6432Node\\Clients\\StartMenuInternet')) {
      Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object { $installed += $_.PSChildName }
    }
    $registrations = @()
    foreach ($hive in @('HKCU', 'HKLM')) {
      foreach ($registeredPath in @('SOFTWARE\\RegisteredApplications', 'SOFTWARE\\WOW6432Node\\RegisteredApplications')) {
        $registered = Get-ItemProperty "\${hive}:\\$registeredPath" -ErrorAction SilentlyContinue
        if (-not $registered) { continue }
        foreach ($entry in $registered.PSObject.Properties) {
          if ($entry.Name -like 'PS*' -or $entry.Value -isnot [string]) { continue }
          $capabilities = "\${hive}:\\$($entry.Value)"
          $urls = Get-ItemProperty "$capabilities\\URLAssociations" -ErrorAction SilentlyContinue
          if (-not $urls.http -and -not $urls.https) { continue }
          $identity = "$($entry.Name) $($urls.http) $($urls.https)"
          $installed += $identity
          $registrations += @{ name = $entry.Name; identity = $identity; scope = if ($hive -eq 'HKCU') { 'user' } else { 'machine' } }
        }
      }
    }
    $procs = @('chrome','msedge','firefox','brave','opera','vivaldi','librewolf')
    $running = @()
    foreach ($p in $procs) {
      $list = Get-Process -Name $p -ErrorAction SilentlyContinue
      if ($list) {
        $ram = [math]::Round((($list | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 0)
        $running += @{ name = $p; ramMB = [int]$ram }
      }
    }
    ConvertTo-Json @{ http = $http; https = $https; installed = $installed; running = $running; registrations = @($registrations) } -Depth 4
    `,
    30000
  )

  if (!raw) throw new Error(T('Browser detection failed.', 'Détection des navigateurs impossible.'))
  const http = identifyBrowser(raw.http?.progId || '', raw.http?.command)
  const https = identifyBrowser(raw.https?.progId || '', raw.https?.command)
  const defaultBrowser = https || http

  const installedRaw = asArray(raw?.installed ?? null).map((s) => String(s).toLowerCase())
  const installed = new Set<string>()
  for (const name of installedRaw) {
    const browser = identifyBrowser(name)
    if (browser) installed.add(browser)
  }
  if (http) installed.add(http)
  if (https) installed.add(https)

  return {
    defaultBrowser,
    defaults: { http, https },
    registrations: asArray(raw.registrations).flatMap((entry) => {
      const id = identifyBrowser(entry.identity)
      return id ? [{ id, name: entry.name, scope: entry.scope }] : []
    }),
    installed: [...installed],
    running: asArray(raw?.running ?? null)
      .filter((r) => r && r.name)
      .map((r) => ({
        id: r.name === 'msedge' ? 'edge' : r.name,
        name: PROCESS_MAP[r.name] || r.name,
        ramMB: r.ramMB
      }))
  }
}

const WINGET_IDS: Record<string, string> = {
  brave: 'Brave.Brave',
  firefox: 'Mozilla.Firefox',
  vivaldi: 'Vivaldi.Vivaldi',
  librewolf: 'LibreWolf.LibreWolf'
}

export async function installBrowser(id: string): Promise<ActionResult> {
  if (!Object.prototype.hasOwnProperty.call(WINGET_IDS, id)) return { ok: false, message: 'Unknown browser.' }
  const wingetId = WINGET_IDS[id]
  if (!wingetId) return { ok: false, message: 'Unknown browser.' }
  try {
    await ps(
      `$ErrorActionPreference='Stop'; winget install --id ${wingetId} --source winget --exact --silent --accept-source-agreements --accept-package-agreements --disable-interactivity; if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "winget exit code: $LASTEXITCODE" }`,
      900000,
      true
    )
    const ok = (await getBrowserReport()).installed.includes(id)
    return {
      ok,
      message: ok
        ? T('Browser installed via winget (official source) ✔', 'Navigateur installé via winget (source officielle) ✔')
        : T('Browser installation could not be confirmed.', 'Installation du navigateur non confirmée.')
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function openBrowserDefaults(id: string): Promise<ActionResult> {
  try {
    const report = await getBrowserReport()
    if (!report.installed.includes(id)) return { ok: false, message: T('Browser not detected.', 'Navigateur non détecté.') }
    const { release } = await import('os')
    const { shell } = await import('electron')
    const registration = report.registrations?.find((entry) => entry.id === id)
    const build = Number(release().split('.')[2])
    const target = registration && build >= 22000
      ? `ms-settings:defaultapps?registeredApp${registration.scope === 'user' ? 'User' : 'Machine'}=${encodeURIComponent(registration.name)}`
      : 'ms-settings:defaultapps'
    await shell.openExternal(target)
    return { ok: true, message: T('Confirm your choice in Windows Settings.', 'Confirme ton choix dans les paramètres Windows.') }
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
}

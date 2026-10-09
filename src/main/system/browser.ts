import { psJson, ps, asArray } from './powershell'
import { T } from './i18n'
import type { BrowserReport, ActionResult } from '../../shared/types'

const PROGID_MAP: Record<string, string> = {
  ChromeHTML: 'chrome',
  MSEdgeHTM: 'edge',
  BraveHTML: 'brave',
  OperaStable: 'opera',
  'OperaGX Stable': 'operagx',
  VivaldiHTM: 'vivaldi',
  LibreWolfURL: 'librewolf'
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
    progId: string
    installed: string[] | string | null
    running: { name: string; ramMB: number }[] | { name: string; ramMB: number } | null
  }>(
    `
    $progId = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice' -ErrorAction SilentlyContinue).ProgId
    $installed = @()
    foreach ($root in @('HKLM:\\SOFTWARE\\Clients\\StartMenuInternet', 'HKCU:\\SOFTWARE\\Clients\\StartMenuInternet')) {
      Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object { $installed += $_.PSChildName }
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
    ConvertTo-Json @{ progId = [string]$progId; installed = $installed; running = $running } -Depth 4
    `,
    30000
  )

  let defaultBrowser: string | null = null
  const progId = raw?.progId || ''
  if (progId.startsWith('FirefoxURL')) defaultBrowser = 'firefox'
  else if (PROGID_MAP[progId]) defaultBrowser = PROGID_MAP[progId]
  else if (progId.includes('Edge')) defaultBrowser = 'edge'
  else if (progId) defaultBrowser = progId

  const installedRaw = asArray(raw?.installed ?? null).map((s) => String(s).toLowerCase())
  const installed = new Set<string>()
  for (const name of installedRaw) {
    if (name.includes('chrome')) installed.add('chrome')
    else if (name.includes('edge')) installed.add('edge')
    else if (name.includes('firefox')) installed.add('firefox')
    else if (name.includes('brave')) installed.add('brave')
    else if (name.includes('opera')) installed.add('opera')
    else if (name.includes('vivaldi')) installed.add('vivaldi')
    else if (name.includes('librewolf')) installed.add('librewolf')
  }
  installed.add('edge') // toujours présent sur Windows

  return {
    defaultBrowser,
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
  librewolf: 'LibreWolf.LibreWolf'
}

export async function installBrowser(id: string): Promise<ActionResult> {
  const wingetId = WINGET_IDS[id]
  if (!wingetId) return { ok: false, message: 'Unknown browser.' }
  try {
    const out = await ps(
      `winget install --id ${wingetId} --exact --silent --accept-source-agreements --accept-package-agreements --disable-interactivity`,
      900000
    )
    const ok = /Successfully installed|installé avec succès|already installed|déjà installé/i.test(out)
    return {
      ok,
      message: ok
        ? T('Browser installed via winget (official source) ✔', 'Navigateur installé via winget (source officielle) ✔')
        : out.split(/\r?\n/).slice(-3).join(' ')
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

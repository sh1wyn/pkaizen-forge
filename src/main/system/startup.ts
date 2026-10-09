import { psJson, ps, asArray } from './powershell'
import type { StartupItem, ActionResult } from '../../shared/types'

const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const BACKUP_KEY = 'HKCU:\\Software\\PkaizenForge\\DisabledRun'

interface RawItem {
  name: string
  command: string
  scope: string
  enabled: boolean
}

export async function getStartupItems(): Promise<StartupItem[]> {
  const raw = await psJson<RawItem | RawItem[]>(
    `
    $items = @()
    $read = {
      param($path, $scope, $enabled)
      $p = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
      if ($p) {
        $p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
          [pscustomobject]@{ name = $_.Name; command = [string]$_.Value; scope = $scope; enabled = $enabled }
        }
      }
    }
    $items += & $read '${RUN_KEY}' 'user' $true
    $items += & $read '${BACKUP_KEY}' 'user' $false
    $items += & $read 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'machine' $true
    $startupDir = [Environment]::GetFolderPath('Startup')
    Get-ChildItem -LiteralPath $startupDir -File -ErrorAction SilentlyContinue | ForEach-Object {
      $items += [pscustomobject]@{ name = $_.BaseName; command = $_.FullName; scope = 'folder'; enabled = $true }
    }
    ConvertTo-Json -InputObject @($items) -Depth 3
    `,
    30000
  )
  return asArray(raw)
    .filter((i) => i && i.name)
    .map((i) => ({
      name: i.name,
      command: i.command,
      scope: i.scope as StartupItem['scope'],
      enabled: i.enabled,
      canToggle: i.scope === 'user'
    }))
}

export async function setStartupEnabled(name: string, enable: boolean): Promise<ActionResult> {
  const from = enable ? BACKUP_KEY : RUN_KEY
  const to = enable ? RUN_KEY : BACKUP_KEY
  try {
    const out = await ps(
      `
      $v = (Get-ItemProperty -Path '${from}' -ErrorAction SilentlyContinue).'${name.replace(/'/g, "''")}'
      if ($null -ne $v) {
        New-Item -Path '${to}' -Force | Out-Null
        Set-ItemProperty -Path '${to}' -Name '${name.replace(/'/g, "''")}' -Value $v
        Remove-ItemProperty -Path '${from}' -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue
        'OK'
      } else { 'NOTFOUND' }
      `,
      15000
    )
    if (out.includes('OK')) return { ok: true }
    return { ok: false, message: 'Élément introuvable.' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

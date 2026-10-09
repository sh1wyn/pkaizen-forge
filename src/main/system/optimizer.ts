import { ps } from './powershell'
import type { TweakInfo, TweakState, ActionResult } from '../../shared/types'

interface Tweak extends TweakInfo {
  apply: string
  revert: string
  /** Script PS qui écrit "1" si le tweak est appliqué */
  check: string
}

// GUID des plans d'alimentation Windows
const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'
const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61'

// Tous les tweaks sont réversibles, sans toucher Secure Boot / TPM / VBS /
// pilotes kernel — donc 100% compatibles Vanguard, EAC, BattlEye, Faceit.
const TWEAKS: Tweak[] = [
  {
    id: 'power-high',
    name: 'Plan d\u2019alimentation Performances élevées',
    description:
      'Active le plan Performances élevées (ou Ultimate si dispo) : le CPU ne descend plus en fréquence pendant le jeu. Gain FPS/latence réel, surtout sur les CPU qui throttle.',
    category: 'performance',
    needsAdmin: false,
    laptopWarning: true,
    needsReboot: false,
    recommended: true,
    apply: `
      $ult = powercfg /list | Select-String '${ULTIMATE}'
      if (-not $ult) { powercfg -duplicatescheme ${ULTIMATE} 2>$null | Out-Null }
      $ult = powercfg /list | Select-String '${ULTIMATE}'
      if ($ult) { powercfg /setactive ${ULTIMATE} } else { powercfg /setactive ${HIGH_PERF} }`,
    revert: `powercfg /setactive ${BALANCED}`,
    check: `
      $a = powercfg /getactivescheme
      if ($a -match '${HIGH_PERF}' -or $a -match '${ULTIMATE}') { '1' }`
  },
  {
    id: 'gamedvr-off',
    name: 'Désactiver Xbox Game DVR (enregistrement en arrière-plan)',
    description:
      'Coupe l\u2019enregistrement d\u2019écran permanent de Windows qui bouffe des FPS dans tous les jeux. N\u2019affecte pas Game Bar ni les captures manuelles.',
    category: 'gaming',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `
      New-Item -Path 'HKCU:\\System\\GameConfigStore' -Force | Out-Null
      Set-ItemProperty 'HKCU:\\System\\GameConfigStore' -Name 'GameDVR_Enabled' -Value 0 -Type DWord
      New-Item -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Force | Out-Null
      Set-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name 'AppCaptureEnabled' -Value 0 -Type DWord`,
    revert: `
      Set-ItemProperty 'HKCU:\\System\\GameConfigStore' -Name 'GameDVR_Enabled' -Value 1 -Type DWord
      Set-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name 'AppCaptureEnabled' -Value 1 -Type DWord`,
    check: `
      $v = (Get-ItemProperty 'HKCU:\\System\\GameConfigStore' -Name 'GameDVR_Enabled' -ErrorAction SilentlyContinue).GameDVR_Enabled
      if ($v -eq 0) { '1' }`
  },
  {
    id: 'gamemode-on',
    name: 'Activer le Mode Jeu Windows',
    description:
      'Windows priorise le jeu au premier plan (CPU/GPU) et bloque Windows Update pendant que tu joues. Recommandé par Microsoft, NVIDIA et AMD.',
    category: 'gaming',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `
      New-Item -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Force | Out-Null
      Set-ItemProperty 'HKCU:\\Software\\Microsoft\\GameBar' -Name 'AllowAutoGameMode' -Value 1 -Type DWord
      Set-ItemProperty 'HKCU:\\Software\\Microsoft\\GameBar' -Name 'AutoGameModeEnabled' -Value 1 -Type DWord`,
    revert: `
      Set-ItemProperty 'HKCU:\\Software\\Microsoft\\GameBar' -Name 'AutoGameModeEnabled' -Value 0 -Type DWord`,
    check: `
      $p = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\GameBar' -ErrorAction SilentlyContinue
      if ($null -eq $p.AutoGameModeEnabled -or $p.AutoGameModeEnabled -eq 1) { '1' }`
  },
  {
    id: 'hags-on',
    name: 'Planification GPU à accélération matérielle (HAGS)',
    description:
      'Le GPU gère sa propre file d\u2019attente : réduit la latence de rendu sur les GPU récents (NVIDIA 10xx+, AMD 5000+). Nécessite un redémarrage.',
    category: 'latence',
    needsAdmin: true,
    laptopWarning: false,
    needsReboot: true,
    recommended: true,
    apply: `
      Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'HwSchMode' -Value 2 -Type DWord`,
    revert: `
      Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'HwSchMode' -Value 1 -Type DWord`,
    check: `
      $v = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'HwSchMode' -ErrorAction SilentlyContinue).HwSchMode
      if ($v -eq 2) { '1' }`
  },
  {
    id: 'mouse-accel-off',
    name: 'Désactiver l\u2019accélération souris',
    description:
      'Précision du pointeur désactivée : la souris devient 1:1, indispensable pour viser dans les FPS. Aucun impact perf, pur gain de précision.',
    category: 'latence',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `
      Set-ItemProperty 'HKCU:\\Control Panel\\Mouse' -Name 'MouseSpeed' -Value '0'
      Set-ItemProperty 'HKCU:\\Control Panel\\Mouse' -Name 'MouseThreshold1' -Value '0'
      Set-ItemProperty 'HKCU:\\Control Panel\\Mouse' -Name 'MouseThreshold2' -Value '0'`,
    revert: `
      Set-ItemProperty 'HKCU:\\Control Panel\\Mouse' -Name 'MouseSpeed' -Value '1'
      Set-ItemProperty 'HKCU:\\Control Panel\\Mouse' -Name 'MouseThreshold1' -Value '6'
      Set-ItemProperty 'HKCU:\\Control Panel\\Mouse' -Name 'MouseThreshold2' -Value '10'`,
    check: `
      $v = (Get-ItemProperty 'HKCU:\\Control Panel\\Mouse' -Name 'MouseSpeed' -ErrorAction SilentlyContinue).MouseSpeed
      if ($v -eq '0') { '1' }`
  },
  {
    id: 'network-latency',
    name: 'Réduire la latence réseau (jeux en ligne)',
    description:
      'Augmente la priorité réseau des jeux et désactive la limitation réseau de Windows (NetworkThrottlingIndex). Ping plus stable en jeu, aucun impact qualité.',
    category: 'latence',
    needsAdmin: true,
    laptopWarning: false,
    needsReboot: true,
    recommended: true,
    apply: `
      $k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
      Set-ItemProperty $k -Name 'NetworkThrottlingIndex' -Value 0xffffffff -Type DWord
      Set-ItemProperty $k -Name 'SystemResponsiveness' -Value 10 -Type DWord
      $g = "$k\\Tasks\\Games"
      Set-ItemProperty $g -Name 'GPU Priority' -Value 8 -Type DWord
      Set-ItemProperty $g -Name 'Priority' -Value 6 -Type DWord
      Set-ItemProperty $g -Name 'Scheduling Category' -Value 'High' -Type String`,
    revert: `
      $k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
      Set-ItemProperty $k -Name 'NetworkThrottlingIndex' -Value 10 -Type DWord
      Set-ItemProperty $k -Name 'SystemResponsiveness' -Value 20 -Type DWord
      $g = "$k\\Tasks\\Games"
      Set-ItemProperty $g -Name 'GPU Priority' -Value 8 -Type DWord
      Set-ItemProperty $g -Name 'Priority' -Value 2 -Type DWord
      Set-ItemProperty $g -Name 'Scheduling Category' -Value 'Medium' -Type String`,
    check: `
      $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -ErrorAction SilentlyContinue).NetworkThrottlingIndex
      if ($v -eq 0xffffffff -or $v -eq -1) { '1' }`
  },
  {
    id: 'prio-foreground',
    name: 'Priorité CPU au premier plan (jeu actif)',
    description:
      'Règle Win32PrioritySeparation sur 38 : Windows donne des tranches CPU plus longues au programme actif — ton jeu. Tweak classique des configs e-sport, réversible.',
    category: 'performance',
    needsAdmin: true,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Value 38 -Type DWord`,
    revert: `Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Value 2 -Type DWord`,
    check: `
      $v = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -ErrorAction SilentlyContinue).Win32PrioritySeparation
      if ($v -eq 38) { '1' }`
  },
  {
    id: 'power-throttling-off',
    name: 'Désactiver le Power Throttling',
    description:
      'Empêche Windows de brider les processus en arrière-plan (Discord, OBS, launcher) pendant que tu joues — évite les micro-freezes. Sur portable : consomme plus de batterie.',
    category: 'performance',
    needsAdmin: true,
    laptopWarning: true,
    needsReboot: true,
    recommended: false,
    apply: `
      New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -Force | Out-Null
      Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -Name 'PowerThrottlingOff' -Value 1 -Type DWord`,
    revert: `Remove-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -Name 'PowerThrottlingOff' -ErrorAction SilentlyContinue`,
    check: `
      $v = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -Name 'PowerThrottlingOff' -ErrorAction SilentlyContinue).PowerThrottlingOff
      if ($v -eq 1) { '1' }`
  },
  {
    id: 'background-apps-off',
    name: 'Couper les applis UWP en arrière-plan',
    description:
      'Empêche les applis du Microsoft Store de tourner en fond (météo, actus…). Gain réel sur les petits CPU et les laptops. Les notifications de ces applis seront coupées.',
    category: 'gaming',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `
      New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Force | Out-Null
      Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Name 'GlobalUserDisabled' -Value 1 -Type DWord`,
    revert: `Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Name 'GlobalUserDisabled' -Value 0 -Type DWord`,
    check: `
      $v = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Name 'GlobalUserDisabled' -ErrorAction SilentlyContinue).GlobalUserDisabled
      if ($v -eq 1) { '1' }`
  },
  {
    id: 'stickykeys-hotkey-off',
    name: 'Désactiver le raccourci Touches rémanentes',
    description:
      'Fini la popup « Touches rémanentes » quand tu spammes Shift en pleine partie. Zéro impact perf, purement anti-rage.',
    category: 'gaming',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `Set-ItemProperty 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' -Name 'Flags' -Value '506'`,
    revert: `Set-ItemProperty 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' -Name 'Flags' -Value '510'`,
    check: `
      $v = (Get-ItemProperty 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' -Name 'Flags' -ErrorAction SilentlyContinue).Flags
      if ($v -eq '506') { '1' }`
  },
  {
    id: 'menu-delay',
    name: 'Interface Windows plus réactive',
    description:
      'Réduit le délai d\u2019ouverture des menus (400 ms → 150 ms). Le PC paraît instantanément plus rapide, zéro perte de qualité.',
    category: 'systeme',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Value '150'`,
    revert: `Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Value '400'`,
    check: `
      $v = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -ErrorAction SilentlyContinue).MenuShowDelay
      if ([int]$v -le 150) { '1' }`
  },
  {
    id: 'storage-sense',
    name: 'Activer l\u2019Assistant Stockage',
    description:
      'Windows nettoie automatiquement les fichiers temporaires et la corbeille. Idéal pour les PC portables avec peu de stockage.',
    category: 'systeme',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `
      $k = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy'
      New-Item -Path $k -Force | Out-Null
      Set-ItemProperty $k -Name '01' -Value 1 -Type DWord`,
    revert: `
      $k = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy'
      Set-ItemProperty $k -Name '01' -Value 0 -Type DWord`,
    check: `
      $v = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy' -Name '01' -ErrorAction SilentlyContinue).'01'
      if ($v -eq 1) { '1' }`
  },
  {
    id: 'telemetry-min',
    name: 'Réduire la télémétrie Windows',
    description:
      'Passe la collecte de données au minimum autorisé. Moins de tâches de fond = plus de CPU dispo. Réversible à tout moment.',
    category: 'systeme',
    needsAdmin: true,
    laptopWarning: false,
    needsReboot: false,
    recommended: true,
    apply: `
      $k = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection'
      New-Item -Path $k -Force | Out-Null
      Set-ItemProperty $k -Name 'AllowTelemetry' -Value 1 -Type DWord`,
    revert: `
      Remove-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name 'AllowTelemetry' -ErrorAction SilentlyContinue`,
    check: `
      $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name 'AllowTelemetry' -ErrorAction SilentlyContinue).AllowTelemetry
      if ($v -eq 1) { '1' }`
  },
  {
    id: 'hibernate-off',
    name: 'Désactiver la veille prolongée (desktop)',
    description:
      'Libère plusieurs Go sur le disque (hiberfil.sys). Déconseillé sur portable : tu perds la mise en veille prolongée sur batterie faible.',
    category: 'avance',
    needsAdmin: true,
    laptopWarning: true,
    needsReboot: false,
    recommended: false,
    apply: `powercfg /hibernate off`,
    revert: `powercfg /hibernate on`,
    check: `
      $v = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power' -Name 'HibernateEnabled' -ErrorAction SilentlyContinue).HibernateEnabled
      if ($v -eq 0) { '1' }`
  },
  {
    id: 'visualfx-balanced',
    name: 'Animations allégées (garde la qualité visuelle)',
    description:
      'Désactive uniquement les animations inutiles (fenêtres, barre des tâches) en gardant les polices lissées et les miniatures. UI plus réactive sans look dégradé.',
    category: 'avance',
    needsAdmin: false,
    laptopWarning: false,
    needsReboot: false,
    recommended: false,
    apply: `
      Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name 'UserPreferencesMask' -Value ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) -Type Binary
      Set-ItemProperty 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -Name 'MinAnimate' -Value '0'
      New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Force | Out-Null
      Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name 'VisualFXSetting' -Value 3 -Type DWord`,
    revert: `
      Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name 'UserPreferencesMask' -Value ([byte[]](0x9E,0x3E,0x07,0x80,0x12,0x00,0x00,0x00)) -Type Binary
      Set-ItemProperty 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -Name 'MinAnimate' -Value '1'
      Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name 'VisualFXSetting' -Value 0 -Type DWord`,
    check: `
      $v = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -Name 'MinAnimate' -ErrorAction SilentlyContinue).MinAnimate
      if ($v -eq '0') { '1' }`
  }
]

export function listTweaks(): TweakInfo[] {
  return TWEAKS.map(({ apply: _a, revert: _r, check: _c, ...info }) => info)
}

export async function getTweakStates(): Promise<TweakState[]> {
  const results = await Promise.all(
    TWEAKS.map(async (t) => {
      try {
        const out = await ps(t.check, 15000)
        return { id: t.id, applied: out.includes('1'), available: true }
      } catch {
        return { id: t.id, applied: false, available: false }
      }
    })
  )
  return results
}

export async function applyTweak(id: string): Promise<ActionResult> {
  const t = TWEAKS.find((x) => x.id === id)
  if (!t) return { ok: false, message: 'Tweak inconnu' }
  try {
    await ps(t.apply, 30000)
    const out = await ps(t.check, 15000)
    if (!out.includes('1')) {
      return {
        ok: false,
        message: t.needsAdmin
          ? 'Échec — relance OptiForge en administrateur pour ce tweak.'
          : 'Le tweak n\u2019a pas pu être vérifié.'
      }
    }
    return { ok: true, message: t.needsReboot ? 'Appliqué — redémarrage requis pour prendre effet.' : 'Appliqué.' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function revertTweak(id: string): Promise<ActionResult> {
  const t = TWEAKS.find((x) => x.id === id)
  if (!t) return { ok: false, message: 'Tweak inconnu' }
  try {
    await ps(t.revert, 30000)
    return { ok: true, message: 'Valeurs Windows par défaut restaurées.' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

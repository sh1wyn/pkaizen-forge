import { ps, psJson } from './powershell'
import { T } from './i18n'
import type { TweakInfo, TweakState, ActionResult, TweakRelevance } from '../../shared/types'

interface Tweak extends TweakInfo {
  nameEn: string
  descriptionEn: string
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
    nameEn: 'High Performance power plan',
    description:
      'Active le plan Performances élevées (ou Ultimate si dispo) : le CPU ne descend plus en fréquence pendant le jeu. Gain FPS/latence réel, surtout sur les CPU qui throttle.',
    descriptionEn:
      'Enables the High Performance plan (or Ultimate if available): the CPU no longer downclocks while gaming. Real FPS/latency gain, especially on throttling CPUs.',
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
    nameEn: 'Disable Xbox Game DVR (background recording)',
    description:
      'Coupe l\u2019enregistrement d\u2019écran permanent de Windows qui bouffe des FPS dans tous les jeux. N\u2019affecte pas Game Bar ni les captures manuelles.',
    descriptionEn:
      'Stops Windows\u2019 always-on screen recording that eats FPS in every game. Does not affect Game Bar or manual captures.',
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
    nameEn: 'Enable Windows Game Mode',
    description:
      'Windows priorise le jeu au premier plan (CPU/GPU) et bloque Windows Update pendant que tu joues. Recommandé par Microsoft, NVIDIA et AMD.',
    descriptionEn:
      'Windows prioritizes the foreground game (CPU/GPU) and blocks Windows Update while you play. Recommended by Microsoft, NVIDIA and AMD.',
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
    nameEn: 'Hardware-Accelerated GPU Scheduling (HAGS)',
    description:
      'Le GPU gère sa propre file d\u2019attente : réduit la latence de rendu sur les GPU récents (NVIDIA 10xx+, AMD 5000+). Nécessite un redémarrage.',
    descriptionEn:
      'The GPU manages its own queue: reduces render latency on recent GPUs (NVIDIA 10xx+, AMD 5000+). Requires a restart.',
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
    nameEn: 'Disable mouse acceleration',
    description:
      'Précision du pointeur désactivée : la souris devient 1:1, indispensable pour viser dans les FPS. Aucun impact perf, pur gain de précision.',
    descriptionEn:
      'Pointer precision off: the mouse becomes 1:1 — essential for aiming in FPS games. No perf cost, pure precision gain.',
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
    nameEn: 'Reduce network latency (online games)',
    description:
      'Augmente la priorité réseau des jeux et désactive la limitation réseau de Windows (NetworkThrottlingIndex). Ping plus stable en jeu, aucun impact qualité.',
    descriptionEn:
      'Raises game network priority and disables Windows network throttling (NetworkThrottlingIndex). More stable in-game ping, zero quality impact.',
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
      if ($v -eq [uint32]::MaxValue -or $v -eq -1) { '1' }`
  },
  {
    id: 'prio-foreground',
    name: 'Priorité CPU au premier plan (jeu actif)',
    nameEn: 'Foreground CPU priority (active game)',
    description:
      'Règle Win32PrioritySeparation sur 38 : Windows donne des tranches CPU plus longues au programme actif — ton jeu. Tweak classique des configs e-sport, réversible.',
    descriptionEn:
      'Sets Win32PrioritySeparation to 38: Windows gives longer CPU slices to the active program — your game. Classic esports tweak, reversible.',
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
    nameEn: 'Disable Power Throttling',
    description:
      'Empêche Windows de brider les processus en arrière-plan (Discord, OBS, launcher) pendant que tu joues — évite les micro-freezes. Sur portable : consomme plus de batterie.',
    descriptionEn:
      'Stops Windows from throttling background processes (Discord, OBS, launchers) while you play — prevents micro-freezes. On laptops: uses more battery.',
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
    nameEn: 'Stop UWP background apps',
    description:
      'Empêche les applis du Microsoft Store de tourner en fond (météo, actus…). Gain réel sur les petits CPU et les laptops. Les notifications de ces applis seront coupées.',
    descriptionEn:
      'Prevents Microsoft Store apps from running in the background (weather, news…). Real gain on small CPUs and laptops. Their notifications will be muted.',
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
    nameEn: 'Disable Sticky Keys shortcut',
    description:
      'Fini la popup « Touches rémanentes » quand tu spammes Shift en pleine partie. Zéro impact perf, purement anti-rage.',
    descriptionEn:
      'No more Sticky Keys popup when you spam Shift mid-game. Zero perf impact, purely anti-rage.',
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
    nameEn: 'Snappier Windows UI',
    description:
      'Réduit le délai d\u2019ouverture des menus (400 ms → 150 ms). Le PC paraît instantanément plus rapide, zéro perte de qualité.',
    descriptionEn:
      'Reduces menu open delay (400 ms → 150 ms). The PC instantly feels faster, zero quality loss.',
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
    nameEn: 'Enable Storage Sense',
    description:
      'Windows nettoie automatiquement les fichiers temporaires et la corbeille. Idéal pour les PC portables avec peu de stockage.',
    descriptionEn:
      'Windows automatically cleans temp files and the recycle bin. Ideal for laptops with limited storage.',
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
    nameEn: 'Reduce Windows telemetry',
    description:
      'Passe la collecte de données au minimum autorisé. Moins de tâches de fond = plus de CPU dispo. Réversible à tout moment.',
    descriptionEn:
      'Sets data collection to the minimum allowed. Fewer background tasks = more CPU available. Reversible anytime.',
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
    nameEn: 'Disable hibernation (desktop)',
    description:
      'Libère plusieurs Go sur le disque (hiberfil.sys). Déconseillé sur portable : tu perds la mise en veille prolongée sur batterie faible.',
    descriptionEn:
      'Frees several GB on disk (hiberfil.sys). Not recommended on laptops: you lose hibernation on low battery.',
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
    nameEn: 'Lighter animations (keeps visual quality)',
    description:
      'Désactive uniquement les animations inutiles (fenêtres, barre des tâches) en gardant les polices lissées et les miniatures. UI plus réactive sans look dégradé.',
    descriptionEn:
      'Disables only useless animations (windows, taskbar) while keeping font smoothing and thumbnails. Snappier UI without a degraded look.',
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
  return TWEAKS.map(({ apply: _a, revert: _r, check: _c, nameEn, descriptionEn, ...info }) => ({
    ...info,
    name: T(nameEn, info.name),
    description: T(descriptionEn, info.description)
  }))
}

export async function getTweakStates(): Promise<TweakState[]> {
  // Un seul process PowerShell pour les 15 checks (au lieu de 15 en parallèle).
  const checks = TWEAKS.map((t, i) => `$o${i} = & { ${t.check} }\n$r['${t.id}'] = ("$o${i}" -match '1')`)
  const script = `$r = @{}\n${checks.join('\n')}\nConvertTo-Json $r`
  try {
    const raw = await psJson<Record<string, boolean>>(script, 60000)
    if (!raw) throw new Error('empty')
    return TWEAKS.map((t) => ({ id: t.id, applied: raw[t.id] === true, available: t.id in raw }))
  } catch {
    return TWEAKS.map((t) => ({ id: t.id, applied: false, available: false }))
  }
}

export async function applyTweak(id: string): Promise<ActionResult> {
  const t = TWEAKS.find((x) => x.id === id)
  if (!t) return { ok: false, message: 'Tweak inconnu' }
  try {
    await ps(`$ErrorActionPreference='Stop'; $LASTEXITCODE=0; ${t.apply}
      if ($LASTEXITCODE -ne 0) { throw "Windows command failed (exit $LASTEXITCODE)" }`, 30000, true)
    const out = await ps(t.check, 15000, true)
    if (out.trim() !== '1') {
      return {
        ok: false,
        message: T(
          'Windows did not retain the requested setting. Check device support and system policies; administrator rights alone may not be sufficient.',
          'Windows n’a pas conservé le réglage demandé. Vérifie la compatibilité du matériel et les stratégies système ; les droits administrateur ne suffisent pas toujours.'
        )
      }
    }
    return { ok: true, message: t.needsReboot ? T('Applied — restart required to take effect.', 'Appliqué — redémarrage requis pour prendre effet.') : T('Applied.', 'Appliqué.') }
  } catch (e) {
    return { ok: false, message: `${T(t.nameEn, t.name)}: ${(e as Error).message}` }
  }
}

export async function revertTweak(id: string): Promise<ActionResult> {
  const t = TWEAKS.find((x) => x.id === id)
  if (!t) return { ok: false, message: 'Tweak inconnu' }
  try {
    await ps(`$ErrorActionPreference='Stop'; $LASTEXITCODE=0; ${t.revert}
      if ($LASTEXITCODE -ne 0) { throw "Windows command failed (exit $LASTEXITCODE)" }`, 30000, true)
    return { ok: true, message: T('Windows default values restored.', 'Valeurs Windows par défaut restaurées.') }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

/** Évalue l'utilité réelle de chaque tweak SUR CETTE MACHINE précise. */
export async function getTweakRelevance(): Promise<TweakRelevance[]> {
  const { getSystemReport } = await import('./sysinfo')
  const r = await getSystemReport()
  const lowCpu = r.cpu.physicalCores < 6
  const lowRam = r.ram.totalGB < 15.5
  const diskFull = r.volumes.some((v) => v.mount.toUpperCase().startsWith('C') && v.usePercent >= 85)
  const gpu = r.gpus.map((g) => `${g.vendor} ${g.model}`).join(' ').toLowerCase()
  const hasModernGpu = /rtx|gtx 1[06-9]|gtx [2-9]|radeon rx [5-9]|arc/i.test(gpu)

  const rel: TweakRelevance[] = [
    {
      id: 'power-high',
      impact: r.isLaptop ? 'medium' : 'high',
      reason: r.isLaptop
        ? T(
            'Useful when plugged in, but drains the battery faster — enable it only to play.',
            'Utile branché sur secteur, mais vide la batterie plus vite — active-le seulement pour jouer.'
          )
        : T(
            'Desktop PC: no downside, the CPU stays at full clock. Turn it on.',
            'PC fixe : aucun inconvénient, le CPU reste à pleine fréquence. À activer.'
          )
    },
    {
      id: 'gamedvr-off',
      impact: lowCpu || lowRam ? 'high' : 'medium',
      reason:
        lowCpu || lowRam
          ? T(
              `On your config (${r.cpu.physicalCores} cores / ${Math.round(r.ram.totalGB)} GB), the always-on recording is costly — real gain.`,
              `Sur ta config (${r.cpu.physicalCores} cœurs / ${Math.round(r.ram.totalGB)} Go), l\u2019enregistrement permanent coûte cher — gain réel.`
            )
          : T(
              'Your config is beefy, but it\u2019s still a few free % of FPS if you don\u2019t clip.',
              'Ta config est costaude, mais c\u2019est toujours quelques % de FPS gratuits si tu ne clippes pas.'
            )
    },
    {
      id: 'gamemode-on',
      impact: 'high',
      reason: T(
        'Recommended on every config: prioritizes the game and blocks Windows updates mid-match.',
        'Recommandé sur toutes les configs : priorise le jeu et bloque les MAJ Windows en pleine partie.'
      )
    },
    {
      id: 'hags-on',
      impact: hasModernGpu ? 'high' : 'low',
      reason: hasModernGpu
        ? T(
            'Your GPU is recent: HAGS reduces render latency and is required for NVIDIA/AMD Frame Generation.',
            'Ton GPU est récent : HAGS réduit la latence de rendu, et il est requis pour la Frame Generation NVIDIA/AMD.'
          )
        : T(
            'Your GPU is old or integrated: HAGS may bring nothing, or even be unstable. Worth testing.',
            'Ton GPU est ancien ou intégré : HAGS peut ne rien apporter, voire être instable. À tester.'
          )
    },
    {
      id: 'mouse-accel-off',
      impact: 'high',
      reason: T(
        'Essential for aiming in FPS games — your aim becomes repeatable. Zero cost.',
        'Indispensable pour viser dans les FPS — la visée devient reproductible. Aucun coût.'
      )
    },
    {
      id: 'network-latency',
      impact: 'medium',
      reason: T(
        'Useful for competitive online play: more stable ping under load. No effect offline.',
        'Utile pour le jeu en ligne compétitif : ping plus stable sous charge. Aucun effet hors ligne.'
      )
    },
    {
      id: 'prio-foreground',
      impact: lowCpu ? 'high' : 'medium',
      reason: lowCpu
        ? T(
            `With ${r.cpu.physicalCores} cores, prioritizing the active game avoids stutters when something runs behind.`,
            `Avec ${r.cpu.physicalCores} cœurs, donner la priorité au jeu actif évite les stutters quand un truc tourne derrière.`
          )
        : T(
            'Your CPU has headroom, but it helps when Discord/Chrome run in the background.',
            'Ton CPU a de la marge, mais ça aide quand Discord/Chrome tournent en fond.'
          )
    },
    {
      id: 'power-throttling-off',
      impact: r.isLaptop ? 'low' : 'medium',
      reason: r.isLaptop
        ? T(
            'On a laptop it clearly uses more battery — not recommended unless always plugged in.',
            'Sur portable ça consomme nettement plus de batterie — déconseillé sauf branché en permanence.'
          )
        : T(
            'Useful if you stream/record: OBS and Discord are no longer throttled in the background.',
            'Utile si tu streames/enregistres : OBS et Discord ne sont plus bridés en arrière-plan.'
          )
    },
    {
      id: 'background-apps-off',
      impact: lowRam || lowCpu ? 'high' : 'low',
      reason:
        lowRam || lowCpu
          ? T(
              'Your config directly benefits from every MB/cycle reclaimed from background Store apps.',
              'Ta config profite directement de chaque Mo/cycle récupéré sur les applis Store en fond.'
            )
          : T(
              'Comfortable config: the gain exists but is marginal for you.',
              'Config confortable : le gain existe mais il est marginal chez toi.'
            )
    },
    {
      id: 'stickykeys-hotkey-off',
      impact: 'medium',
      reason: T(
        'Zero perf, 100% comfort: never again the Shift popup mid-game.',
        'Zéro perf, 100% confort : plus jamais la popup Shift en pleine partie.'
      )
    },
    {
      id: 'menu-delay',
      impact: 'low',
      reason: T(
        'Pure Windows snappiness feel — no in-game FPS, but pleasant daily.',
        'Pur ressenti de réactivité Windows — aucun FPS en jeu, mais agréable au quotidien.'
      )
    },
    {
      id: 'storage-sense',
      impact: diskFull ? 'high' : 'low',
      reason: diskFull
        ? T(
            'Your C: drive is almost full — Storage Sense will spare you saturated-disk slowdowns.',
            'Ton disque C: est presque plein — l\u2019assistant stockage va t\u2019éviter les ralentissements du disque saturé.'
          )
        : T('Your disk has room: useful as prevention, not urgent.', 'Ton disque a de la place : utile en prévention, pas urgent.')
    },
    {
      id: 'telemetry-min',
      impact: lowCpu ? 'medium' : 'low',
      reason: lowCpu
        ? T('Fewer background tasks = more CPU available on a small config.', 'Moins de tâches de fond = CPU plus dispo sur une petite config.')
        : T(
            'Minimal perf gain on your config, mostly a privacy preference.',
            'Gain perf minime sur ta config, surtout une question de préférence vie privée.'
          )
    },
    {
      id: 'hibernate-off',
      impact: diskFull && !r.isLaptop ? 'high' : 'low',
      reason: r.isLaptop
        ? T('Not recommended on laptops: you lose low-battery protection.', 'Déconseillé sur portable : tu perds la protection batterie faible.')
        : diskFull
          ? T('Disk almost full: reclaiming several GB of hiberfil.sys is worth it.', 'Disque presque plein : récupérer plusieurs Go de hiberfil.sys vaut le coup.')
          : T('You have disk space, the gain is incidental.', 'Tu as de la place disque, le gain est accessoire.')
    },
    {
      id: 'visualfx-balanced',
      impact: lowRam || !hasModernGpu ? 'medium' : 'low',
      reason:
        lowRam || !hasModernGpu
          ? T(
              'On your config, lighter animations make the desktop clearly more responsive.',
              'Sur ta config, alléger les animations rend le bureau nettement plus réactif.'
            )
          : T(
              'Your machine handles animations effortlessly — a matter of taste.',
              'Ta machine encaisse les animations sans broncher — question de goût.'
            )
    }
  ]
  return rel
}

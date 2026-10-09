import si from 'systeminformation'
import { ps } from './powershell'
import { T } from './i18n'
import { scanDrivers, getGpuDriverStatus, getProblemDevices } from './drivers'
import type { Insight } from '../../shared/types'

/** Analyse orientée gamer : bottlenecks et points à corriger, du plus grave au moins grave. */
export async function getInsights(): Promise<Insight[]> {
  const insights: Insight[] = []
  const add = (i: Insight): void => {
    insights.push(i)
  }

  const [cpu, mem, memLayout, graphics, diskLayout, fsSize, battery, osInfo, netIfaces, netDefault] =
    await Promise.all([
      si.cpu(),
      si.mem(),
      si.memLayout(),
      si.graphics(),
      si.diskLayout(),
      si.fsSize(),
      si.battery(),
      si.osInfo(),
      si.networkInterfaces(),
      si.networkInterfaceDefault()
    ])

  // --- Stockage système ---
  const sysDisk = diskLayout.find((d) => (d.type || '').toUpperCase().includes('HD'))
  const hasNvme = diskLayout.some((d) => (d.interfaceType || '').toUpperCase().includes('NVME'))
  if (diskLayout.length > 0 && diskLayout.every((d) => (d.type || '').toUpperCase().includes('HD'))) {
    add({
      severity: 'critical',
      title: T('No SSD detected — major bottleneck', 'Aucun SSD détecté — gros bottleneck'),
      detail: T(
        'Your system runs on a mechanical hard drive. This is THE biggest brake: 5-10x loading times, stutters in open-world games. An NVMe or SATA SSD is upgrade #1, even a $40 one.',
        'Ton système tourne sur disque dur mécanique. C\u2019est LE plus gros frein : temps de chargement x5-10, stutters en jeu open-world. Un SSD NVMe ou SATA est l\u2019upgrade n°1, même pour 40€.'
      )
    })
  } else if (sysDisk) {
    add({
      severity: 'warn',
      title: T('Mechanical hard drive present', 'Disque dur mécanique présent'),
      detail: T(
        `${sysDisk.name} is an HDD. Avoid installing games on it: put them on the${hasNvme ? ' NVMe' : ''} SSD to eliminate loading stutters.`,
        `${sysDisk.name} est un HDD. Évite d\u2019y installer tes jeux : mets-les sur le SSD${hasNvme ? ' NVMe' : ''} pour éliminer les stutters de chargement.`
      )
    })
  }

  const cVol = fsSize.find((f) => f.mount?.toUpperCase().startsWith('C'))
  if (cVol && cVol.use >= 90) {
    add({
      severity: 'warn',
      title: T(`Drive C: is ${Math.round(cVol.use)}% full`, `Disque C: plein à ${Math.round(cVol.use)}%`),
      detail: T(
        'Below 10% free space, Windows and the page file slow down. Use the Cleanup tab and uninstall what you no longer use.',
        'En dessous de 10% d\u2019espace libre, Windows et le fichier d\u2019échange ralentissent. Utilise l\u2019onglet Nettoyage et désinstalle ce qui ne sert plus.'
      )
    })
  }

  // --- RAM ---
  const totalGB = mem.total / 1024 ** 3
  const activeSticks = memLayout.filter((m) => m.size > 0)
  if (totalGB < 7.5) {
    add({
      severity: 'critical',
      title: T(`Only ${Math.round(totalGB)} GB of RAM`, `Seulement ${Math.round(totalGB)} Go de RAM`),
      detail: T(
        '8 GB is the bare minimum in 2026 — recent games want 16. Close everything in the background before playing, and consider a cheap RAM upgrade.',
        '8 Go est le strict minimum en 2026 — les jeux récents en demandent 16. Ferme tout en arrière-plan avant de jouer, et pense à un upgrade RAM (peu cher).'
      )
    })
  } else if (totalGB < 15.5) {
    add({
      severity: 'warn',
      title: T(`${Math.round(totalGB)} GB of RAM — tight for recent games`, `${Math.round(totalGB)} Go de RAM — juste pour les jeux récents`),
      detail: T(
        '16 GB is today\u2019s gaming standard. With 8 GB, lower texture quality and close the browser while playing.',
        '16 Go est le standard gaming actuel. Avec 8 Go, baisse la qualité des textures et ferme le navigateur en jouant.'
      )
    })
  }
  if (activeSticks.length === 1 && totalGB >= 7.5) {
    add({
      severity: 'warn',
      title: T('Single-channel RAM — free FPS lost', 'RAM en single-channel — FPS perdus gratuitement'),
      detail: T(
        'Only one stick detected: memory bandwidth is halved. Adding a 2nd identical stick can give +10-25% FPS, especially with an iGPU or an AMD CPU.',
        'Une seule barrette détectée : la bande passante mémoire est divisée par 2. Ajouter une 2e barrette identique peut donner +10-25% de FPS, surtout avec un GPU intégré ou un CPU AMD.'
      )
    })
  }
  const ddr = (activeSticks[0]?.type || '').toUpperCase()
  const clock = activeSticks[0]?.clockSpeed || 0
  if (ddr.includes('DDR4') && clock > 0 && clock <= 2400) {
    add({
      severity: 'info',
      title: T(`DDR4 RAM at ${clock} MHz — XMP profile probably disabled`, `RAM DDR4 à ${clock} MHz — profil XMP probablement désactivé`),
      detail: T(
        'Your RAM runs at base speed. Enable XMP/DOCP in the BIOS to reach its real speed: direct CPU gain in games. (Official BIOS setting, no anticheat issue.)',
        'Ta RAM tourne à sa vitesse de base. Active XMP/DOCP dans le BIOS pour atteindre sa vraie vitesse : gain CPU direct dans les jeux. (Réglage BIOS officiel, aucun souci anticheat.)'
      )
    })
  }
  if (ddr.includes('DDR5') && clock > 0 && clock <= 4800) {
    add({
      severity: 'info',
      title: T(`DDR5 RAM at ${clock} MHz — XMP/EXPO likely disabled`, `RAM DDR5 à ${clock} MHz — XMP/EXPO sûrement désactivé`),
      detail: T(
        'Enable XMP (Intel) or EXPO (AMD) in the BIOS for your RAM\u2019s real speed: free FPS.',
        'Active XMP (Intel) ou EXPO (AMD) dans le BIOS pour la vitesse réelle de ta RAM : FPS gratuits.'
      )
    })
  }

  // --- CPU ---
  if (cpu.physicalCores < 4) {
    add({
      severity: 'warn',
      title: T(`${cpu.physicalCores}-core CPU — low end`, `CPU ${cpu.physicalCores} cœurs — limite basse`),
      detail: T(
        'Recent games want 6 cores or more. Close as many background apps as possible (Startup tab).',
        'Les jeux récents veulent 6 cœurs ou plus. Ferme un maximum d\u2019applis en arrière-plan (onglet Démarrage).'
      )
    })
  }

  // --- GPU ---
  const dgpu = graphics.controllers.find((g) => {
    const m = `${g.vendor} ${g.model}`.toLowerCase()
    return !(m.includes('intel') && !m.includes('arc')) && !m.includes('microsoft') && !(m.includes('amd') && m.includes('graphics') && graphics.controllers.length > 1)
  })
  const hasIGpuAndDGpu = graphics.controllers.length > 1
  if (dgpu && dgpu.vram && dgpu.vram > 0 && dgpu.vram < 4000) {
    add({
      severity: 'warn',
      title: T(`GPU with ${Math.round(dgpu.vram / 1024)} GB of VRAM`, `GPU avec ${Math.round(dgpu.vram / 1024)} Go de VRAM`),
      detail: T(
        'Under 4 GB of VRAM: lower textures one notch to avoid brutal FPS drops. Barely changes visuals, massively smooths the framerate.',
        'Moins de 4 Go de VRAM : baisse les textures d\u2019un cran pour éviter les chutes de FPS brutales. Ça change peu le visuel, mais ça lisse énormément le framerate.'
      )
    })
  }
  if (hasIGpuAndDGpu && battery.hasBattery) {
    add({
      severity: 'info',
      title: T(
        'Dual GPU (integrated + dedicated) — make sure games use the right one',
        'Double GPU (intégré + dédié) — vérifie que les jeux utilisent le bon'
      ),
      detail: T(
        'On laptops, some games launch on the integrated GPU by mistake. Go to Settings > Display > Graphics and force your games to "High performance".',
        'Sur laptop, certains jeux se lancent sur le GPU intégré par erreur. Va dans Paramètres > Affichage > Graphiques et force tes jeux en "Hautes performances".'
      ),
      action: { label: T('Open graphics settings', 'Ouvrir les réglages graphiques'), url: 'ms-settings:display-advancedgraphics' }
    })
  }

  // --- Écran ---
  const display = graphics.displays.find((d) => d.main) || graphics.displays[0]
  if (display?.currentRefreshRate && display.currentRefreshRate <= 60) {
    add({
      severity: 'info',
      title: T(`Display at ${display.currentRefreshRate} Hz`, `Écran en ${display.currentRefreshRate} Hz`),
      detail: T(
        'If your monitor supports more (120/144/165 Hz), Windows may be stuck at 60 Hz — an ultra common mistake that ruins smoothness. Check Settings > Display > Refresh rate.',
        'Si ton écran supporte plus (120/144/165 Hz), Windows est peut-être resté en 60 Hz — erreur ultra courante qui gâche la fluidité. Vérifie dans Paramètres > Affichage > Fréquence.'
      ),
      action: { label: T('Check refresh rate', 'Vérifier la fréquence'), url: 'ms-settings:display-advanced' }
    })
  }

  // --- Réseau ---
  const defaultIface = netIfaces.find((n) => n.iface === netDefault)
  if (defaultIface?.type === 'wireless') {
    add({
      severity: 'info',
      title: T('Connected over Wi-Fi', 'Connexion en Wi-Fi'),
      detail: T(
        'For online gaming, an Ethernet cable lowers ping and especially latency spikes (jitter). If impossible, move closer to the router and prefer 5 GHz.',
        'Pour le jeu en ligne, un câble Ethernet réduit le ping et surtout les pics de latence (jitter). Si impossible, rapproche-toi du routeur et privilégie le 5 GHz.'
      )
    })
  }

  // --- Batterie / laptop ---
  if (battery.hasBattery) {
    const health =
      battery.designedCapacity > 0 && battery.maxCapacity > 0
        ? Math.round((battery.maxCapacity / battery.designedCapacity) * 100)
        : null
    if (health != null && health < 70) {
      add({
        severity: 'warn',
        title: T(`Worn battery (${health}% of original capacity)`, `Batterie usée (${health}% de sa capacité d\u2019origine)`),
        detail: T(
          'A tired battery can limit performance. Play plugged in — better for FPS too.',
          'Une batterie fatiguée peut limiter les performances. Joue branché sur secteur, c\u2019est aussi mieux pour les FPS.'
        )
      })
    }
    add({
      severity: 'info',
      title: T('Laptop: always play plugged in', 'PC portable : joue toujours branché'),
      detail: T(
        'On battery, the CPU and GPU are automatically throttled (-30 to -50% perf). Plug in the charger and set power mode to "Best performance".',
        'Sur batterie, le CPU et le GPU sont bridés automatiquement (-30 à -50% de perf). Branche le chargeur et mets le mode d\u2019alimentation sur "Performances optimales".'
      )
    })
  }

  // --- Pilote GPU ---
  try {
    const problems = await getProblemDevices()
    for (const p of problems.slice(0, 6)) {
      add({
        severity: p.missingDriver ? 'critical' : 'warn',
        title: p.missingDriver
          ? T(`Missing driver: ${p.name}`, `Pilote manquant : ${p.name}`)
          : T(`Device in error state: ${p.name}`, `Périphérique en erreur : ${p.name}`),
        detail: T(
          `${p.problem} (code ${p.code}). Go to the Drivers tab → "Search for missing drivers" or use your manufacturer's official link.`,
          `${p.problem} (code ${p.code}). Va dans l’onglet Pilotes → « Rechercher les pilotes manquants » ou utilise le lien officiel de ton constructeur.`
        )
      })
    }
  } catch {
    // scan optionnel
  }
  try {
    const gpuStatuses = await getGpuDriverStatus()
    for (const s of gpuStatuses) {
      if (s.upToDate === false) {
        add({
          severity: 'warn',
          title: T(
            `GPU driver outdated: ${s.installed} → ${s.latest} available`,
            `Pilote GPU pas à jour : ${s.installed} → ${s.latest} dispo`
          ),
          detail: `${s.model} : ${s.note}`,
          action: { label: T('Download (official)', 'Télécharger (officiel)'), url: s.downloadUrl }
        })
      }
    }
  } catch {
    // check en ligne optionnel
  }
  try {
    const drivers = await scanDrivers()
    const gpuDriver = drivers.find((d) => d.className === 'DISPLAY' && d.ageYears != null)
    if (gpuDriver && gpuDriver.ageYears != null && gpuDriver.ageYears >= 0.5) {
      add({
        severity: gpuDriver.ageYears >= 1.5 ? 'warn' : 'info',
        title: T(`GPU driver is ${gpuDriver.ageYears} year(s) old`, `Pilote GPU vieux de ${gpuDriver.ageYears} an(s)`),
        detail: T(
          `${gpuDriver.device}: recent drivers bring per-game optimizations. Go to the Drivers tab to update from the official source.`,
          `${gpuDriver.device} : les pilotes récents apportent des optimisations par jeu. Va dans l\u2019onglet Pilotes pour mettre à jour depuis la source officielle.`
        )
      })
    }
  } catch {
    // scan drivers optionnel
  }

  // --- HVCI (intégrité mémoire) : info seulement, choix du joueur ---
  try {
    const hvci = await ps(
      `$v=(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' -Name 'Enabled' -ErrorAction SilentlyContinue).Enabled; if($v -eq 1){'1'}`,
      10000
    )
    if (hvci.includes('1')) {
      add({
        severity: 'info',
        title: T('Memory integrity (VBS) is enabled', 'Intégrité de la mémoire (VBS) activée'),
        detail: T(
          'This protection costs ~5% FPS on some CPUs. Disabling it is possible and stays 100% Vanguard/EAC compatible, but lowers security — your call. Pkaizen Forge never touches it automatically.',
          'Cette protection coûte ~5% de FPS sur certains CPU. La désactiver est possible et reste 100% compatible Vanguard/EAC, mais réduit la sécurité — à toi de choisir. Pkaizen Forge n\u2019y touche jamais automatiquement.'
        ),
        action: { label: T('Open Windows Security', 'Ouvrir Sécurité Windows'), url: 'ms-settings:windowsdefender' }
      })
    }
  } catch {
    // check optionnel
  }

  // --- Uptime ---
  const uptimeDays = si.time().uptime / 86400
  if (uptimeDays >= 7) {
    add({
      severity: 'warn',
      title: T(
        `PC running for ${Math.floor(uptimeDays)} days without a restart`,
        `PC allumé depuis ${Math.floor(uptimeDays)} jours sans redémarrage`
      ),
      detail: T(
        'Driver and app memory leaks pile up over time: lower FPS and stutters. A real restart (not sleep) resets everything.',
        'Les fuites mémoire des pilotes et des applis s\u2019accumulent avec le temps : FPS en baisse et stutters. Un vrai redémarrage (pas la veille) remet tout à plat.'
      )
    })
  }

  // --- OS ---
  if (osInfo.arch !== 'x64' && osInfo.arch !== 'arm64') {
    add({
      severity: 'warn',
      title: T('32-bit Windows detected', 'Windows 32 bits détecté'),
      detail: T(
        'Most recent games no longer run on 32-bit. A 64-bit reinstall is strongly advised.',
        'La plupart des jeux récents ne tournent plus en 32 bits. Une réinstallation en 64 bits est fortement conseillée.'
      )
    })
  }

  if (insights.length === 0 || !insights.some((i) => i.severity === 'critical' || i.severity === 'warn')) {
    add({
      severity: 'ok',
      title: T('Healthy config — no major bottleneck detected', 'Config saine — aucun bottleneck majeur détecté'),
      detail: T(
        'Your machine is well balanced. Apply the recommended optimizations and keep your drivers up to date.',
        'Ta machine est bien équilibrée. Applique les optimisations recommandées et garde tes pilotes à jour.'
      )
    })
  }

  const order = { critical: 0, warn: 1, info: 2, ok: 3 }
  return insights.sort((a, b) => order[a.severity] - order[b.severity])
}

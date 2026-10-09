import si from 'systeminformation'
import { ps } from './powershell'
import { scanDrivers } from './drivers'
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
      title: 'Aucun SSD détecté — gros bottleneck',
      detail:
        'Ton système tourne sur disque dur mécanique. C\u2019est LE plus gros frein : temps de chargement x5-10, stutters en jeu open-world. Un SSD NVMe ou SATA est l\u2019upgrade n°1, même pour 40€.'
    })
  } else if (sysDisk) {
    add({
      severity: 'warn',
      title: 'Disque dur mécanique présent',
      detail: `${sysDisk.name} est un HDD. Évite d\u2019y installer tes jeux : mets-les sur le SSD${hasNvme ? ' NVMe' : ''} pour éliminer les stutters de chargement.`
    })
  }

  const cVol = fsSize.find((f) => f.mount?.toUpperCase().startsWith('C'))
  if (cVol && cVol.use >= 90) {
    add({
      severity: 'warn',
      title: `Disque C: plein à ${Math.round(cVol.use)}%`,
      detail:
        'En dessous de 10% d\u2019espace libre, Windows et le fichier d\u2019échange ralentissent. Utilise l\u2019onglet Nettoyage et désinstalle ce qui ne sert plus.'
    })
  }

  // --- RAM ---
  const totalGB = mem.total / 1024 ** 3
  const activeSticks = memLayout.filter((m) => m.size > 0)
  if (totalGB < 7.5) {
    add({
      severity: 'critical',
      title: `Seulement ${Math.round(totalGB)} Go de RAM`,
      detail:
        '8 Go est le strict minimum en 2026 — les jeux récents en demandent 16. Ferme tout en arrière-plan avant de jouer, et pense à un upgrade RAM (peu cher).'
    })
  } else if (totalGB < 15.5) {
    add({
      severity: 'warn',
      title: `${Math.round(totalGB)} Go de RAM — juste pour les jeux récents`,
      detail: '16 Go est le standard gaming actuel. Avec 8 Go, baisse la qualité des textures et ferme le navigateur en jouant.'
    })
  }
  if (activeSticks.length === 1 && totalGB >= 7.5) {
    add({
      severity: 'warn',
      title: 'RAM en single-channel — FPS perdus gratuitement',
      detail:
        'Une seule barrette détectée : la bande passante mémoire est divisée par 2. Ajouter une 2e barrette identique peut donner +10-25% de FPS, surtout avec un GPU intégré ou un CPU AMD.'
    })
  }
  const ddr = (activeSticks[0]?.type || '').toUpperCase()
  const clock = activeSticks[0]?.clockSpeed || 0
  if (ddr.includes('DDR4') && clock > 0 && clock <= 2400) {
    add({
      severity: 'info',
      title: `RAM DDR4 à ${clock} MHz — profil XMP probablement désactivé`,
      detail:
        'Ta RAM tourne à sa vitesse de base. Active XMP/DOCP dans le BIOS pour atteindre sa vraie vitesse : gain CPU direct dans les jeux. (Réglage BIOS officiel, aucun souci anticheat.)'
    })
  }
  if (ddr.includes('DDR5') && clock > 0 && clock <= 4800) {
    add({
      severity: 'info',
      title: `RAM DDR5 à ${clock} MHz — XMP/EXPO sûrement désactivé`,
      detail: 'Active XMP (Intel) ou EXPO (AMD) dans le BIOS pour la vitesse réelle de ta RAM : FPS gratuits.'
    })
  }

  // --- CPU ---
  if (cpu.physicalCores < 4) {
    add({
      severity: 'warn',
      title: `CPU ${cpu.physicalCores} cœurs — limite basse`,
      detail: 'Les jeux récents veulent 6 cœurs ou plus. Ferme un maximum d\u2019applis en arrière-plan (onglet Démarrage).'
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
      title: `GPU avec ${Math.round(dgpu.vram / 1024)} Go de VRAM`,
      detail:
        'Moins de 4 Go de VRAM : baisse les textures d\u2019un cran pour éviter les chutes de FPS brutales. Ça change peu le visuel, mais ça lisse énormément le framerate.'
    })
  }
  if (hasIGpuAndDGpu && battery.hasBattery) {
    add({
      severity: 'info',
      title: 'Double GPU (intégré + dédié) — vérifie que les jeux utilisent le bon',
      detail:
        'Sur laptop, certains jeux se lancent sur le GPU intégré par erreur. Va dans Paramètres > Affichage > Graphiques et force tes jeux en "Hautes performances".',
      action: { label: 'Ouvrir les réglages graphiques', url: 'ms-settings:display-advancedgraphics' }
    })
  }

  // --- Écran ---
  const display = graphics.displays.find((d) => d.main) || graphics.displays[0]
  if (display?.currentRefreshRate && display.currentRefreshRate <= 60) {
    add({
      severity: 'info',
      title: `Écran en ${display.currentRefreshRate} Hz`,
      detail:
        'Si ton écran supporte plus (120/144/165 Hz), Windows est peut-être resté en 60 Hz — erreur ultra courante qui gâche la fluidité. Vérifie dans Paramètres > Affichage > Fréquence.',
      action: { label: 'Vérifier la fréquence', url: 'ms-settings:display-advanced' }
    })
  }

  // --- Réseau ---
  const defaultIface = netIfaces.find((n) => n.iface === netDefault)
  if (defaultIface?.type === 'wireless') {
    add({
      severity: 'info',
      title: 'Connexion en Wi-Fi',
      detail:
        'Pour le jeu en ligne, un câble Ethernet réduit le ping et surtout les pics de latence (jitter). Si impossible, rapproche-toi du routeur et privilégie le 5 GHz.'
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
        title: `Batterie usée (${health}% de sa capacité d\u2019origine)`,
        detail: 'Une batterie fatiguée peut limiter les performances. Joue branché sur secteur, c\u2019est aussi mieux pour les FPS.'
      })
    }
    add({
      severity: 'info',
      title: 'PC portable : joue toujours branché',
      detail:
        'Sur batterie, le CPU et le GPU sont bridés automatiquement (-30 à -50% de perf). Branche le chargeur et mets le mode d\u2019alimentation sur "Performances optimales".'
    })
  }

  // --- Pilote GPU ---
  try {
    const drivers = await scanDrivers()
    const gpuDriver = drivers.find((d) => d.className === 'DISPLAY' && d.ageYears != null)
    if (gpuDriver && gpuDriver.ageYears != null && gpuDriver.ageYears >= 0.5) {
      add({
        severity: gpuDriver.ageYears >= 1.5 ? 'warn' : 'info',
        title: `Pilote GPU vieux de ${gpuDriver.ageYears} an(s)`,
        detail: `${gpuDriver.device} : les pilotes récents apportent des optimisations par jeu. Va dans l\u2019onglet Pilotes pour mettre à jour depuis la source officielle.`
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
        title: 'Intégrité de la mémoire (VBS) activée',
        detail:
          'Cette protection coûte ~5% de FPS sur certains CPU. La désactiver est possible et reste 100% compatible Vanguard/EAC, mais réduit la sécurité — à toi de choisir. OptiForge n\u2019y touche jamais automatiquement.',
        action: { label: 'Ouvrir Sécurité Windows', url: 'ms-settings:windowsdefender' }
      })
    }
  } catch {
    // check optionnel
  }

  // --- OS ---
  if (osInfo.arch !== 'x64' && osInfo.arch !== 'arm64') {
    add({
      severity: 'warn',
      title: 'Windows 32 bits détecté',
      detail: 'La plupart des jeux récents ne tournent plus en 32 bits. Une réinstallation en 64 bits est fortement conseillée.'
    })
  }

  if (insights.length === 0 || !insights.some((i) => i.severity === 'critical' || i.severity === 'warn')) {
    add({
      severity: 'ok',
      title: 'Config saine — aucun bottleneck majeur détecté',
      detail: 'Ta machine est bien équilibrée. Applique les optimisations recommandées et garde tes pilotes à jour.'
    })
  }

  const order = { critical: 0, warn: 1, info: 2, ok: 3 }
  return insights.sort((a, b) => order[a.severity] - order[b.severity])
}

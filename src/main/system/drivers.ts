import si from 'systeminformation'
import { release } from 'os'
import { ps, psJson, asArray } from './powershell'
import { T } from './i18n'
import type { DriverEntry, WingetUpgrade, VendorLink, GpuDriverStatus, ProblemDevice, ComponentCheck } from '../../shared/types'

interface RawDriver {
  device: string
  provider: string
  version: string
  date: string
  className: string
}

// Win32_PnPSignedDriver est très coûteux (WMI) : cache 5 min, appelé par 3 modules.
let driversCache: { at: number; data: DriverEntry[] } | null = null

export async function scanDrivers(): Promise<DriverEntry[]> {
  if (driversCache && Date.now() - driversCache.at < 5 * 60_000) return driversCache.data
  const raw = await psJson<RawDriver | RawDriver[]>(
    `
    $d = Get-CimInstance Win32_PnPSignedDriver |
      Where-Object { $_.DeviceName -and $_.DriverVersion -and $_.DeviceClass -in @('DISPLAY','NET','MEDIA','SYSTEM','HDC','MOUSE','KEYBOARD','MONITOR','USB') } |
      Sort-Object DeviceClass, DeviceName -Unique |
      ForEach-Object {
        [pscustomobject]@{
          device    = $_.DeviceName
          provider  = $_.DriverProviderName
          version   = $_.DriverVersion
          date      = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { '' }
          className = $_.DeviceClass
        }
      }
    ConvertTo-Json -InputObject @($d) -Depth 3
    `,
    90000
  )
  const now = Date.now()
  const result = asArray(raw)
    .filter((d) => d && d.device)
    .map((d) => {
      let ageYears: number | null = null
      if (d.date) {
        const t = Date.parse(d.date)
        if (!Number.isNaN(t)) ageYears = Math.round(((now - t) / (365.25 * 24 * 3600 * 1000)) * 10) / 10
      }
      return { ...d, ageYears }
    })
    .sort((a, b) => (b.ageYears ?? -1) - (a.ageYears ?? -1))
  driversCache = { at: Date.now(), data: result }
  return result
}

export async function getWingetUpgrades(): Promise<WingetUpgrade[]> {
  try {
    const out = await ps(`winget upgrade --accept-source-agreements --disable-interactivity`, 120000)
    const lines = out.split(/\r?\n/)
    const headerIdx = lines.findIndex((l) => /^Name\s+/i.test(l.trim()) && /\bId\b/.test(l) && /\bVersion\b/.test(l))
    if (headerIdx < 0) return []
    const header = lines[headerIdx]
    const idCol = header.indexOf('Id')
    const verCol = header.indexOf('Version')
    const availCol = header.indexOf('Available')
    const srcCol = header.indexOf('Source')
    const upgrades: WingetUpgrade[] = []
    for (const line of lines.slice(headerIdx + 2)) {
      if (!line.trim() || line.trim().startsWith('-') || /upgrades? available/i.test(line)) continue
      if (line.length < availCol) continue
      const name = line.slice(0, idCol).trim()
      const id = line.slice(idCol, verCol).trim()
      const current = line.slice(verCol, availCol).trim()
      const available = (srcCol > 0 ? line.slice(availCol, srcCol) : line.slice(availCol)).trim()
      if (name && id && available) upgrades.push({ name, id, current, available })
    }
    return upgrades
  } catch {
    return []
  }
}

const VENDOR_SITES: Record<string, { label: string; url: string }> = {
  dell: { label: 'Dell Support (drivers officiels)', url: 'https://www.dell.com/support/home/fr-fr' },
  hp: { label: 'HP Support (drivers officiels)', url: 'https://support.hp.com/fr-fr/drivers' },
  lenovo: { label: 'Lenovo Vantage / Support', url: 'https://support.lenovo.com/fr/fr' },
  asus: { label: 'ASUS Support / MyASUS', url: 'https://www.asus.com/fr/support/download-center/' },
  acer: { label: 'Acer Support', url: 'https://www.acer.com/fr-fr/support/drivers-and-manuals' },
  msi: { label: 'MSI Support / MSI Center', url: 'https://fr.msi.com/support/download' },
  gigabyte: { label: 'GIGABYTE Support', url: 'https://www.gigabyte.com/fr/Support' },
  asrock: { label: 'ASRock Support', url: 'https://www.asrock.com/support/index.fr.asp' },
  razer: { label: 'Razer Support', url: 'https://www.razer.com/fr-fr/drivers' },
  samsung: { label: 'Samsung Support', url: 'https://www.samsung.com/fr/support/downloads/' },
  microsoft: { label: 'Surface — Windows Update gère tout', url: 'https://support.microsoft.com/fr-fr/surface' },
  huawei: { label: 'Huawei Support', url: 'https://consumer.huawei.com/fr/support/' },
  xiaomi: { label: 'Xiaomi Support', url: 'https://www.mi.com/fr/support/' }
}

export async function getVendorLinks(): Promise<VendorLink[]> {
  const [graphics, system, baseboard, battery] = await Promise.all([
    si.graphics(),
    si.system(),
    si.baseboard(),
    si.battery()
  ])
  const links: VendorLink[] = []
  const seen = new Set<string>()
  const add = (label: string, url: string, why: string): void => {
    if (seen.has(url)) return
    seen.add(url)
    links.push({ label, url, why })
  }

  for (const g of graphics.controllers) {
    const m = `${g.vendor} ${g.model}`.toLowerCase()
    if (m.includes('nvidia') || m.includes('geforce') || m.includes('rtx') || m.includes('gtx')) {
      add('NVIDIA — GeForce drivers', 'https://www.nvidia.com/fr-fr/drivers/', T('NVIDIA GPU detected — the GPU driver is THE most important one for FPS.', 'GPU NVIDIA détecté — le pilote GPU est LE plus important pour les FPS.'))
    } else if (m.includes('amd') || m.includes('radeon')) {
      add('AMD — Adrenalin drivers', 'https://www.amd.com/fr/support/download/drivers.html', T('AMD GPU detected — update Adrenalin for the latest perf gains.', 'GPU AMD détecté — mets à jour Adrenalin pour les derniers gains de perf.'))
    } else if (m.includes('intel') && (m.includes('arc') || m.includes('graphics') || m.includes('iris') || m.includes('uhd') || m.includes('hd'))) {
      add('Intel — Driver & Support Assistant', 'https://www.intel.fr/content/www/fr/fr/support/detect.html', T('Intel GPU/iGPU detected — the Intel assistant detects and installs everything automatically.', 'GPU/iGPU Intel détecté — l\u2019assistant Intel détecte et installe tout automatiquement.'))
    }
  }

  const isLaptop = battery.hasBattery
  const sysVendor = (system.manufacturer || '').toLowerCase()
  for (const [key, site] of Object.entries(VENDOR_SITES)) {
    if (sysVendor.includes(key)) {
      add(
        site.label,
        site.url,
        isLaptop
          ? T(
              `${system.manufacturer} laptop detected — on a laptop, ALWAYS get drivers (chipset, audio, touchpad) from the manufacturer's site.`,
              `PC portable ${system.manufacturer} détecté — sur un laptop, prends TOUJOURS les pilotes (chipset, audio, touchpad) sur le site du constructeur.`
            )
          : T(`${system.manufacturer} PC detected — official manufacturer drivers.`, `PC ${system.manufacturer} détecté — pilotes officiels du constructeur.`)
      )
      break
    }
  }

  if (!isLaptop) {
    const mobo = (baseboard.manufacturer || '').toLowerCase()
    for (const [key, site] of Object.entries(VENDOR_SITES)) {
      if (mobo.includes(key)) {
        add(site.label, site.url, T(`Motherboard ${baseboard.manufacturer} ${baseboard.model} — chipset, audio and LAN kept up to date from the official site.`, `Carte mère ${baseboard.manufacturer} ${baseboard.model} — chipset, audio et LAN à jour depuis le site officiel.`))
        break
      }
    }
    const cpuVendor = (await si.cpu()).manufacturer.toLowerCase()
    if (cpuVendor.includes('amd')) {
      add('AMD — Chipset drivers', 'https://www.amd.com/fr/support/download/drivers.html', T('AMD CPU — the official chipset driver improves core scheduling (important for X3D chips).', 'CPU AMD — le pilote chipset officiel améliore la gestion des cœurs (important pour les X3D).'))
    } else if (cpuVendor.includes('intel')) {
      add('Intel — Driver & Support Assistant', 'https://www.intel.fr/content/www/fr/fr/support/detect.html', T('Intel CPU — the official assistant handles chipset, ME and network.', 'CPU Intel — l\u2019assistant officiel gère chipset, ME et réseau.'))
    }
  }

  add(
    T('Windows Update — optional drivers', 'Windows Update — pilotes facultatifs'),
    'ms-settings:windowsupdate-optionalupdates',
    T(
      'Also check Windows\u2019 "Optional updates": signed, safe drivers straight from Microsoft.',
      'Vérifie aussi les "Mises à jour facultatives" de Windows : pilotes signés et sûrs, directement par Microsoft.'
    )
  )

  return links
}

/* ------------------------------------------------------------------ */
/*  Vérification du pilote GPU par le canal OFFICIEL de chaque vendeur */
/* ------------------------------------------------------------------ */

const isWin11 = (): boolean => {
  const build = parseInt(release().split('.')[2] || '0', 10)
  return build >= 22000
}

async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'PkaizenForge/0.1' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

async function getNvidiaInstalledVersion(): Promise<string | null> {
  try {
    const out = await ps(`nvidia-smi --query-gpu=driver_version --format=csv,noheader`, 15000)
    const m = out.match(/(\d{3}\.\d{2})/)
    if (m) return m[1]
  } catch {
    /* nvidia-smi absent */
  }
  try {
    // Conversion du format WMI 32.0.15.6174 → 561.74
    const out = await ps(
      `(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' } | Select-Object -First 1).DriverVersion`,
      15000
    )
    const digits = out.trim().replace(/\./g, '')
    if (digits.length >= 5) {
      const five = digits.slice(-5)
      return `${five.slice(0, 3)}.${five.slice(3)}`
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Résout psid/pfid du GPU via le XML officiel nvidia.com puis interroge l'API DriverManualLookup. */
async function getNvidiaLatest(model: string): Promise<{ version: string; url: string } | null> {
  try {
    const xml = await fetchText('https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3', 25000)
    const norm = (s: string): string =>
      s.toLowerCase().replace(/nvidia|®|™/g, '').replace(/\s+/g, ' ').trim()
    const target = norm(model)
    let psid = ''
    let pfid = ''
    const re = /<LookupValue[^>]*ParentID="(\d+)"[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Value>(\d+)<\/Value>/g
    let m: RegExpExecArray | null
    let bestLen = 0
    while ((m = re.exec(xml)) !== null) {
      const name = norm(m[2])
      if ((target.includes(name) || name.includes(target)) && name.length > bestLen) {
        bestLen = name.length
        psid = m[1]
        pfid = m[3]
      }
    }
    if (!psid || !pfid) return null
    const osID = isWin11() ? '135' : '57'
    const api =
      `https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php` +
      `?func=DriverManualLookup&psid=${psid}&pfid=${pfid}&osID=${osID}&languageCode=1033&beta=0&isWHQL=1&dltype=-1&dch=1&upCRC=&qnf=0&sort1=0&numberOfResults=1`
    const json = JSON.parse(await fetchText(api, 25000))
    const info = json?.IDS?.[0]?.downloadInfo
    if (info?.Version) {
      return { version: String(info.Version), url: String(info.DownloadURL || 'https://www.nvidia.com/fr-fr/drivers/') }
    }
  } catch {
    /* API injoignable */
  }
  return null
}

export async function getGpuDriverStatus(): Promise<GpuDriverStatus[]> {
  const graphics = await si.graphics()
  const statuses: GpuDriverStatus[] = []
  const seen = new Set<string>()

  for (const g of graphics.controllers) {
    if (!g.model || seen.has(g.model)) continue
    seen.add(g.model)
    const m = `${g.vendor} ${g.model}`.toLowerCase()

    if (m.includes('nvidia') || m.includes('geforce') || m.includes('rtx') || m.includes('gtx')) {
      const [installed, latest] = await Promise.all([getNvidiaInstalledVersion(), getNvidiaLatest(g.model)])
      const upToDate =
        installed && latest ? parseFloat(installed) >= parseFloat(latest.version) : null
      statuses.push({
        vendor: 'nvidia',
        model: g.model,
        installed,
        latest: latest?.version ?? null,
        upToDate,
        downloadUrl: latest?.url ?? 'https://www.nvidia.com/fr-fr/drivers/',
        note:
          upToDate === false
            ? T(
                `New Game Ready Driver ${latest!.version} available (you have ${installed}). Download it from the official NVIDIA link.`,
                `Nouveau Game Ready Driver ${latest!.version} disponible (tu as ${installed}). Télécharge-le depuis le lien officiel NVIDIA.`
              )
            : upToDate === true
              ? T('Your NVIDIA driver is up to date ✔', 'Ton pilote NVIDIA est à jour ✔')
              : T(
                  'Automatic check unavailable — click to verify on nvidia.com.',
                  'Impossible de vérifier automatiquement — clique pour vérifier sur nvidia.com.'
                )
      })
    } else if (m.includes('amd') || m.includes('radeon')) {
      statuses.push({
        vendor: 'amd',
        model: g.model,
        installed: g.driverVersion || null,
        latest: null,
        upToDate: null,
        downloadUrl: 'https://www.amd.com/fr/support/download/drivers.html',
        note: T(
          'AMD provides no public version API — click to check via the official AMD auto-detect tool.',
          'AMD ne fournit pas d\u2019API publique de version — clique pour vérifier via l\u2019outil officiel de détection automatique AMD.'
        )
      })
    } else if (m.includes('intel')) {
      statuses.push({
        vendor: 'intel',
        model: g.model,
        installed: g.driverVersion || null,
        latest: null,
        upToDate: null,
        downloadUrl: 'https://www.intel.fr/content/www/fr/fr/support/detect.html',
        note: T(
          'Use the official Intel DSA assistant: it detects and installs the latest driver automatically.',
          'Utilise l\u2019assistant officiel Intel DSA : il détecte et installe le dernier pilote automatiquement.'
        )
      })
    }
  }
  return statuses
}

/* ----------------------------------------------------------- */
/*  Périphériques en erreur / sans pilote (codes PnP Windows)   */
/* ----------------------------------------------------------- */

const PNP_ERRORS: Record<number, [string, string]> = {
  1: ['Device is misconfigured', 'Périphérique mal configuré'],
  3: ['Driver corrupted or out of memory', 'Pilote corrompu ou mémoire insuffisante'],
  10: ['Device cannot start', 'Le périphérique ne peut pas démarrer'],
  18: ['Driver needs reinstalling', 'Pilote à réinstaller'],
  28: ['NO DRIVER INSTALLED', 'AUCUN PILOTE INSTALLÉ'],
  31: ['Driver is not working properly', 'Le pilote ne fonctionne pas correctement'],
  37: ['Driver failed to load', 'Le pilote a échoué au chargement'],
  39: ['Driver missing or corrupted', 'Pilote manquant ou corrompu'],
  43: ['Device stopped (reported an error)', 'Périphérique arrêté (erreur signalée)'],
  52: ['Invalid driver signature', 'Signature du pilote invalide']
}

// Cache des données brutes (localisation appliquée à chaque appel).
let problemCache: { at: number; data: { name: string; id: string; code: number; className: string }[] } | null = null

export async function getProblemDevices(): Promise<ProblemDevice[]> {
  let rawList: { name: string; id: string; code: number; className: string }[]
  if (problemCache && Date.now() - problemCache.at < 5 * 60_000) {
    rawList = problemCache.data
  } else {
    const raw = await psJson<
      { name: string; id: string; code: number; className: string } | { name: string; id: string; code: number; className: string }[]
    >(
    `
    $bad = Get-CimInstance Win32_PnPEntity |
      Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne 45 -and $_.ConfigManagerErrorCode -ne 22 } |
      ForEach-Object {
        [pscustomobject]@{
          name      = if ($_.Name) { $_.Name } else { $_.DeviceID }
          id        = $_.DeviceID
          code      = [int]$_.ConfigManagerErrorCode
          className = [string]$_.PNPClass
        }
      }
    ConvertTo-Json -InputObject @($bad) -Depth 3
    `,
      60000
    )
    rawList = asArray(raw).filter((d) => d && d.name)
    problemCache = { at: Date.now(), data: rawList }
  }
  return rawList
    .map((d) => ({
      name: d.name,
      deviceId: d.id,
      code: d.code,
      className: d.className || '',
      problem: PNP_ERRORS[d.code] ? T(PNP_ERRORS[d.code][0], PNP_ERRORS[d.code][1]) : T(`Hardware error (code ${d.code})`, `Erreur matérielle (code ${d.code})`),
      missingDriver: d.code === 28 || d.code === 39 || d.code === 18
    }))
    .sort((a, b) => Number(b.missingDriver) - Number(a.missingDriver))
}

/* ------------------------------------------------------------------ */
/*  Check-up par composant — liens officiels fabricant pour chacun     */
/* ------------------------------------------------------------------ */

const MOBO_SEARCH: Record<string, (model: string) => string> = {
  asus: (m) => `https://www.asus.com/fr/search/?q=${encodeURIComponent(m)}`,
  msi: (m) => `https://fr.msi.com/search/${encodeURIComponent(m)}`,
  gigabyte: (m) => `https://www.gigabyte.com/fr/Search?kw=${encodeURIComponent(m)}`,
  asrock: (m) => `https://www.asrock.com/search/index.asp?keyword=${encodeURIComponent(m)}`,
  biostar: () => `https://www.biostar.com.tw/app/en/support/download.php`,
  'nzxt': () => `https://support.nzxt.com/hc/fr`,
  evga: () => `https://fr.evga.com/support/download/`
}

const SSD_TOOLS: Record<string, { label: string; url: string }> = {
  samsung: { label: 'Samsung Magician (firmware + pilote NVMe)', url: 'https://semiconductor.samsung.com/consumer-storage/magician/' },
  'western digital': { label: 'WD Dashboard (firmware SSD)', url: 'https://support-en.wd.com/app/products/downloads/softwaredownloads' },
  wd: { label: 'WD Dashboard (firmware SSD)', url: 'https://support-en.wd.com/app/products/downloads/softwaredownloads' },
  sandisk: { label: 'SanDisk Dashboard', url: 'https://kb.sandisk.com/app/answers/detail/a_id/15108' },
  crucial: { label: 'Crucial Storage Executive (firmware SSD)', url: 'https://www.crucial.fr/support/storage-executive' },
  micron: { label: 'Crucial Storage Executive (firmware SSD)', url: 'https://www.crucial.fr/support/storage-executive' },
  kingston: { label: 'Kingston SSD Manager (firmware)', url: 'https://www.kingston.com/fr/support/technical/ssdmanager' },
  seagate: { label: 'SeaTools (firmware)', url: 'https://www.seagate.com/fr/fr/support/downloads/seatools/' },
  corsair: { label: 'Corsair SSD Toolbox', url: 'https://www.corsair.com/fr/fr/downloads' },
  intel: { label: 'Solidigm Storage Tool', url: 'https://www.solidigm.com/support-page/drivers-downloads.html' }
}

interface RawHw {
  moboVendor: string
  moboModel: string
  biosVersion: string
  biosDate: string
  nics: { name: string; version: string; date: string }[] | { name: string; version: string; date: string } | null
  audio: { name: string; version: string; date: string }[] | { name: string; version: string; date: string } | null
}

export async function getComponentChecklist(): Promise<ComponentCheck[]> {
  const [raw, gpuStatuses, diskLayout, system, battery] = await Promise.all([
    psJson<RawHw>(
      `
      $bb = Get-CimInstance Win32_BaseBoard
      $bios = Get-CimInstance Win32_BIOS
      $drv = Get-CimInstance Win32_PnPSignedDriver
      $nics = $drv | Where-Object { $_.DeviceClass -eq 'NET' -and $_.DeviceName -and $_.DriverVersion -and $_.DeviceName -notmatch 'Virtual|TAP|Loopback|VPN|Hyper-V|Bluetooth' } |
        Sort-Object DeviceName -Unique | ForEach-Object {
          @{ name = $_.DeviceName; version = $_.DriverVersion; date = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { '' } }
        }
      $audio = $drv | Where-Object { $_.DeviceClass -eq 'MEDIA' -and $_.DeviceName -and $_.DriverVersion } |
        Sort-Object DeviceName -Unique | ForEach-Object {
          @{ name = $_.DeviceName; version = $_.DriverVersion; date = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { '' } }
        }
      ConvertTo-Json @{
        moboVendor = [string]$bb.Manufacturer
        moboModel  = [string]$bb.Product
        biosVersion = [string]$bios.SMBIOSBIOSVersion
        biosDate   = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { '' }
        nics = $nics
        audio = $audio
      } -Depth 4
      `,
      60000
    ),
    getGpuDriverStatus(),
    si.diskLayout(),
    si.system(),
    si.battery()
  ])

  const checks: ComponentCheck[] = []
  const now = Date.now()
  const age = (d: string): number | null => {
    const t = Date.parse(d)
    return Number.isNaN(t) ? null : Math.round(((now - t) / (365.25 * 24 * 3600 * 1000)) * 10) / 10
  }
  const isLaptop = battery.hasBattery
  const sysVendor = (system.manufacturer || '').toLowerCase()

  // GPU — compare automatique (NVIDIA) ou outil officiel (AMD/Intel)
  for (const g of gpuStatuses) {
    checks.push({
      component: T('Graphics card', 'Carte graphique'),
      name: g.model,
      installed: g.installed,
      installedDate: null,
      status: g.upToDate === false ? 'update' : g.upToDate === true ? 'ok' : 'manual',
      officialUrl: g.downloadUrl,
      advice: g.note
    })
  }

  if (raw) {
    // Carte mère : chipset + BIOS depuis le site du fabricant (desktop) ou OEM (laptop)
    const moboVendorKey = Object.keys(MOBO_SEARCH).find((k) => (raw.moboVendor || '').toLowerCase().includes(k))
    const oemKey = Object.keys(VENDOR_SITES).find((k) => sysVendor.includes(k))
    const moboUrl = isLaptop
      ? (oemKey ? VENDOR_SITES[oemKey].url : 'ms-settings:windowsupdate')
      : moboVendorKey
        ? MOBO_SEARCH[moboVendorKey](raw.moboModel)
        : 'ms-settings:windowsupdate'
    const biosAge = age(raw.biosDate)
    checks.push({
      component: isLaptop
        ? T('BIOS / manufacturer drivers (laptop)', 'BIOS / pilotes constructeur (laptop)')
        : T('Motherboard (chipset, BIOS, LAN, audio)', 'Carte mère (chipset, BIOS, LAN, audio)'),
      name: `${raw.moboVendor} ${raw.moboModel}`.trim(),
      installed: `BIOS ${raw.biosVersion}`,
      installedDate: raw.biosDate || null,
      status: biosAge != null && biosAge >= 2 ? 'probably-update' : 'manual',
      officialUrl: moboUrl,
      advice:
        biosAge != null && biosAge >= 2
          ? T(
              `Your BIOS is ${biosAge} years old — updates likely exist (stability, CPU perf, RAM compat). Compare the version on the official page.`,
              `Ton BIOS date d\u2019il y a ${biosAge} ans — il y a sûrement des MAJ (stabilité, perf CPU, compat RAM). Compare la version sur la page officielle.`
            )
          : T(
              'Your board\u2019s official page: the newest BIOS, chipset, LAN and audio always land there before Windows Update.',
              'Page officielle de ta carte : BIOS, chipset, LAN et audio les plus récents y sont toujours avant Windows Update.'
            )
    })

    // Chipset selon le CPU
    const cpu = await si.cpu()
    if (cpu.manufacturer.toLowerCase().includes('amd')) {
      checks.push({
        component: 'Chipset',
        name: `AMD (${cpu.brand})`,
        installed: null,
        installedDate: null,
        status: 'manual',
        officialUrl: 'https://www.amd.com/fr/support/download/drivers.html',
        advice: T(
          'The official AMD chipset driver manages core boosting — crucial for Ryzen (especially X3D). Install it from amd.com, not Windows Update.',
          'Le pilote chipset AMD officiel gère le boost des cœurs — crucial pour les Ryzen (surtout X3D). Installe-le depuis amd.com, pas Windows Update.'
        )
      })
    } else if (cpu.manufacturer.toLowerCase().includes('intel')) {
      checks.push({
        component: 'Chipset',
        name: `Intel (${cpu.brand})`,
        installed: null,
        installedDate: null,
        status: 'manual',
        officialUrl: 'https://www.intel.fr/content/www/fr/fr/support/detect.html',
        advice: T(
          'Intel DSA scans your machine and installs official chipset/ME/network in one click — newer than Windows Update.',
          'Intel DSA scanne ta machine et installe chipset/ME/réseau officiels en un clic — plus récent que Windows Update.'
        )
      })
    }

    // Cartes réseau
    for (const n of asArray(raw.nics)) {
      const a = age(n.date)
      const nm = n.name.toLowerCase()
      const url = nm.includes('intel')
        ? 'https://www.intel.fr/content/www/fr/fr/support/detect.html'
        : nm.includes('killer')
          ? 'https://www.intel.fr/content/www/fr/fr/download/19779/'
          : nm.includes('realtek')
            ? moboUrl
            : nm.includes('mediatek')
              ? moboUrl
              : moboUrl
      checks.push({
        component: nm.includes('wi-fi') || nm.includes('wireless') || nm.includes('wifi') ? 'Wi-Fi' : T('Network (LAN)', 'Réseau (LAN)'),
        name: n.name,
        installed: n.version,
        installedDate: n.date || null,
        status: a != null && a >= 1.5 ? 'probably-update' : 'manual',
        officialUrl: url,
        advice:
          a != null && a >= 1.5
            ? T(
                `Driver is ${a} year(s) old — a newer version probably exists (in-game ping stability).`,
                `Pilote vieux de ${a} an(s) — une version plus récente existe probablement (stabilité du ping en jeu).`
              )
            : nm.includes('realtek')
              ? T('Official Realtek drivers = your motherboard / PC maker\u2019s page.', 'Pilotes Realtek officiels = page de ta carte mère / constructeur du PC.')
              : T('Check the latest version on the official link.', 'Vérifie la dernière version sur le lien officiel.')
      })
    }

    // Audio
    for (const aDev of asArray(raw.audio).slice(0, 3)) {
      const a = age(aDev.date)
      const nm = aDev.name.toLowerCase()
      if (nm.includes('nvidia') || nm.includes('amd') || nm.includes('intel display')) continue // audio HDMI suit le pilote GPU
      checks.push({
        component: 'Audio',
        name: aDev.name,
        installed: aDev.version,
        installedDate: aDev.date || null,
        status: a != null && a >= 2 ? 'probably-update' : 'manual',
        officialUrl: moboUrl,
        advice: T(
          'Audio (Realtek & co) updates come from your motherboard / PC maker\u2019s official page.',
          'L\u2019audio (Realtek & co) se met à jour depuis la page officielle de ta carte mère / ton PC.'
        )
      })
    }
  }

  // SSD : firmware via l'outil officiel du fabricant
  for (const d of diskLayout) {
    const vendorKey = Object.keys(SSD_TOOLS).find((k) => `${d.vendor} ${d.name}`.toLowerCase().includes(k))
    if (vendorKey && (d.type || '').toUpperCase().includes('SSD')) {
      checks.push({
        component: T('SSD (firmware)', 'SSD (firmware)'),
        name: d.name,
        installed: d.firmwareRevision || null,
        installedDate: null,
        status: 'manual',
        officialUrl: SSD_TOOLS[vendorKey].url,
        advice: T(
          `${SSD_TOOLS[vendorKey].label}: check the firmware — fixes perf and longevity bugs.`,
          `${SSD_TOOLS[vendorKey].label} : vérifie le firmware — corrige les bugs de perf et de longévité.`
        )
      })
    }
  }

  const order = { update: 0, 'probably-update': 1, manual: 2, ok: 3 }
  return checks.sort((a, b) => order[a.status] - order[b.status])
}

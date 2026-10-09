import si from 'systeminformation'
import { ps, psJson, asArray } from './powershell'
import type { DriverEntry, WingetUpgrade, VendorLink } from '../../shared/types'

interface RawDriver {
  device: string
  provider: string
  version: string
  date: string
  className: string
}

export async function scanDrivers(): Promise<DriverEntry[]> {
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
  return asArray(raw)
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
      add('NVIDIA — GeForce drivers officiels', 'https://www.nvidia.com/fr-fr/drivers/', 'GPU NVIDIA détecté — le pilote GPU est LE plus important pour les FPS.')
    } else if (m.includes('amd') || m.includes('radeon')) {
      add('AMD — Adrenalin drivers officiels', 'https://www.amd.com/fr/support/download/drivers.html', 'GPU AMD détecté — mets à jour Adrenalin pour les derniers gains de perf.')
    } else if (m.includes('intel') && (m.includes('arc') || m.includes('graphics') || m.includes('iris') || m.includes('uhd') || m.includes('hd'))) {
      add('Intel — Driver & Support Assistant', 'https://www.intel.fr/content/www/fr/fr/support/detect.html', 'GPU/iGPU Intel détecté — l\u2019assistant Intel détecte et installe tout automatiquement.')
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
          ? `PC portable ${system.manufacturer} détecté — sur un laptop, prends TOUJOURS les pilotes (chipset, audio, touchpad) sur le site du constructeur.`
          : `PC ${system.manufacturer} détecté — pilotes officiels du constructeur.`
      )
      break
    }
  }

  if (!isLaptop) {
    const mobo = (baseboard.manufacturer || '').toLowerCase()
    for (const [key, site] of Object.entries(VENDOR_SITES)) {
      if (mobo.includes(key)) {
        add(site.label, site.url, `Carte mère ${baseboard.manufacturer} ${baseboard.model} — chipset, audio et LAN à jour depuis le site officiel.`)
        break
      }
    }
    const cpuVendor = (await si.cpu()).manufacturer.toLowerCase()
    if (cpuVendor.includes('amd')) {
      add('AMD — Chipset drivers', 'https://www.amd.com/fr/support/download/drivers.html', 'CPU AMD — le pilote chipset officiel améliore la gestion des cœurs (important pour les X3D).')
    } else if (cpuVendor.includes('intel')) {
      add('Intel — Driver & Support Assistant', 'https://www.intel.fr/content/www/fr/fr/support/detect.html', 'CPU Intel — l\u2019assistant officiel gère chipset, ME et réseau.')
    }
  }

  add(
    'Windows Update — pilotes facultatifs',
    'ms-settings:windowsupdate-optionalupdates',
    'Vérifie aussi les "Mises à jour facultatives" de Windows : pilotes signés et sûrs, directement par Microsoft.'
  )

  return links
}

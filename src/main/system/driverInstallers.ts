import { arch, platform, release } from 'os'
import { DOMParser } from 'linkedom'
import { mkdtemp, rm } from 'fs/promises'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import si from './hardware'
import { scanDrivers } from './drivers'
import { ps } from './powershell'
import { T } from './i18n'
import type { ActionResult, DriverInstaller } from '../../shared/types'

const SOURCES = {
  nvidia: {
    page: 'https://www.nvidia.com/en-us/software/nvidia-app/',
    domains: ['nvidia.com'],
    publishers: ['NVIDIA Corporation'],
    executable: /\/nvapp\/client\/[^/]+\/NVIDIA_app_[^/]+\.exe$/i
  },
  amd: {
    page: 'https://www.amd.com/en/support/download/drivers.html',
    domains: ['amd.com'],
    publishers: ['Advanced Micro Devices, Inc.', 'Advanced Micro Devices Inc.'],
    executable: /\/drivers\/installer\/.*minimalsetup[^/]*\.exe$/i
  },
  intel: {
    page: 'https://dsadata.intel.com/installer',
    domains: ['intel.com'],
    publishers: ['Intel Corporation'],
    executable: null
  }
} as const

export async function getDriverInstallers(): Promise<DriverInstaller[]> {
  if (platform() !== 'win32' || arch() !== 'x64' || Number(release().split('.')[2]) < 17763) return []
  const graphics = await si.graphics()
  const cpu = await si.cpu()
  const system = await si.system()
  const drivers = await scanDrivers()
  const options: DriverInstaller[] = []
  const models = graphics.controllers.map((controller) => `${controller.vendor} ${controller.model}`)
  const nvidia = models.filter((model) => /(?:GeForce\s+)?RTX\s*(?:20|30|40|50)\d{2}\b/i.test(model) && !/Quadro|RTX\s*A\d/i.test(model))
  if (nvidia.length) options.push({
    id: 'nvidia', name: 'NVIDIA App', hardware: nvidia.join(', '), kind: 'installer',
    note: T('Game Ready / Studio drivers. Official assistant; driver installation must be confirmed there.', 'Pilotes Game Ready / Studio. Assistant officiel ; installation des pilotes à confirmer dans celui-ci.')
  })
  const amd = models.filter((model) => /radeon/i.test(model))
  if (/ryzen/i.test(cpu.brand)) amd.push(cpu.brand)
  if (amd.length) options.push({
    id: 'amd', name: 'AMD Auto-Detect', hardware: amd.join(', '), kind: 'installer',
    note: T('Radeon graphics / Ryzen chipsets. The AMD installer checks the exact supported hardware.', 'Graphiques Radeon / chipsets Ryzen. L’installeur AMD vérifie le matériel exact pris en charge.')
  })
  const intel = [...models.filter((model) => /intel/i.test(model)), ...drivers.filter((driver) => /intel/i.test(`${driver.provider} ${driver.device}`) && /NET|DISPLAY|BLUETOOTH/i.test(driver.className)).map((driver) => driver.device)]
  if (/intel/i.test(cpu.manufacturer)) intel.push(cpu.brand)
  if (intel.length) options.push({
    id: 'intel', name: 'Intel Driver & Support Assistant', hardware: [...new Set(intel)].join(', '), kind: 'installer',
    note: T('Supported Intel graphics, Wi-Fi and Bluetooth. DSA uses a browser interface; it does not cover every Intel component.', 'Graphiques, Wi-Fi et Bluetooth Intel pris en charge. DSA utilise une interface web et ne couvre pas tous les composants Intel.')
  })
  if (/asus|asustek/i.test(system.manufacturer)) options.unshift({
    id: 'asus', name: 'MyASUS', hardware: `${system.manufacturer} ${system.model}`, kind: 'store',
    note: T('ASUS model-specific updates. Microsoft Store; update features depend on model and ASUS System Control Interface support.', 'Mises à jour propres au modèle ASUS. Microsoft Store ; fonctions selon le modèle et la prise en charge ASUS System Control Interface.')
  })
  return options
}

export function isOfficialDownload(url: URL, domains: readonly string[]): boolean {
  return url.protocol === 'https:' && !url.username && !url.password &&
    (!url.port || url.port === '443') && domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
}

export async function fetchOfficialDownload(url: string, domains: readonly string[], signal: AbortSignal): Promise<Response> {
  let current = new URL(url)
  for (let count = 0; count <= 5; count++) {
    if (!isOfficialDownload(current, domains)) throw new Error('Download refused: unofficial source')
    const response = await fetch(current.href, { redirect: 'manual', signal })
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`Download failed: HTTP ${response.status}`)
      }
      return response
    }
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location) throw new Error('Download redirect has no destination')
    current = new URL(location, current)
  }
  throw new Error('Too many download redirects')
}

export async function resolveDriverInstaller(id: 'nvidia' | 'amd' | 'intel', signal: AbortSignal): Promise<string> {
  const source = SOURCES[id]
  if (!source.executable) return source.page
  const response = await fetchOfficialDownload(source.page, source.domains, signal)
  if (!response.body) throw new Error('Empty manufacturer response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 4 * 1024 * 1024) throw new Error('Manufacturer page is too large')
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel()
  }
  const document = new DOMParser().parseFromString(Buffer.concat(chunks).toString('utf8'), 'text/html')
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')
    if (!href) continue
    const url = new URL(href, source.page)
    if (isOfficialDownload(url, source.domains) && source.executable.test(url.pathname)) return url.href
  }
  throw new Error(T('Official installer not found. No unverified download was attempted.', 'Installeur officiel introuvable. Aucun téléchargement non vérifié n’a été tenté.'))
}

export async function verifyDriverSignature(path: string, publishers: readonly string[]): Promise<void> {
  const literal = path.replace(/'/g, "''")
  const output = await ps(`$ErrorActionPreference='Stop'; $signature = Get-AuthenticodeSignature -LiteralPath '${literal}'; ConvertTo-Json @{ status = [string]$signature.Status; publisher = if ($signature.SignerCertificate) { $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) } else { '' } }`, 60_000, true)
  const signature = JSON.parse(output) as { status: string; publisher: string }
  if (signature.status !== 'Valid' || !publishers.includes(signature.publisher)) {
    throw new Error(T('Installer refused: invalid or unexpected publisher signature.', 'Installeur refusé : signature invalide ou éditeur inattendu.'))
  }
}

let preparing = false

export async function launchDriverInstaller(id: string): Promise<ActionResult> {
  if (preparing) return { ok: false, message: T('An installer is already being prepared.', 'Un installeur est déjà en préparation.') }
  if (!['nvidia', 'amd', 'intel', 'asus'].includes(id)) return { ok: false, message: 'Unknown installer.' }
  preparing = true
  let directory: string | undefined
  try {
    const option = (await getDriverInstallers()).find((candidate) => candidate.id === id)
    if (!option) throw new Error(T('No supported hardware detected for this installer.', 'Aucun matériel pris en charge détecté pour cet installeur.'))
    const { app, shell } = await import('electron')
    if (id === 'asus') {
      await shell.openExternal('ms-windows-store://pdp/?ProductId=9N7R5S6B0ZZH')
      return { ok: true, message: T('MyASUS opened in Microsoft Store. Install or open it to check model-specific updates.', 'MyASUS ouvert dans Microsoft Store. Installe-le ou ouvre-le pour les mises à jour de ton modèle.') }
    }
    const sourceId = id as keyof typeof SOURCES
    const source = SOURCES[sourceId]
    const url = await resolveDriverInstaller(sourceId, AbortSignal.timeout(30_000))
    const signal = AbortSignal.timeout(15 * 60_000)
    const response = await fetchOfficialDownload(url, source.domains, signal)
    if (!response.body) throw new Error('Empty installer response')
    directory = await mkdtemp(join(app.getPath('temp'), 'pkaizen-driver-'))
    const destination = join(directory, `${id}-setup.exe`)
    let bytes = 0
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > 1024 ** 3 ? new Error('Installer exceeds 1 GB') : null, chunk)
    } })
    await pipeline(Readable.fromWeb(response.body as never), limit, createWriteStream(destination, { flags: 'wx' }), { signal })
    await verifyDriverSignature(destination, source.publishers)
    const error = await shell.openPath(destination)
    if (error) throw new Error(error)
    directory = undefined
    return { ok: true, message: T(`${option.name} installer opened. Driver installation is not yet confirmed.`, `Installeur ${option.name} ouvert. L’installation des pilotes n’est pas encore confirmée.`) }
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    preparing = false
  }
}
import si, { windowsBuild, windowsName } from './hardware'
import { psJson, asArray } from './powershell'
import { T } from './i18n'
import type { DetailedInfo } from '../../shared/types'

interface RawDetails {
  bios: { vendor: string; version: string; date: string; uefi: boolean; secureBoot: number }
  tpm: { present: boolean; version: string } | null
  os: { edition: string; displayVersion: string; installDate: string; fastStartup: number; hvci: number }
  av: string[] | string | null
  ram: { bank: string; maker: string; part: string; sizeGB: number; configured: number; rated: number }[] | null
  disks: { model: string; health: string; tempC: number; hours: number; wear: number }[] | null
}

// La requête WMI (BIOS/TPM/RAM/SMART) est lourde : cache 5 min.
let rawCache: { at: number; data: RawDetails | null } | null = null

export async function getDetailedInfo(): Promise<DetailedInfo> {
  const cachedRaw = rawCache && Date.now() - rawCache.at < 5 * 60_000 ? rawCache.data : undefined
  const [raw, graphics, osInfo, time] = await Promise.all([
    cachedRaw !== undefined
      ? Promise.resolve(cachedRaw)
      : psJson<RawDetails>(
      `
      $bios = Get-CimInstance Win32_BIOS
      $sb = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State' -Name UEFISecureBootEnabled -ErrorAction SilentlyContinue).UEFISecureBootEnabled
      $uefi = Test-Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State'
      $tpm = $null
      try {
        $t = Get-CimInstance -Namespace 'root/cimv2/Security/MicrosoftTpm' -ClassName Win32_Tpm -ErrorAction Stop
        if ($t) { $tpm = @{ present = $true; version = [string]$t.SpecVersion } }
      } catch {}
      $cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
      $osObj = Get-CimInstance Win32_OperatingSystem
      $fast = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power' -Name HiberbootEnabled -ErrorAction SilentlyContinue).HiberbootEnabled
      $hvci = 0
      try {
        $dg = Get-CimInstance -Namespace 'root\\Microsoft\\Windows\\DeviceGuard' -ClassName Win32_DeviceGuard -ErrorAction Stop
        if ($dg.SecurityServicesRunning -contains 2) { $hvci = 1 }
      } catch {}
      $av = $null
      try { $av = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct -ErrorAction Stop | ForEach-Object { $_.displayName }) } catch {}
      $ram = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
        @{
          bank = [string]$_.DeviceLocator
          maker = [string]$_.Manufacturer
          part = [string]$_.PartNumber
          sizeGB = [math]::Round($_.Capacity / 1GB, 0)
          configured = [int]$_.ConfiguredClockSpeed
          rated = [int]$_.Speed
        }
      })
      $disks = $null
      try {
        $disks = @(Get-PhysicalDisk | ForEach-Object {
          $r = $null
          try { $r = $_ | Get-StorageReliabilityCounter -ErrorAction Stop } catch {}
          @{
            model = [string]$_.FriendlyName
            health = [string]$_.HealthStatus
            tempC = if ($r -and $r.Temperature) { [int]$r.Temperature } else { -1 }
            hours = if ($r -and $r.PowerOnHours) { [int]$r.PowerOnHours } else { -1 }
            wear = if ($r -and $r.Wear -ne $null) { [int]$r.Wear } else { -1 }
          }
        })
      } catch {}
      ConvertTo-Json @{
        bios = @{ vendor = [string]$bios.Manufacturer; version = [string]$bios.SMBIOSBIOSVersion; date = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { '' }; uefi = $uefi; secureBoot = [int]$sb }
        tpm = $tpm
        os = @{ edition = [string]$cv.ProductName; displayVersion = [string]$cv.DisplayVersion; installDate = if ($osObj.InstallDate) { $osObj.InstallDate.ToString('yyyy-MM-dd') } else { '' }; fastStartup = [int]$fast; hvci = $hvci }
        av = $av
        ram = $ram
        disks = $disks
      } -Depth 5
      `,
      90000
    ),
    si.graphics(),
    si.osInfo(),
    Promise.resolve(si.time())
  ])
  if (cachedRaw === undefined) rawCache = { at: Date.now(), data: raw }

  const uptimeH = Math.round((time.uptime / 3600) * 10) / 10

  return {
    bios: raw
      ? {
          vendor: raw.bios.vendor,
          version: raw.bios.version,
          date: raw.bios.date,
          uefi: raw.bios.uefi,
          secureBoot: raw.bios.secureBoot === 1
        }
      : null,
    tpm: raw?.tpm ? { present: raw.tpm.present, version: raw.tpm.version } : null,
    windows: raw
      ? {
          edition: windowsName(raw.os.edition || osInfo.distro, windowsBuild(osInfo.build)),
          displayVersion: raw.os.displayVersion || osInfo.release,
          build: osInfo.build,
          installDate: raw.os.installDate,
          fastStartup: raw.os.fastStartup === 1,
          hvci: raw.os.hvci === 1,
          antivirus: asArray(raw.av).filter(Boolean).join(', ') || 'Inconnu',
          uptimeHours: uptimeH
        }
      : null,
    ramSlots: asArray(raw?.ram ?? null).map((r) => ({
      bank: r.bank,
      maker: r.maker?.trim() || 'Inconnu',
      part: r.part?.trim() || '',
      sizeGB: r.sizeGB,
      configuredMHz: r.configured,
      ratedMHz: r.rated,
      xmpActive: r.configured > 0 && r.rated > 0 ? r.configured >= r.rated : null
    })),
    diskHealth: asArray(raw?.disks ?? null).map((d) => ({
      model: d.model,
      health: d.health === 'Healthy' ? T('Good', 'Bon état') : d.health,
      tempC: d.tempC >= 0 ? d.tempC : null,
      powerOnHours: d.hours >= 0 ? d.hours : null,
      wearPercent: d.wear >= 0 ? d.wear : null
    })),
    displays: graphics.displays.map((d) => ({
      model: d.model || 'Écran',
      main: !!d.main,
      resX: d.currentResX || d.resolutionX || 0,
      resY: d.currentResY || d.resolutionY || 0,
      hz: d.currentRefreshRate || 0,
      connection: d.connection || ''
    }))
  }
}

import si, { windowsBuild, windowsName } from './hardware'
import { psJson, asArray } from './powershell'
import type { DetailedInfo } from '../../shared/types'
import { getDisplays } from './displays'

interface RawDetails {
  bios: { vendor: string; version: string; date: string; uefi: boolean; secureBoot: number }
  tpm: { present: boolean; version: string } | null
  os: { edition: string; displayVersion: string; installDate: string; fastStartup: number; hvci: number }
  av: string[] | string | null
  ram: { bank: string; maker: string; part: string; sizeGB: number; configured: number; rated: number }[] | null
  disks: { model: string; health: string; tempC: number | null; hours: number | null; wear: number | null; error: string }[] | null
  diskWarnings: string[]
}

// La requête WMI (BIOS/TPM/RAM/SMART) est lourde : cache 5 min.
let rawCache: { at: number; data: RawDetails | null } | null = null

export async function getDetailedInfo(): Promise<DetailedInfo> {
  const cachedRaw = rawCache && Date.now() - rawCache.at < 5 * 60_000 ? rawCache.data : undefined
  const [raw, osInfo, time] = await Promise.all([
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
      $diskWarnings = @()
      try {
        $disks = @(Get-PhysicalDisk -ErrorAction Stop | ForEach-Object {
          $r = $null
          $counterError = ''
          try { $r = $_ | Get-StorageReliabilityCounter -ErrorAction Stop } catch { $counterError = $_.Exception.Message }
          @{
            model = [string]$_.FriendlyName
            health = [string]$_.HealthStatus
            tempC = if ($r -and $null -ne $r.Temperature) { [double]$r.Temperature } else { $null }
            hours = if ($r -and $null -ne $r.PowerOnHours) { [double]$r.PowerOnHours } else { $null }
            wear = if ($r -and $null -ne $r.Wear) { [double]$r.Wear } else { $null }
            error = $counterError
          }
        })
      } catch { $diskWarnings += $_.Exception.Message }
      ConvertTo-Json @{
        bios = @{ vendor = [string]$bios.Manufacturer; version = [string]$bios.SMBIOSBIOSVersion; date = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { '' }; uefi = $uefi; secureBoot = [int]$sb }
        tpm = $tpm
        os = @{ edition = [string]$cv.ProductName; displayVersion = [string]$cv.DisplayVersion; installDate = if ($osObj.InstallDate) { $osObj.InstallDate.ToString('yyyy-MM-dd') } else { '' }; fastStartup = [int]$fast; hvci = $hvci }
        av = $av
        ram = $ram
        disks = $disks
        diskWarnings = $diskWarnings
      } -Depth 5
      `,
      90000
    ),
    si.osInfo(),
    Promise.resolve(si.time())
  ])
  if (cachedRaw === undefined) rawCache = { at: Date.now(), data: raw }
  const diskWarnings = raw ? asArray(raw.diskWarnings) : ['Windows storage inventory unavailable']
  for (const warning of [...diskWarnings, ...asArray(raw?.disks ?? null).map((disk) => disk.error).filter(Boolean)]) {
    console.error('[Pkaizen] Disk counters:', warning)
  }

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
      health: d.health,
      tempC: typeof d.tempC === 'number' && Number.isFinite(d.tempC) && d.tempC > 0 && d.tempC < 150 ? d.tempC : null,
      powerOnHours: typeof d.hours === 'number' && Number.isFinite(d.hours) && d.hours >= 0 ? d.hours : null,
      wearPercent: typeof d.wear === 'number' && Number.isFinite(d.wear) && d.wear >= 0 && d.wear <= 255 ? d.wear : null,
      error: d.error || ''
    })),
    diskWarnings,
    displays: getDisplays()
  }
}

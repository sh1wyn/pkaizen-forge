import { ps, psJson } from './powershell'
import { T } from './i18n'
import type { CleanTarget, CleanResult } from '../../shared/types'

interface Target {
  id: string
  name: string
  description: string
  needsAdmin: boolean
  /** Script PS qui écrit la taille en octets */
  size: string
  /** Script PS qui nettoie */
  clean: string
}

const folderSize = (p: string): string =>
  `[int64]((Get-ChildItem -LiteralPath ${p} -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum)`

const TARGETS: Target[] = [
  {
    id: 'user-temp',
    name: 'Fichiers temporaires utilisateur',
    description: 'Contenu de %TEMP% — sans risque, les fichiers en cours d\u2019utilisation sont ignorés.',
    needsAdmin: false,
    size: folderSize('$env:TEMP'),
    clean: `Get-ChildItem -LiteralPath $env:TEMP -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue`
  },
  {
    id: 'win-temp',
    name: 'Fichiers temporaires Windows',
    description: 'C:\\Windows\\Temp — nécessite les droits administrateur.',
    needsAdmin: true,
    size: folderSize("'C:\\Windows\\Temp'"),
    clean: `Get-ChildItem -LiteralPath 'C:\\Windows\\Temp' -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue`
  },
  {
    id: 'wu-cache',
    name: 'Cache Windows Update',
    description: 'Anciens fichiers de mise à jour déjà installés (SoftwareDistribution\\Download).',
    needsAdmin: true,
    size: folderSize("'C:\\Windows\\SoftwareDistribution\\Download'"),
    clean: `
      Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
      Get-ChildItem -LiteralPath 'C:\\Windows\\SoftwareDistribution\\Download' -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
      Start-Service wuauserv -ErrorAction SilentlyContinue`
  },
  {
    id: 'thumbs',
    name: 'Cache des miniatures',
    description: 'Miniatures d\u2019images/vidéos de l\u2019Explorateur — régénérées automatiquement.',
    needsAdmin: false,
    size: `[int64]((Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer" -Filter 'thumbcache_*.db' -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum)`,
    clean: `Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer" -Filter 'thumbcache_*.db' -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue`
  },
  {
    id: 'recycle',
    name: 'Corbeille',
    description: 'Vide la corbeille de tous les lecteurs.',
    needsAdmin: false,
    size: `
      $shell = New-Object -ComObject Shell.Application
      [int64](($shell.NameSpace(10).Items() | ForEach-Object { $_.Size } | Measure-Object -Sum).Sum)`,
    clean: `Clear-RecycleBin -Force -ErrorAction SilentlyContinue`
  },
  {
    id: 'dns',
    name: 'Cache DNS',
    description: 'Vide le cache DNS — règle certains problèmes de connexion aux serveurs de jeu.',
    needsAdmin: false,
    size: `[int64]0`,
    clean: `ipconfig /flushdns | Out-Null`
  }
]

export async function previewClean(): Promise<CleanTarget[]> {
  const LABELS: Record<string, { name: string; description: string }> = {
    'user-temp': {
      name: T('User temporary files', 'Fichiers temporaires utilisateur'),
      description: T('Contents of %TEMP% — risk-free, in-use files are skipped.', 'Contenu de %TEMP% — sans risque, les fichiers en cours d\u2019utilisation sont ignorés.')
    },
    'win-temp': {
      name: T('Windows temporary files', 'Fichiers temporaires Windows'),
      description: T('C:\\Windows\\Temp — requires administrator rights.', 'C:\\Windows\\Temp — nécessite les droits administrateur.')
    },
    'wu-cache': {
      name: T('Windows Update cache', 'Cache Windows Update'),
      description: T('Old update files already installed (SoftwareDistribution\\Download).', 'Anciens fichiers de mise à jour déjà installés (SoftwareDistribution\\Download).')
    },
    thumbs: {
      name: T('Thumbnail cache', 'Cache des miniatures'),
      description: T('Explorer image/video thumbnails — regenerated automatically.', 'Miniatures d\u2019images/vidéos de l\u2019Explorateur — régénérées automatiquement.')
    },
    recycle: {
      name: T('Recycle Bin', 'Corbeille'),
      description: T('Empties the recycle bin on all drives.', 'Vide la corbeille de tous les lecteurs.')
    },
    dns: {
      name: T('DNS cache', 'Cache DNS'),
      description: T('Flushes the DNS cache — fixes some game server connection issues.', 'Vide le cache DNS — règle certains problèmes de connexion aux serveurs de jeu.')
    }
  }
  const results = await Promise.all(
    TARGETS.map(async (t) => {
      let sizeMB: number | null = null
      try {
        const out = await psJson<number>(t.size, 45000)
        if (out != null && !Number.isNaN(out)) sizeMB = Math.round((out / 1024 / 1024) * 10) / 10
      } catch {
        sizeMB = null
      }
      const label = LABELS[t.id] ?? { name: t.name, description: t.description }
      return { id: t.id, name: label.name, description: label.description, needsAdmin: t.needsAdmin, sizeMB }
    })
  )
  return results
}

export async function runClean(ids: string[]): Promise<CleanResult[]> {
  const results: CleanResult[] = []
  for (const id of ids) {
    const t = TARGETS.find((x) => x.id === id)
    if (!t) continue
    try {
      const before = (await psJson<number>(t.size, 45000)) ?? 0
      await ps(t.clean, 120000)
      const after = (await psJson<number>(t.size, 45000)) ?? 0
      results.push({ id, ok: true, freedMB: Math.max(0, Math.round(((before - after) / 1024 / 1024) * 10) / 10) })
    } catch (e) {
      results.push({ id, ok: false, freedMB: 0, message: (e as Error).message })
    }
  }
  return results
}

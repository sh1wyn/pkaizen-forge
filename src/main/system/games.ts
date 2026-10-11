import { open, readdir, stat } from 'fs/promises'
import { join, win32 } from 'path'
import { ps } from './powershell'
import type { InstalledGame, GameLibrary } from '../../shared/types'

const LIMIT = 2 * 1024 * 1024
const missing = (error: unknown): boolean =>
  !!error && typeof error === 'object' && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
const localPath = (path: string): boolean => /^[a-z]:\\/i.test(path) && !path.includes('\0')

async function readManifest(path: string): Promise<string | null> {
  let file: Awaited<ReturnType<typeof open>>
  try { file = await open(path, 'r') } catch (error) {
    if (missing(error)) return null
    throw error
  }
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > LIMIT) throw new Error('Manifest is not a bounded regular file')
    const buffer = Buffer.alloc(LIMIT + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > LIMIT) throw new Error('Manifest exceeds 2 MiB')
    return buffer.toString('utf8', 0, length).replace(/^\uFEFF/, '')
  } finally { await file.close() }
}

async function directoryExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory() } catch (error) {
    if (missing(error)) return false
    throw error
  }
}

async function entries(path: string): Promise<string[]> {
  try {
    const names = await readdir(path)
    if (names.length > 10_000) throw new Error('Library has too many entries')
    return names
  } catch (error) {
    if (missing(error)) return []
    throw error
  }
}

export function vdfPairs(text: string): [string, string][] {
  return [...text.matchAll(/"((?:\\.|[^"\\])*)"\s*"((?:\\.|[^"\\])*)"/g)]
    .map((match) => [match[1], match[2].replace(/\\(["\\])/g, '$1')])
}

export function steamGame(text: string, library: string): InstalledGame | null {
  const data = Object.fromEntries(vdfPairs(text))
  if (!/^\d+$/.test(data.appid ?? '') || !data.name?.trim() || !/^\d+$/.test(data.StateFlags ?? '')) return null
  if ((Number(data.StateFlags) & 4) === 0) return null
  const directory = data.installdir
  if (!directory || /[\\/:]/.test(directory) || directory === '.' || directory === '..') return null
  return { id: `steam:${data.appid}`, name: data.name.slice(0, 200), launcher: 'Steam', installPath: join(library, 'steamapps', 'common', directory) }
}

export function epicGame(text: string): InstalledGame | null {
  const data: unknown = JSON.parse(text)
  if (!data || typeof data !== 'object') throw new Error('Invalid Epic manifest')
  const entry = data as Record<string, unknown>
  if (entry.bIsIncompleteInstall === true) return null
  if (typeof entry.DisplayName !== 'string' || !entry.DisplayName.trim() ||
      typeof entry.AppName !== 'string' || !entry.AppName ||
      typeof entry.InstallLocation !== 'string' || !localPath(entry.InstallLocation)) return null
  return { id: `epic:${entry.AppName}`, name: entry.DisplayName.slice(0, 200), launcher: 'Epic Games', installPath: win32.normalize(entry.InstallLocation) }
}

export async function getInstalledGames(): Promise<GameLibrary> {
  const games: InstalledGame[] = []
  const warnings: string[] = []
  const warn = (source: string, error: unknown): void => {
    console.error(`[Pkaizen] Game library ${source}:`, error)
    warnings.push(`${source}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const roots = new Set<string>()
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) {
    if (base && localPath(base)) roots.add(join(base, 'Steam'))
  }
  try {
    const path = await ps(`$ErrorActionPreference='Stop'; if (Test-Path 'HKCU:\\Software\\Valve\\Steam') { (Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam').SteamPath }`, 15_000, true)
    if (path) {
      const normalized = win32.normalize(path)
      if (localPath(normalized)) roots.add(normalized)
      else warnings.push('Steam: non-local library path not scanned')
    }
  } catch (error) { warn('Steam registry', error) }
  const libraries = new Set(roots)
  for (const root of roots) {
    try {
      const manifest = await readManifest(join(root, 'steamapps', 'libraryfolders.vdf'))
      if (!manifest) continue
      for (const [key, value] of vdfPairs(manifest)) {
        if (key === 'path' || /^\d+$/.test(key)) {
          const path = win32.normalize(value)
          if (localPath(path)) libraries.add(path)
          else if (key === 'path') warnings.push('Steam: non-local library path not scanned')
        }
      }
    } catch (error) { warn('Steam libraries', error) }
  }
  if (libraries.size > 64) throw new Error('Too many Steam libraries')
  for (const library of libraries) {
    try {
      const files = await entries(join(library, 'steamapps'))
      for (const name of files.filter((entry) => /^appmanifest_\d+\.acf$/i.test(entry))) {
        try {
          const text = await readManifest(join(library, 'steamapps', name))
          if (!text) continue
          const game = steamGame(text, library)
          if (game && await directoryExists(game.installPath)) games.push(game)
        } catch (error) { warn(`Steam ${name}`, error) }
      }
    } catch (error) { warn('Steam', error) }
  }
  const programData = process.env.ProgramData
  if (programData && localPath(programData)) {
    const folder = join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
    try {
      for (const name of (await entries(folder)).filter((entry) => entry.endsWith('.item'))) {
        try {
          const text = await readManifest(join(folder, name))
          if (!text) continue
          const game = epicGame(text)
          if (game && await directoryExists(game.installPath)) games.push(game)
        } catch (error) { warn(`Epic ${name}`, error) }
      }
    } catch (error) { warn('Epic Games', error) }
  }
  return {
    games: [...new Map(games.map((game) => [game.id, game])).values()].sort((a, b) => a.name.localeCompare(b.name)),
    warnings
  }
}

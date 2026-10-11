export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024
export const MAX_CAPTURE_FRAMES = 250_000

export class CaptureError extends Error {
  constructor(public readonly code: 'size' | 'format' | 'column' | 'mixed' | 'value' | 'short', public readonly row = 0) {
    super(`${code}${row ? ` (${row})` : ''}`)
  }
}

export function csvCells(line: string, separator: string): string[] {
  const result: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++ }
      else quoted = !quoted
    } else if (char === separator && !quoted) {
      result.push(value.trim())
      value = ''
    } else value += char
  }
  if (quoted) throw new CaptureError('format')
  result.push(value.trim())
  return result
}

const normalize = (value: string): string => value.toLowerCase().replace(/[\s_()[\]]/g, '')
const FRAME_COLUMNS = ['msbetweenpresents', 'frametimems', 'frametime']

export interface Capture {
  frames: number[]
  column: string
}

export function parseCapture(text: string): Capture {
  if (new TextEncoder().encode(text).byteLength > MAX_CAPTURE_BYTES) throw new CaptureError('size')
  let lineCount = 1
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10 && ++lineCount > MAX_CAPTURE_FRAMES + 2) throw new CaptureError('size')
  }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length > MAX_CAPTURE_FRAMES + 1) throw new CaptureError('size')
  if (lines.length < 2) throw new CaptureError('format')
  const separator = [';', '\t', ','].find((candidate) =>
    csvCells(lines[0], candidate).some((cell) => FRAME_COLUMNS.includes(normalize(cell))))
  if (!separator) throw new CaptureError('column')
  const header = csvCells(lines[0], separator)
  const columns = header.map(normalize)
  const frameColumns = columns.flatMap((column, index) => FRAME_COLUMNS.includes(column) ? [index] : [])
  if (frameColumns.length !== 1) throw new CaptureError('column')
  const frameColumn = frameColumns[0]
  const identities = columns.flatMap((column, index) =>
    ['application', 'processid', 'swapchainaddress'].includes(column) ? [index] : [])
  const seen = new Set<string>()
  const frames = lines.slice(1).map((line, index) => {
    const row = csvCells(line, separator)
    if (row.length !== header.length) throw new CaptureError('format', index + 2)
    if (identities.length) seen.add(JSON.stringify(identities.map((column) => row[column])))
    if (seen.size > 1) throw new CaptureError('mixed', index + 2)
    const raw = separator === ',' ? row[frameColumn] : row[frameColumn].replace(',', '.')
    const ms = Number(raw)
    if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(ms) || ms <= 0) {
      throw new CaptureError('value', index + 2)
    }
    return ms
  })
  if (frames.length < 120) throw new CaptureError('short')
  return { frames, column: header[frameColumn] }
}

export interface FrameSummary {
  count: number
  durationSeconds: number
  averageFps: number
  low1Fps: number
  p99Ms: number
  maxMs: number
  over50: number
  over100: number
}

export function summarizeFrames(frames: readonly number[]): FrameSummary {
  if (frames.length < 120) throw new CaptureError('short')
  if (frames.length > MAX_CAPTURE_FRAMES) throw new CaptureError('size')
  if (frames.some((ms) => !Number.isFinite(ms) || ms <= 0)) throw new CaptureError('value')
  const sorted = [...frames].sort((a, b) => a - b)
  const total = frames.reduce((sum, ms) => sum + ms, 0)
  if (!Number.isFinite(total)) throw new CaptureError('value')
  const tail = sorted.slice(-Math.ceil(frames.length * 0.01))
  return {
    count: frames.length,
    durationSeconds: total / 1000,
    averageFps: frames.length * 1000 / total,
    low1Fps: 1000 / (tail.reduce((sum, ms) => sum + ms, 0) / tail.length),
    p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1],
    maxMs: sorted[sorted.length - 1],
    over50: frames.filter((ms) => ms > 50).length,
    over100: frames.filter((ms) => ms > 100).length
  }
}

export function targetCoverage(frames: readonly number[], target: number): number {
  if (!Number.isFinite(target) || target <= 0) throw new Error('Invalid FPS target')
  if (!frames.length || frames.some((ms) => !Number.isFinite(ms) || ms <= 0)) throw new CaptureError('value')
  return frames.filter((ms) => ms <= 1000 / target + 0.000001).length / frames.length * 100
}

export function frameBuckets(frames: readonly number[]): number[] {
  const size = Math.max(1, Math.ceil(frames.length / 100))
  const buckets: number[] = []
  for (let i = 0; i < frames.length; i += size) {
    let max = 0
    for (let j = i; j < Math.min(i + size, frames.length); j++) max = Math.max(max, frames[j])
    buckets.push(max)
  }
  return buckets
}

export const GAMES = [
  { id: 'fortnite', name: 'Fortnite', key: 'game.fortnite' },
  { id: 'cs2', name: 'Counter-Strike 2', key: 'game.cs2' },
  { id: 'valorant', name: 'VALORANT', key: 'game.valorant' },
  { id: 'warzone', name: 'Call of Duty: Warzone', key: 'game.warzone' },
  { id: 'apex', name: 'Apex Legends', key: 'game.apex' },
  { id: 'gta', name: 'GTA V', key: 'game.gta' },
  { id: 'cyberpunk', name: 'Cyberpunk 2077', key: 'game.cyberpunk' },
  { id: 'minecraft', name: 'Minecraft', key: 'game.minecraft' },
  { id: 'other', name: '', key: 'game.other' }
] as const

export interface SessionContext {
  game: string
  resolution: string
  settings: string
  scene: string
  frameGeneration: 'off' | 'on' | 'unknown'
}

export interface GamingSession {
  version: 1
  date: string
  context: SessionContext
  summary: FrameSummary
}

export function validSession(value: unknown): value is GamingSession {
  if (!value || typeof value !== 'object') return false
  const session = value as GamingSession
  const summary = session.summary
  return session.version === 1 && typeof session.date === 'string' && Number.isFinite(Date.parse(session.date)) &&
    !!session.context && ['game', 'resolution', 'settings', 'scene'].every((key) => {
      const entry = session.context[key as keyof SessionContext]
      return typeof entry === 'string' && entry.length > 0 && entry.length <= 500
    }) && ['off', 'on', 'unknown'].includes(session.context.frameGeneration) && !!summary &&
    [summary.count, summary.durationSeconds, summary.averageFps, summary.low1Fps, summary.p99Ms, summary.maxMs]
      .every((number) => Number.isFinite(number) && number > 0) &&
    Number.isInteger(summary.count) && summary.count >= 120 && summary.count <= MAX_CAPTURE_FRAMES &&
    summary.low1Fps <= summary.averageFps + 0.000001 && summary.p99Ms <= summary.maxMs &&
    [summary.over50, summary.over100].every((number) => Number.isInteger(number) && number >= 0 && number <= summary.count) &&
    summary.over100 <= summary.over50
}

export function sameScenario(a: SessionContext, b: SessionContext): boolean {
  return a.game === b.game && a.resolution === b.resolution && a.scene.trim() === b.scene.trim()
    && a.frameGeneration === b.frameGeneration
}

export function gameGuide(name: string): (typeof GAMES)[number] {
  const patterns = [
    /fortnite/i, /counter.strike|^cs2$/i, /valorant/i, /warzone/i,
    /apex legends/i, /grand theft auto v\b|^gta v\b/i, /cyberpunk 2077/i, /minecraft/i
  ]
  return GAMES[patterns.findIndex((pattern) => pattern.test(name))] ?? GAMES[GAMES.length - 1]
}

export interface DisplayAssessment {
  kind: 'unknown' | 'no-data' | 'limited' | 'balanced' | 'headroom'
  games: number
  suggestedHz?: number
  low1?: number
}

export function assessDisplay(
  display: { resX: number; resY: number; hz: number },
  sessions: readonly GamingSession[]
): DisplayAssessment {
  if (![display.resX, display.resY, display.hz].every((value) => Number.isFinite(value) && value > 0)) {
    return { kind: 'unknown', games: 0 }
  }
  const eligible = sessions.filter((session) => {
    const resolution = session.context.resolution.match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i)
    return session.context.frameGeneration === 'off' && session.summary.durationSeconds >= 30 &&
      resolution && Number(resolution[1]) === display.resX && Number(resolution[2]) === display.resY
  })
  if (!eligible.length) return { kind: 'no-data', games: 0 }
  const games = new Set(eligible.map((session) => session.context.game.trim().toLowerCase())).size
  const low1 = Math.min(...eligible.map((session) => session.summary.low1Fps))
  const suggestedHz = [60, 90, 120, 144, 165, 240, 360].filter((hz) => hz > display.hz * 1.1 && hz <= low1 + 0.000001).pop()
  if (suggestedHz) return { kind: 'headroom', games, suggestedHz, low1 }
  return { kind: low1 < display.hz * 0.8 ? 'limited' : 'balanced', games, low1 }
}

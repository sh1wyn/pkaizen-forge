import { csvCells, MAX_CAPTURE_BYTES, MAX_CAPTURE_FRAMES, summarizeFrames, validSession, type FrameSummary } from './gaming'

export interface CaptureProcess { pid: number; name: string; title: string; started: string }
export interface RecordingProgress { startsAt: number; endsAt: number }
export interface RecordedRun {
  version: 1
  date: string
  process: string
  hardware: string
  summary: FrameSummary
  initializationRows: number
  warnings: string[]
}

export interface RunConditions {
  resolution: string
  settings: string
  scene: string
  frameGeneration: 'off' | 'on' | 'unknown'
  target: number
}

export interface SavedRecording { run: RecordedRun; conditions: RunConditions }

export function validRecording(value: unknown): value is SavedRecording {
  if (!value || typeof value !== 'object') return false
  const entry = value as SavedRecording
  const run = entry.run
  const c = entry.conditions
  return !!run && !!c && run.version === 1 && typeof run.process === 'string' && run.process.length > 0 &&
    run.process.length <= 260 && typeof run.hardware === 'string' && run.hardware.length <= 10_000 &&
    run.initializationRows === 1 &&
    Array.isArray(run.warnings) && run.warnings.length <= 5 && run.warnings.every((warning) => typeof warning === 'string' && warning.length <= 16_384) &&
    [c.resolution, c.settings, c.scene].every((field) => typeof field === 'string' && field.length <= 500) &&
    Number.isFinite(c.target) && c.target > 0 && c.target <= 1000 &&
    validSession({ version: 1, date: run.date, summary: run.summary,
      context: { game: run.process, resolution: c.resolution || '?', settings: c.settings || '?',
        scene: c.scene || '?', frameGeneration: c.frameGeneration } }) && run.summary.durationSeconds >= 25
}

export function parseRecording(text: string, pid: number): { summary: FrameSummary; initializationRows: number } {
  if (new TextEncoder().encode(text).byteLength > MAX_CAPTURE_BYTES) throw new Error('Capture exceeds 16 MiB')
  const lines = text.trim().split(/\r?\n/)
  if (lines.length > MAX_CAPTURE_FRAMES + 2) throw new Error('Too many captured frames')
  const header = csvCells(lines[0], ',').map((name) => name.trim().toLowerCase())
  const column = (name: string): number => {
    const index = header.indexOf(name.toLowerCase())
    if (index < 0 || header.lastIndexOf(name.toLowerCase()) !== index) throw new Error(`Missing or ambiguous ${name}`)
    return index
  }
  const processColumn = column('ProcessID')
  const chainColumn = column('SwapChainAddress')
  const timeColumn = column('MsBetweenPresents')
  const timestampColumn = column('TimeInSeconds')
  const frames: number[] = []
  let chain: string | undefined
  let initializationRows = 0
  let previousTimestamp: number | undefined
  for (const line of lines.slice(1)) {
    const row = csvCells(line, ',')
    if (row.length !== header.length || row[processColumn] !== String(pid)) throw new Error('Unexpected capture process or malformed row')
    if (!row[chainColumn]) throw new Error('Missing swap chain')
    if (chain !== undefined && chain !== row[chainColumn]) throw new Error('Multiple rendering streams: retry in gameplay, without menus or overlays')
    chain = row[chainColumn]
    const raw = row[timeColumn]
    const ms = Number(raw)
    const timestamp = Number(row[timestampColumn])
    if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(ms) ||
        !/^\d+(?:\.\d+)?$/.test(row[timestampColumn]) || !Number.isFinite(timestamp) ||
        (previousTimestamp !== undefined && timestamp <= previousTimestamp)) throw new Error('Invalid or unordered frame timing')
    // The first interval may start before the recording window. Never count it.
    if (previousTimestamp === undefined) initializationRows++
    else {
      if (ms <= 0 || Math.abs((timestamp - previousTimestamp) * 1000 - ms) > 0.2) throw new Error('Discontinuous or invalid frame timing')
      frames.push(ms)
    }
    previousTimestamp = timestamp
  }
  const summary = summarizeFrames(frames)
  if (summary.durationSeconds < 25) throw new Error('Less than 25 seconds of valid gameplay captured; keep the game running and retry')
  return { summary, initializationRows }
}

export function performanceVerdict(summary: FrameSummary, target: number): 'below' | 'uneven' | 'met' {
  if (!Number.isFinite(target) || target <= 0) throw new Error('Invalid FPS target')
  if (summary.averageFps < target) return 'below'
  return summary.low1Fps < target * 0.8 ? 'uneven' : 'met'
}

export function baselineComparison(current: SavedRecording, history: readonly SavedRecording[]): {
  kind: 'insufficient' | 'lower' | 'consistent' | 'higher'; samples: number; percent?: number
} {
  const c = current.conditions
  if (!current.run.hardware || ![c.resolution, c.settings, c.scene].every((value) => value.trim()) || c.frameGeneration === 'unknown') {
    return { kind: 'insufficient', samples: 0 }
  }
  const comparable = history.filter((previous) => previous.run.date !== current.run.date &&
    previous.run.process === current.run.process && previous.run.hardware === current.run.hardware &&
    previous.conditions.resolution.trim() === c.resolution.trim() &&
    previous.conditions.settings.trim() === c.settings.trim() &&
    previous.conditions.scene.trim() === c.scene.trim() &&
    previous.conditions.frameGeneration === c.frameGeneration)
  if (comparable.length < 3) return { kind: 'insufficient', samples: comparable.length }
  const values = comparable.map((entry) => entry.run.summary.averageFps).sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2
  const percent = (current.run.summary.averageFps - median) / median * 100
  return { kind: percent < -15 - 1e-9 ? 'lower' : percent > 15 + 1e-9 ? 'higher' : 'consistent', samples: values.length, percent }
}

import { app, net } from 'electron'
import { spawn } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { machine } from 'os'
import { join } from 'path'
import { MAX_CAPTURE_BYTES } from '../../shared/gaming'
import { parseRecording, type CaptureProcess, type RecordedRun, type RecordingProgress } from '../../shared/recording'
import { ps } from './powershell'
import { getGamingHardware } from './sysinfo'

export const PRESENTMON = {
  version: '2.6.0',
  url: 'https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe',
  sha256: 'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af',
  size: 980320
} as const

const toolPath = (): string => join(app.getPath('userData'), 'tools', `PresentMon-${PRESENTMON.version}-x64.exe`)
let installation: Promise<void> | null = null
let active: { controller: AbortController; finished: Promise<RecordedRun | null> } | null = null

function assertSupported(): void {
  if (process.platform !== 'win32' || process.arch !== 'x64' || /arm/i.test(machine())) {
    throw new Error('Automatic capture currently requires Windows x64')
  }
}

function verify(bytes: Buffer): void {
  if (bytes.length !== PRESENTMON.size || createHash('sha256').update(bytes).digest('hex') !== PRESENTMON.sha256) {
    throw new Error('PresentMon integrity check failed; remove the tool in the app and download it again')
  }
}

export async function recordingToolStatus(): Promise<{ ready: boolean; version: string; supported: boolean }> {
  const supported = process.platform === 'win32' && process.arch === 'x64' && !/arm/i.test(machine())
  try {
    verify(await readFile(toolPath()))
    return { ready: true, version: PRESENTMON.version, supported }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { ready: false, version: PRESENTMON.version, supported }
    throw error
  }
}

export function installRecordingTool(): Promise<void> {
  assertSupported()
  if (active) return Promise.reject(new Error('A capture is already running'))
  if (installation) return installation
  installation = (async () => {
    const response = await net.fetch(PRESENTMON.url, { signal: AbortSignal.timeout(45_000) })
    if (!response.ok || !response.body) throw new Error(`PresentMon download failed: HTTP ${response.status}`)
    const chunks: Buffer[] = []
    const reader = response.body.getReader()
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > PRESENTMON.size) throw new Error('Unexpected PresentMon download size')
        chunks.push(Buffer.from(value))
      }
    } finally { await reader.cancel() }
    const bytes = Buffer.concat(chunks)
    verify(bytes)
    const destination = toolPath()
    await mkdir(join(app.getPath('userData'), 'tools'), { recursive: true })
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, bytes, { flag: 'wx' })
      await rename(temporary, destination)
    } finally { await rm(temporary, { force: true }) }
  })().finally(() => { installation = null })
  return installation
}

export async function removeRecordingTool(): Promise<void> {
  if (active || installation) throw new Error('Wait for the current capture or download to finish')
  await rm(toolPath(), { force: true })
}

export async function captureProcesses(): Promise<CaptureProcess[]> {
  assertSupported()
  const output = await ps(`$ErrorActionPreference='Stop'; $rows=@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Id -ne ${process.pid} } | ForEach-Object {
    [pscustomobject]@{ pid=$_.Id; name=$_.ProcessName; title=$_.MainWindowTitle; started=$_.StartTime.ToUniversalTime().ToString('o') }
  }); ConvertTo-Json -InputObject $rows -Compress`, 20_000, true)
  const rows: unknown = JSON.parse(output)
  if (!Array.isArray(rows) || !rows.every((value: CaptureProcess) =>
    Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.name === 'string' &&
    typeof value.title === 'string' && typeof value.started === 'string' && value.started.length > 0)) {
    throw new Error('Invalid running application inventory')
  }
  return rows
}

export function recordingArgs(pid: number, seconds: number, session: string): string[] {
  return ['--process_id', String(pid), '--session_name', session, '--output_stdout', '--v1_metrics',
    '--no_console_stats', '--no_track_input', '--no_track_gpu', '--no_track_display',
    '--delay', '5', '--timed', String(seconds), '--terminate_after_timed', '--terminate_on_proc_exit']
}

function collect(pid: number, seconds: number, signal: AbortSignal, progress: (value: RecordingProgress) => void): Promise<{ text: string; warnings: string[] }> {
  signal.throwIfAborted()
  const session = `Pkaizen-${randomUUID()}`
  const executable = toolPath()
  return new Promise((resolve, reject) => {
    const child = spawn(executable, recordingArgs(pid, seconds, session), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let size = 0
    let stderr = ''
    let failure: Error | null = null
    let stopping = false
    let forceTimer: ReturnType<typeof setTimeout> | undefined
    const stopSession = (): Promise<void> => new Promise((done) => {
      const stopper = spawn(executable, ['--session_name', session, '--terminate_existing_session'], { windowsHide: true, stdio: 'ignore' })
      stopper.on('error', (error) => console.error('[Pkaizen] Stop capture session:', error))
      const timer = setTimeout(() => stopper.kill(), 3000)
      stopper.once('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) console.error('[Pkaizen] Stop capture session exited:', code)
        done()
      })
    })
    const stop = (): void => {
      if (stopping) return
      stopping = true
      if (!child.pid) return
      // Stop only our uniquely named ETW session, never another recorder or the game.
      void stopSession()
      forceTimer = setTimeout(() => child.kill(), 4000)
    }
    const abort = (): void => { failure = new Error('Capture cancelled'); stop() }
    signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => { failure = new Error('Capture timed out'); stop() }, (seconds + 20) * 1000)
    child.once('spawn', () => {
      if (signal.aborted) abort()
      else progress({ startsAt: Date.now() + 5000, endsAt: Date.now() + (seconds + 5) * 1000 })
    })
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_CAPTURE_BYTES) { failure = new Error('Capture exceeds 16 MiB'); stop() }
      else chunks.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16_384)
    })
    child.once('error', (error) => { failure = error })
    child.once('close', async (code) => {
      clearTimeout(timeout)
      clearTimeout(forceTimer)
      signal.removeEventListener('abort', abort)
      // A cancellation can arrive before ETW initialization. Clean up again after
      // the collector exits so a late-created session cannot remain running.
      if (stopping && child.pid) await stopSession()
      const limitedPrivilege = stderr.match(/warning: PresentMon requires elevated privilege[\s\S]*?--terminate_on_proc_exit\.\s*/)?.[0]
      const remaining = limitedPrivilege ? stderr.replace(limitedPrivilege, '') : stderr
      if (failure) reject(failure)
      else if (code !== 0 || remaining.trim()) {
        reject(new Error(`PresentMon failed (${code}): ${stderr || 'No diagnostic output'}`))
      } else resolve({ text: Buffer.concat(chunks).toString('utf8'), warnings: limitedPrivilege ? [limitedPrivilege.trim()] : [] })
    })
  })
}

export function startRecording(
  pid: number, started: string, seconds: number, progress: (value: RecordingProgress) => void
): Promise<RecordedRun | null> {
  assertSupported()
  if (!Number.isSafeInteger(pid) || pid <= 0 || typeof started !== 'string' || started.length > 100 || ![30, 60].includes(seconds)) {
    return Promise.reject(new Error('Invalid capture request'))
  }
  if (active || installation) return Promise.reject(new Error('A capture or download is already running'))
  const controller = new AbortController()
  const finished = (async (): Promise<RecordedRun | null> => {
    try {
      verify(await readFile(toolPath()))
      const selected = (await captureProcesses()).find((entry) => entry.pid === pid && entry.started === started)
      if (!selected) throw new Error('The selected game has closed or restarted; refresh the application list')
      const hardware = await getGamingHardware()
      controller.signal.throwIfAborted()
      const capture = await collect(pid, seconds, controller.signal, progress)
      controller.signal.throwIfAborted()
      return {
        version: 1, date: new Date().toISOString(), process: selected.name,
        hardware: hardware.warnings.length || !hardware.cpu || !hardware.gpus.length ? '' :
          JSON.stringify({ cpu: hardware.cpu, gpus: hardware.gpus, ramGB: hardware.ramGB }),
        ...parseRecording(capture.text, pid),
        warnings: capture.warnings
      }
    } catch (error) {
      if (controller.signal.aborted) return null
      throw error
    } finally { active = null }
  })()
  active = { controller, finished }
  return finished
}

export async function cancelRecording(): Promise<void> {
  const current = active
  if (!current) return
  current.controller.abort()
  await current.finished
}

export function isRecording(): boolean { return active !== null }

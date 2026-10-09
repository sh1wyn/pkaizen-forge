import { execFile } from 'child_process'

const PRELUDE = `$ErrorActionPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;`

// Max 2 PowerShell simultanés : évite de saturer les petits CPU (freeze du PC).
const MAX_CONCURRENT = 2
let running = 0
const waiters: (() => void)[] = []

async function acquire(): Promise<void> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r))
  running++
}

function release(): void {
  running--
  waiters.shift()?.()
}

export async function ps(script: string, timeoutMs = 60000): Promise<string> {
  await acquire()
  try {
    const encoded = Buffer.from(PRELUDE + script, 'utf16le').toString('base64')
    return await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { maxBuffer: 32 * 1024 * 1024, windowsHide: true, timeout: timeoutMs, encoding: 'utf8' },
        (err, stdout, stderr) => {
          if (err && !stdout) reject(new Error(stderr || err.message))
          else resolve(stdout.trim())
        }
      )
    })
  } finally {
    release()
  }
}

export async function psJson<T>(script: string, timeoutMs = 60000): Promise<T | null> {
  const out = await ps(script, timeoutMs)
  if (!out) return null
  try {
    return JSON.parse(out) as T
  } catch {
    return null
  }
}

/** Normalise ConvertTo-Json qui déballe les tableaux à 1 élément en PS 5.1 */
export function asArray<T>(v: T | T[] | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

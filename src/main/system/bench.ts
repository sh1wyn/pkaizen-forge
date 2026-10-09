import { app } from 'electron'
import { createWriteStream } from 'fs'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { DiskBenchResult } from '../../shared/types'

const SIZE_MB = 256
const CHUNK_MB = 4

/** Bench séquentiel écriture/lecture d'un fichier temporaire — mesure réelle du disque système. */
export async function diskBench(): Promise<DiskBenchResult> {
  const path = join(app.getPath('temp'), `pkaizen-bench-${Date.now()}.bin`)
  const chunk = Buffer.allocUnsafe(CHUNK_MB * 1024 * 1024)
  for (let i = 0; i < chunk.length; i += 4096) chunk.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i)

  try {
    const t0 = performance.now()
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(path)
      let written = 0
      const writeNext = (): void => {
        let ok = true
        while (ok && written < SIZE_MB / CHUNK_MB) {
          written++
          ok = ws.write(chunk)
        }
        if (written >= SIZE_MB / CHUNK_MB) ws.end()
        else ws.once('drain', writeNext)
      }
      ws.on('error', reject)
      ws.on('finish', resolve)
      writeNext()
    })
    const writeMs = performance.now() - t0

    const t1 = performance.now()
    await readFile(path)
    const readMs = performance.now() - t1

    return {
      writeMBps: Math.round((SIZE_MB / (writeMs / 1000)) * 10) / 10,
      readMBps: Math.round((SIZE_MB / (readMs / 1000)) * 10) / 10,
      sizeMB: SIZE_MB
    }
  } finally {
    await unlink(path).catch(() => undefined)
  }
}

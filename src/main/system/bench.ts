import { app } from 'electron'
import { open, statfs, unlink } from 'fs/promises'
import { randomFillSync, randomUUID } from 'crypto'
import { join } from 'path'
import type { DiskBenchResult } from '../../shared/types'

const SIZE_MB = 256
const CHUNK_MB = 4

export async function diskBench(signal?: AbortSignal): Promise<DiskBenchResult> {
  const directory = app.getPath('temp')
  const capacity = await statfs(directory)
  if (capacity.bavail * capacity.bsize < (SIZE_MB + 512) * 1024 ** 2) {
    throw new Error('Insufficient free space for disk benchmark')
  }
  const path = join(directory, `pkaizen-bench-${randomUUID()}.bin`)
  const chunk = randomFillSync(Buffer.alloc(CHUNK_MB * 1024 * 1024))
  const deadline = performance.now() + 30_000
  const check = (): void => {
    signal?.throwIfAborted()
    if (performance.now() > deadline) throw new Error('Disk benchmark timed out')
  }
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    check()
    file = await open(path, 'wx+')
    const t0 = performance.now()
    let written = 0
    const sizeBytes = SIZE_MB * 1024 ** 2
    while (written < sizeBytes) {
      check()
      const { bytesWritten } = await file.write(chunk, 0, Math.min(chunk.length, sizeBytes - written), written)
      if (bytesWritten <= 0) throw new Error('Disk write made no progress')
      written += bytesWritten
    }
    await file.datasync()
    const writeMs = performance.now() - t0
    const t1 = performance.now()
    let read = 0
    while (read < sizeBytes) {
      check()
      const { bytesRead } = await file.read(chunk, 0, Math.min(chunk.length, sizeBytes - read), read)
      if (bytesRead <= 0) throw new Error('Unexpected end of benchmark file')
      read += bytesRead
    }
    const readMs = performance.now() - t1
    check()
    return {
      writeMBps: Math.round((SIZE_MB / (Math.max(1, writeMs) / 1000)) * 10) / 10,
      readMBps: Math.round((SIZE_MB / (Math.max(1, readMs) / 1000)) * 10) / 10,
      sizeMB: SIZE_MB
    }
  } finally {
    if (file) {
      await file.close().finally(() => unlink(path))
    }
  }
}

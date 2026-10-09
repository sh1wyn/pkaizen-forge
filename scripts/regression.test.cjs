const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { createRequire } = require('node:module')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')

function load(relative, mocks = {}, globals = {}) {
  const filename = resolve(__dirname, '..', relative)
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const module = { exports: {} }
  const nativeRequire = createRequire(filename)
  runInNewContext(source, {
    module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
    Buffer, performance, setTimeout, clearTimeout, console, ...globals
  }, { filename })
  return module.exports
}

test('system queue serializes probes and recovers after rejection', async () => {
  const { runSystemTask } = load('src/main/system/powershell.ts')
  let active = 0
  let maximum = 0
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
    runSystemTask(async () => {
      maximum = Math.max(maximum, ++active)
      await new Promise((resolve) => setImmediate(resolve))
      active--
      if (index === 5) throw new Error('probe failed')
      return index
    })
  ))
  assert.equal(maximum, 1)
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 19)
  assert.equal(await runSystemTask(async () => 'ready'), 'ready')
})

test('hardware requests share pending probes, cache success and retry failure', async () => {
  const { runSystemTask } = load('src/main/system/powershell.ts')
  let calls = 0
  const hardware = load('src/main/system/hardware.ts', {
    './powershell': { runSystemTask },
    systeminformation: { cpu: async () => {
      calls++
      if (calls === 1) throw new Error('temporary failure')
      return { brand: 'test CPU' }
    } }
  }).default
  await assert.rejects(hardware.cpu(), /temporary failure/)
  const values = await Promise.all([hardware.cpu(), hardware.cpu()])
  assert.equal(values[0], values[1])
  assert.equal(await hardware.cpu(), values[0])
  assert.equal(calls, 2)
})

test('live stats use OS counters only, including missing CPUs and zero RAM', async () => {
  let tick = 0
  let empty = false
  const { getLiveStats } = load('src/main/system/sysinfo.ts', {
    './hardware': { __esModule: true, default: new Proxy({}, { get() { throw new Error('unexpected hardware probe') } }) },
    os: {
      cpus: () => empty ? [] : [{ times: { idle: tick++ * 50, user: tick * 50, sys: 0, nice: 0, irq: 0 } }],
      totalmem: () => empty ? 0 : 8 * 1024 ** 3,
      freemem: () => 2 * 1024 ** 3
    }
  })
  for (let sample = 0; sample < 50; sample++) {
    const stats = await getLiveStats()
    assert.equal(stats.cpuLoad, 50)
    assert.equal(stats.memPercent, 75)
    assert.equal(stats.gpuLoad, null)
  }
  empty = true
  const stats = await getLiveStats()
  assert.equal(stats.cpuLoad, 0)
  assert.equal(stats.memPercent, 0)
})

test('disk benchmark uses bounded buffers and closes before deleting on failure or cancellation', async () => {
  for (const mode of ['success', 'write-error', 'abort', 'no-space']) {
    const events = []
    const controller = new AbortController()
    const buffers = new Set()
    const { diskBench } = load('src/main/system/bench.ts', {
      electron: { app: { getPath: () => 'temp' } },
      'fs/promises': {
        statfs: async () => ({ bavail: mode === 'no-space' ? 0 : 1024 ** 3, bsize: 4096 }),
        open: async () => {
          events.push('open')
          return {
            write: async (buffer, offset, length) => {
              buffers.add(buffer)
              assert.equal(buffer.length, 4 * 1024 ** 2)
              if (mode === 'write-error') throw new Error('write failed')
              if (mode === 'abort') controller.abort()
              return { bytesWritten: Math.min(length, 1024 ** 2) }
            },
            read: async (buffer, offset, length) => { buffers.add(buffer); return { bytesRead: length } },
            datasync: async () => events.push('sync'),
            close: async () => events.push('close')
          }
        },
        unlink: async () => events.push('unlink')
      }
    })
    if (mode === 'success') {
      const result = await diskBench(controller.signal)
      assert.equal(result.sizeMB, 256)
      assert.ok(Number.isFinite(result.readMBps))
      assert.equal(buffers.size, 1)
    } else {
      await assert.rejects(diskBench(controller.signal))
    }
    if (mode === 'no-space') assert.deepEqual(events, [])
    else assert.deepEqual(events.slice(-2), ['close', 'unlink'])
  }
})

test('CPU benchmark caps threads and releases all workers and blob URLs on cancellation and errors', async () => {
  for (const mode of ['success', 'abort', 'constructor-error', 'worker-error']) {
    const workers = []
    let revoked = 0
    const controller = new AbortController()
    const bench = load('src/renderer/src/lib/benchmark.ts', {}, {
      Blob,
      URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ },
      Worker: class {
        constructor() {
          if (mode === 'constructor-error' && workers.length === 1) throw new Error('spawn failed')
          workers.push(this)
        }
        terminate() { this.terminated = true }
        postMessage() {
          setImmediate(() => {
            if (mode === 'success') this.onmessage({ data: { score: 1000, checksum: 1 } })
            else if (mode === 'worker-error') this.onerror({ message: 'worker failed' })
          })
        }
      }
    })
    for (const count of [0, 1, 2, 4, 8, 64, NaN]) {
      assert.ok(bench.benchmarkThreads(count) >= 1 && bench.benchmarkThreads(count) <= 4)
    }
    const pending = bench.runCpuWorkers(4, controller.signal)
    if (mode === 'abort') controller.abort()
    if (mode === 'success') assert.equal(await pending, 4)
    else await assert.rejects(pending)
    assert.ok(workers.every((worker) => worker.terminated))
    assert.equal(revoked, 1)
  }
})

test('GPU benchmark skips unsupported WebGL without inventing a score', async () => {
  const { runGpuBench } = load('src/renderer/src/lib/benchmark.ts')
  const result = await runGpuBench({ getContext: () => null }, new AbortController().signal)
  assert.equal(result.fps, null)
})
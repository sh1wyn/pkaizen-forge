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

test('Windows identity uses native build when WMI is empty or stale and preserves Server editions', () => {
  const { windowsBuild, normalizeWindowsInfo } = load('src/main/system/hardware.ts', {
    './powershell': { runSystemTask: async (task) => task() }, systeminformation: {}
  })
  assert.equal(windowsBuild('10.0.26200.1234'), 26200)
  assert.equal(windowsBuild('22631'), 22631)
  assert.equal(windowsBuild('unknown'), null)
  for (const [distro, reported, native, expected] of [
    ['Microsoft Windows 10 Pro', '', '10.0.26200', 'Microsoft Windows 11 Pro'],
    ['Windows 10 Home', '19045', '10.0.22631', 'Windows 11 Home'],
    ['Windows 10 Pro', '22631', '', 'Windows 11 Pro'],
    ['Windows 10 Pro', '19045', '10.0.19045', 'Windows 10 Pro'],
    ['Windows Server 2025', '26100', '10.0.26100', 'Windows Server 2025'],
    ['', '', '10.0.26200', 'Windows 11'],
    ['Windows 10 Pro', '', '', 'Windows 10 Pro']
  ]) {
    assert.equal(normalizeWindowsInfo({ distro, build: reported }, native).distro, expected)
  }
})

test('network tweak verifies an actual DWORD round trip without changing system settings', { skip: process.platform !== 'win32' }, async () => {
  const { execFile } = require('node:child_process')
  const { promisify } = require('node:util')
  const { randomUUID } = require('node:crypto')
  const calls = []
  const { applyTweak } = load('src/main/system/optimizer.ts', {
    './i18n': { T: (english) => english },
    './powershell': { ps: async (script) => { calls.push(script); return '1' } }
  })
  await applyTweak('network-latency')
  const systemKey = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
  const testKey = `HKCU:\\Software\\Pkaizen-RegistryTest-${randomUUID()}`
  assert.ok(calls.every((script) => script.includes(systemKey)))
  const apply = calls[0].replaceAll(systemKey, testKey)
  const check = calls[1].replaceAll(systemKey, testKey)
  const script = `
    $ErrorActionPreference='Stop'
    try {
      New-Item -Path '${testKey}\\Tasks\\Games' -Force | Out-Null
      ${apply}
      $actual = & { ${check} }
      if ("$actual".Trim() -ne '1') { throw 'Unsigned DWORD verification failed' }
      Set-ItemProperty '${testKey}' -Name NetworkThrottlingIndex -Value 10 -Type DWord
      $inactive = & { ${check} }
      if ("$inactive".Trim() -ne '') { throw 'Default DWORD incorrectly marked applied' }
      'PASS'
    } finally {
      if (Test-Path '${testKey}') { Remove-Item '${testKey}' -Recurse -Force -ErrorAction Stop }
    }
  `
  const { stdout } = await promisify(execFile)('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')
  ], { windowsHide: true, timeout: 30_000 })
  assert.equal(stdout.trim(), 'PASS')
})

test('speed test bounds stalled requests and aborts without starting another phase', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController()
    let calls = 0
    let active = 0
    const { speedTest } = load('src/main/system/network.ts', {
      './hardware': {}, './powershell': {}, './i18n': { T: (english) => english }
    }, {
      AbortController,
      setTimeout: (callback) => setTimeout(callback, 10),
      fetch: (_url, options) => new Promise((_resolve, reject) => {
        calls++
        active++
        options.signal.addEventListener('abort', () => { active--; reject(new Error('aborted')) }, { once: true })
      })
    })
    const pending = speedTest(() => {}, controller.signal)
    if (cancel) {
      controller.abort()
      await assert.rejects(pending)
      assert.equal(calls, 4)
    } else {
      const result = await pending
      assert.equal(result.downMbps, null)
      assert.equal(result.upMbps, null)
      assert.equal(calls, 7)
    }
    assert.equal(active, 0)
  }
})

test('DNS rejects unknown presets without executing commands and preserves real errors', async () => {
  let calls = 0
  const { setDns } = load('src/main/system/network.ts', {
    './hardware': {}, './i18n': { T: (english) => english },
    './powershell': { ps: async (script, timeout, strict) => {
      calls++
      assert.equal(strict, true)
      assert.match(script, /No active IPv4 default route/)
      throw new Error('No route')
    } }
  })
  for (const name of ['bogus', '__proto__', 'constructor']) assert.equal((await setDns(name)).ok, false)
  assert.equal(calls, 0)
  const result = await setDns('cloudflare')
  assert.equal(result.ok, false)
  assert.match(result.message, /No route/)
})

test('temporary cleanup preserves recent files and directory links and never stops Windows Update', async () => {
  const scripts = []
  const { previewClean, runClean } = load('src/main/system/cleaner.ts', {
    './i18n': { T: (english) => english },
    './powershell': {
      psJson: async (script) => { scripts.push(script); return 0 },
      ps: async (script) => { scripts.push(script); return '' }
    }
  })
  const targets = await previewClean()
  assert.ok(!targets.some((target) => target.id === 'wu-cache'))
  await runClean(['user-temp', 'win-temp', 'wu-cache'])
  const temporaryScripts = scripts.filter((script) => script.includes('$cutoff'))
  assert.ok(temporaryScripts.length >= 4)
  for (const script of temporaryScripts) {
    assert.match(script, /AddDays\(-7\)/)
    assert.match(script, /ReparsePoint/)
    assert.doesNotMatch(script, /Remove-Item[^\n]*-Recurse/)
  }
  assert.ok(scripts.every((script) => !/Stop-Service|SoftwareDistribution/.test(script)))
})

test('driver installation reports partial failure instead of counting requested updates as installed', async () => {
  const { installDriverUpdates } = load('src/main/system/updater.ts', {
    './i18n': { T: (english) => english },
    './powershell': { psJson: async (script) => {
      assert.match(script, /GetUpdateResult\(\$index\)\.ResultCode -eq 2/)
      return { installed: 1, requested: 2, reboot: true, status: 'Partial failure' }
    } }
  })
  const result = await installDriverUpdates(['first', 'second'])
  assert.equal(result.ok, false)
  assert.equal(result.installed, 1)
  assert.equal(result.rebootRequired, true)
})

test('NVIDIA downloader checks each redirect and rejects lookalike or insecure domains', async () => {
  let requests = []
  let target = 'https://example.com/installer.exe'
  const { fetchNvidiaInstaller } = load('src/main/system/updater.ts', {
    './i18n': {}, './powershell': {}
  }, {
    URL,
    fetch: async (url, options) => {
      requests.push(url)
      assert.equal(options.redirect, 'manual')
      return requests.length === 1
        ? { status: 302, headers: { get: () => target }, body: { cancel: async () => {} } }
        : { status: 200 }
    }
  })
  for (const url of ['http://nvidia.com/a', 'https://nvidia.com.evil.test/a', 'https://user@nvidia.com/a']) {
    await assert.rejects(fetchNvidiaInstaller(url, new AbortController().signal), /official NVIDIA/)
  }
  assert.equal(requests.length, 0)
  await assert.rejects(fetchNvidiaInstaller('https://nvidia.com/a', new AbortController().signal), /official NVIDIA/)
  assert.equal(requests.length, 1)
  requests = []
  target = 'https://download.nvidia.com/a.exe'
  assert.equal((await fetchNvidiaInstaller('https://nvidia.com/a', new AbortController().signal)).status, 200)
  assert.equal(requests.length, 2)
})

test('cache invalidation prevents an older request from replacing a fresh language response', async () => {
  const { cached, invalidate } = load('src/renderer/src/lib/cache.ts')
  let completeOld
  const old = cached('drivers', () => new Promise((resolve) => { completeOld = resolve }))
  await Promise.resolve()
  invalidate()
  assert.equal(await cached('drivers', async () => 'French'), 'French')
  completeOld('English')
  await old
  assert.equal(await cached('drivers', async () => 'unexpected'), 'French')
  invalidate('drivers')
  await assert.rejects(cached('drivers', () => { throw new Error('sync failure') }), /sync failure/)
  assert.equal(await cached('drivers', async () => 'retry'), 'retry')
})

test('startup changes verify backups before removal and surface write errors', async () => {
  const { setStartupEnabled } = load('src/main/system/startup.ts', {
    './powershell': { ps: async (script, timeout, strict) => {
      assert.equal(strict, true)
      assert.match(script, /\$ErrorActionPreference='Stop'/)
      assert.ok(script.indexOf('Startup backup verification failed') < script.indexOf('Remove-ItemProperty'))
      assert.match(script, /already exists in the destination/)
      throw new Error('Backup write denied')
    } }
  })
  const result = await setStartupEnabled('Test program', false)
  assert.equal(result.ok, false)
  assert.match(result.message, /Backup write denied/)
})

test('browser detection does not invent an Edge installation', async () => {
  const { getBrowserReport, installBrowser } = load('src/main/system/browser.ts', {
    './i18n': { T: (english) => english },
    './powershell': {
      asArray: (value) => Array.isArray(value) ? value : value == null ? [] : [value],
      psJson: async () => ({ progId: 'FirefoxURL', installed: ['Firefox'], running: [] }),
      ps: async () => { throw new Error('Must not execute an unknown package') }
    }
  })
  const report = await getBrowserReport()
  assert.equal(report.defaultBrowser, 'firefox')
  assert.ok(!report.installed.includes('edge'))
  assert.equal((await installBrowser('__proto__')).ok, false)
})

test('update checks remain scheduled after an offline startup', async () => {
  const source = readFileSync(resolve(__dirname, '../src/main/index.ts'), 'utf8')
  const tree = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
  const declaration = tree.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name.text === 'setupAutoUpdate')
  const compiled = ts.transpileModule(declaration.getText(tree) + '\nsetupAutoUpdate()', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  let calls = 0
  let retry
  const autoUpdater = { on() {}, checkForUpdates: async () => { calls++; if (calls === 1) throw new Error('offline') } }
  await runInNewContext(compiled, {
    app: { isPackaged: true, getPath: () => 'test' },
    join: () => 'test', existsSync: () => false,
    console: { error() {} },
    setInterval: (callback, delay) => { retry = callback; assert.equal(delay, 30 * 60_000) },
    require: () => ({ autoUpdater })
  })
  assert.equal(calls, 1)
  assert.equal(typeof retry, 'function')
  await retry()
  assert.equal(calls, 2)
})

test('cleanup script deletes only old fixture files, preserving recent files and junction targets', { skip: process.platform !== 'win32' }, async () => {
  const fs = require('node:fs/promises')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')
  const { promisify } = require('node:util')
  const { execFile } = require('node:child_process')
  const root = await fs.mkdtemp(join(tmpdir(), 'pkaizen-clean-test-'))
  const temp = join(root, 'temp')
  const outside = join(root, 'outside')
  let script
  try {
    await fs.mkdir(temp)
    await fs.mkdir(outside)
    const old = join(temp, 'old.txt')
    const recent = join(temp, 'recent.txt')
    const protectedFile = join(outside, 'protected.txt')
    for (const file of [old, recent, protectedFile]) await fs.writeFile(file, 'fixture')
    const date = new Date(Date.now() - 10 * 24 * 60 * 60_000)
    await fs.utimes(old, date, date)
    await fs.utimes(protectedFile, date, date)
    await fs.symlink(outside, join(temp, 'junction'), 'junction')
    const { runClean } = load('src/main/system/cleaner.ts', {
      './i18n': {}, './powershell': { psJson: async () => 0, ps: async (value) => { script = value } }
    })
    await runClean(['user-temp'])
    const isolated = script.replaceAll('$env:TEMP', "'" + temp.replaceAll("'", "''") + "'")
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(isolated, 'utf16le').toString('base64')], { windowsHide: true, timeout: 30_000 })
    await assert.rejects(fs.access(old))
    await fs.access(recent)
    await fs.access(protectedFile)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('strict PowerShell rejects command errors even after partial output', async () => {
  const { ps } = load('src/main/system/powershell.ts', {
    child_process: { execFile: (_file, _args, _options, callback) => callback(new Error('failed'), 'partial output', 'Access denied') }
  })
  await assert.rejects(ps('test', 1000, true), /Access denied/)
  assert.equal(await ps('test'), 'partial output')
})

test('tweak writes stop on errors and never misreport an unverified setting as an admin failure', async () => {
  for (const mode of ['denied', 'unverified', 'success']) {
    const calls = []
    const { applyTweak } = load('src/main/system/optimizer.ts', {
      './i18n': { T: (english) => english },
      './powershell': { ps: async (script, timeout, strict) => {
        calls.push(script)
        assert.equal(strict, true)
        if (calls.length === 1) {
          assert.match(script, /\$ErrorActionPreference='Stop'/)
          assert.match(script, /\$LASTEXITCODE -ne 0/)
          if (mode === 'denied') throw new Error('Access denied by policy')
          return ''
        }
        return mode === 'success' ? '1' : '10'
      } }
    })
    const result = await applyTweak('hags-on')
    assert.equal(result.ok, mode === 'success')
    if (mode === 'denied') {
      assert.match(result.message, /Access denied by policy/)
      assert.equal(calls.length, 1)
    }
    if (mode === 'unverified') assert.doesNotMatch(result.message, /relaunch/i)
    if (mode === 'success') assert.match(result.message, /restart required/)
  }
})
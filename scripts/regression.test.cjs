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

const gaming = () => load('src/shared/gaming.ts', {}, { TextEncoder })
const recording = () => load('src/shared/recording.ts', { './gaming': gaming() }, { TextEncoder })

test('native displays preserve names, active Hz, portrait geometry and physical DPI, without a stale cache', () => {
  let displays = [
    { id: 1, label: 'PG27AQWP-W', displayFrequency: 540, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 },
    { id: 2, label: 'VG279QL1A', displayFrequency: 165, bounds: { x: -1080, y: 0, width: 1080, height: 1920 }, scaleFactor: 1 },
    { id: 3, label: '4K', displayFrequency: 0, bounds: { x: 2560, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.5 }
  ]
  const { getDisplays } = load('src/main/system/displays.ts', { electron: { screen: {
    getPrimaryDisplay: () => displays[0],
    getAllDisplays: () => displays,
    dipToScreenRect: (_window, bounds) => {
      const factor = displays.find((display) => display.bounds === bounds).scaleFactor
      return { ...bounds, width: bounds.width * factor, height: bounds.height * factor }
    }
  } } })
  assert.deepEqual(JSON.parse(JSON.stringify(getDisplays())).map(({ model, resX, resY, hz }) => [model, resX, resY, hz]), [
    ['PG27AQWP-W', 2560, 1440, 540], ['VG279QL1A', 1080, 1920, 165], ['4K', 3840, 2160, 0]
  ])
  displays = [{ ...displays[0], displayFrequency: 240 }]
  assert.equal(getDisplays().length, 1)
  assert.equal(getDisplays()[0].hz, 240)
})

test('published references match only exact supported desktop GPU and measured resolution', () => {
  const { referenceGpu, referencesFor, roundedFps } = load('src/renderer/src/lib/gameReferences.ts')
  assert.equal(referenceGpu('NVIDIA GeForce RTX 5070 Ti', false), 'RTX 5070 Ti')
  for (const model of ['RTX 5070', 'RTX 5070 Ti Laptop GPU', 'RTX 4070 Ti', 'RTX 4070 Super OC']) assert.equal(referenceGpu(model, false), null)
  for (const laptop of [true, null]) assert.equal(referenceGpu('RTX 5070 Ti', laptop), null)
  for (const [width, height] of [[1920, 1080], [1440, 2560], [0, 0]]) assert.equal(referencesFor('RTX 5070 Ti', false, width, height).length, 0)
  const rows = referencesFor('RTX 5070 Ti', false, 2560, 1440)
  assert.equal(rows.length, 35)
  assert.equal(rows[0].average, 479)
  assert.equal(rows[0].low1, 296)
  assert.equal(roundedFps(rows[0].average), 480)
  assert.equal(referencesFor('RTX 5070 Ti', false, 3840, 2160)[1].average, 67)
})

test('reference catalogue covers 20 actual games with sparse GPU coverage and separate settings', () => {
  const { REFERENCE_GAMES, SUPPORTED_GPUS, referencesFor, referenceScreenVerdict } = load('src/renderer/src/lib/gameReferences.ts')
  assert.equal(REFERENCE_GAMES.length, 20)
  assert.equal(new Set(REFERENCE_GAMES.map(({ id }) => id)).size, 20)
  assert.equal(SUPPORTED_GPUS.length, 7)
  let total = 0
  for (const gpu of SUPPORTED_GPUS) {
    for (const [width, height] of [[2560, 1440], [3840, 2160]]) {
      const rows = referencesFor(gpu, false, width, height)
      const games = new Set(rows.map(({ id }) => id))
      assert.equal(games.size, gpu === 'RTX 5070 Ti' ? 20 : gpu === 'RX 9070 XT' ? 15 : 5)
      assert.equal(rows.length, gpu === 'RTX 5070 Ti' ? 35 : gpu === 'RX 9070 XT' ? 30 : 5)
      assert.equal(new Set(rows.map(({ id, preset }) => `${id}:${preset}`)).size, rows.length)
      for (const row of rows) {
        assert.equal(row.gpu, gpu)
        assert.equal(row.width, width)
        assert.equal(row.height, height)
        assert.ok(Number.isFinite(row.average) && row.average > 0)
        assert.ok(Number.isFinite(row.low1) && row.low1 > 0 && row.low1 <= row.average)
        assert.ok(row.preset.length > 0)
        assert.match(row.chartUrl, /^https:\/\/www\.techspot\.com\/articles-info\/(?:2955|3130)\/bench\/[A-Za-z0-9-]+\.png$/)
        assert.equal(row.source.cpu, 'AMD Ryzen 7 9800X3D')
        assert.equal(row.source.verified, '2026-10-11')
        assert.ok(row.chartUrl.includes('3130') === row.source.url.includes('3130'))
        assert.ok(['in-game', 'built-in', 'unspecified'].includes(row.scene))
      }
      total += rows.length
    }
  }
  assert.equal(total, 180)
  const rows = referencesFor('RTX 5070 Ti', false, 2560, 1440)
  const apex = rows.filter(({ id }) => id === 'apex')
  assert.equal(apex.length, 2)
  assert.deepEqual(Array.from(apex, ({ average, low1, capFps }) => [average, low1, capFps]), [[300, 268, 300], [300, 260, 300]])
  assert.equal(apex[0].source.published, '2026-05')
  assert.equal(apex[0].source.os, 'Windows 11 25H2')
  assert.equal(referenceScreenVerdict(300, 268, 540, 300), 'capped')
  assert.equal(referenceScreenVerdict(300, 268, 240, 300), 'headroom')
  assert.equal(referenceScreenVerdict(163, 143, 540, 160), 'capped')
  assert.equal(referenceScreenVerdict(300, 268, 0, 300), 'unknown')
  const fortnite = rows.filter(({ id }) => id === 'fortnite')
  assert.deepEqual(Array.from(fortnite, ({ preset, average, low1 }) => [preset, average, low1]), [
    ['Performance Mode', 733, 398], ['Epic, Ray Tracing', 87, 75]
  ])
  const amd4k = referencesFor('AMD Radeon RX 9070 XT', false, 3840, 2160)
  assert.deepEqual(Array.from(amd4k.filter(({ id }) => id === 'apex'), ({ average, low1 }) => [average, low1]), [[240, 207], [211, 188]])
  assert.deepEqual(Array.from(amd4k.filter(({ id }) => id === 'fortnite'), ({ average, low1 }) => [average, low1]), [[528, 343], [45, 38]])
  assert.ok(rows.some(({ id }) => id === 'gta-enhanced'))
  for (const id of ['gta', 'warzone', 'minecraft']) assert.ok(!rows.some((row) => row.id === id), 'No substitution between games or editions')
  assert.ok(!referencesFor('RTX 5080', false, 2560, 1440).some(({ id }) => id === 'apex'), 'No newer two-GPU data assigned to another GPU')
  assert.equal(referencesFor('RX 9070 XT', false, 1920, 1080).length, 0)
  assert.equal(referencesFor('RX 9070 XT', true, 2560, 1440).length, 0)
})

const recordedCsv = (fps = 100, count = 3001) => 'Application,ProcessID,SwapChainAddress,TimeInSeconds,MsBetweenPresents\n' +
  Array.from({ length: count }, (_, index) => `game.exe,42,0x1,${(index / fps).toFixed(6)},${index ? (1000 / fps).toFixed(6) : 0}`).join('\n')

test('automatic recordings validate PID, one stream, ordered intervals and minimum duration; first interval is excluded', () => {
  const { parseRecording } = recording()
  const result = parseRecording(recordedCsv(), 42)
  assert.equal(result.summary.averageFps, 100)
  assert.equal(result.summary.durationSeconds, 30)
  assert.equal(result.initializationRows, 1)
  assert.equal(parseRecording(recordedCsv().replace('MsBetweenPresents', 'msBetweenPresents'), 42).summary.averageFps, 100)
  assert.throws(() => parseRecording(recordedCsv(), 43), /process/)
  assert.throws(() => parseRecording(recordedCsv().replace('0x1,0.010000', '0x2,0.010000'), 42), /Multiple/)
  assert.throws(() => parseRecording(recordedCsv(100, 121), 42), /25 seconds/)
  assert.throws(() => parseRecording(recordedCsv().replace('0.010000,10.000000', '0.010000,0'), 42), /invalid frame/)
  assert.throws(() => parseRecording(recordedCsv().replace('0.010000,10.000000', '0.000000,10.000000'), 42), /unordered/)
  assert.throws(() => parseRecording(recordedCsv().replace('0.010000,10.000000', '0.030000,10.000000'), 42), /Discontinuous/)
  assert.throws(() => parseRecording('Application,ProcessID\nx,42', 42), /Missing/)
})

test('performance verdict and baseline never call a different configuration normal; require three previous comparable runs', () => {
  const { baselineComparison, performanceVerdict, validRecording } = recording()
  const summary = gaming().summarizeFrames(Array(3000).fill(10))
  const current = { run: { version: 1, date: '2026-10-11T10:10:00Z', process: 'game', hardware: 'cpu,gpu,ram', summary, initializationRows: 1, warnings: [] },
    conditions: { resolution: '2560x1440', settings: 'Medium, native, cap off', scene: 'v1 route1', frameGeneration: 'off', target: 100 } }
  assert.ok(validRecording(current))
  assert.equal(performanceVerdict(summary, 100), 'met')
  assert.equal(performanceVerdict(summary, 144), 'below')
  assert.equal(performanceVerdict({ ...summary, low1Fps: 79.9 }, 100), 'uneven')
  assert.equal(performanceVerdict({ ...summary, low1Fps: 80 }, 100), 'met')
  const history = [1, 2, 3].map((day) => ({ ...current, run: { ...current.run, date: `2026-10-0${day}T10:10:00Z` } }))
  assert.equal(baselineComparison(current, history).kind, 'consistent')
  assert.equal(baselineComparison(current, history.slice(1)).kind, 'insufficient')
  for (const key of ['resolution', 'settings', 'scene', 'frameGeneration']) {
    assert.equal(baselineComparison({ ...current, conditions: { ...current.conditions, [key]: 'different' } }, history).kind, 'insufficient')
  }
  assert.equal(baselineComparison({ ...current, run: { ...current.run, hardware: '' } }, history).kind, 'insufficient')
  assert.equal(baselineComparison({ ...current, run: { ...current.run, summary: { ...summary, averageFps: 84.9 } } }, history).kind, 'lower')
  for (const averageFps of [85, 115]) assert.equal(baselineComparison({ ...current, run: { ...current.run, summary: { ...summary, averageFps } } }, history).kind, 'consistent')
  assert.equal(validRecording({ ...current, conditions: { ...current.conditions, target: NaN } }), false)
})

test('disk counters preserve unknown/error states and Windows source status, with live displays despite cached WMI', async () => {
  let hz = 540
  let probes = 0
  const raw = {
    bios: {}, os: {}, ram: [], diskWarnings: [],
    disks: [
      { model: 'SSD', health: 'Healthy', tempC: 39, hours: 0, wear: 0, error: '' },
      { model: 'USB', health: 'Unknown', tempC: null, hours: null, wear: null, error: 'Access denied' },
      { model: 'Bad data', health: '', tempC: 999, hours: -1, wear: 999, error: '' }
    ]
  }
  const { getDetailedInfo } = load('src/main/system/details.ts', {
    './hardware': { __esModule: true, default: { osInfo: async () => ({}), time: () => ({ uptime: 100 }) }, windowsName: () => 'Windows', windowsBuild: () => 1 },
    './powershell': { psJson: async () => { probes++; return raw }, asArray: (value) => value == null ? [] : Array.isArray(value) ? value : [value] },
    './displays': { getDisplays: () => [{ model: 'PG27AQWP-W', hz }] }
  }, { console: { error() {} } })
  const details = await getDetailedInfo()
  assert.equal(details.diskHealth[0].health, 'Healthy', 'Must not upgrade Windows status into a health verdict')
  assert.equal(details.diskHealth[0].wearPercent, 0, 'Zero is a reported counter, not inferred life remaining')
  assert.equal(details.diskHealth[0].powerOnHours, 0)
  assert.equal(details.diskHealth[1].wearPercent, null)
  assert.equal(details.diskHealth[1].error, 'Access denied')
  assert.equal(details.diskHealth[2].tempC, null)
  assert.equal(details.diskHealth[2].wearPercent, null)
  hz = 240
  assert.equal((await getDetailedInfo()).displays[0].hz, 240)
  assert.equal(probes, 1)
})

test('recording service validates targets, bounds capture arguments and stops only its own ETW session', async () => {
  const { EventEmitter } = require('node:events')
  const digest = 'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af'
  const spawns = []
  let live
  let collectorClosed = false
  let finishImmediately = true
  const service = load('src/main/system/recording.ts', {
    electron: { app: { getPath: () => 'C:\\fixture' } },
    crypto: { randomUUID: () => 'unique-fixture', createHash: () => ({ update: () => ({ digest: () => digest }) }) },
    'fs/promises': { readFile: async () => Buffer.alloc(980320) },
    os: { machine: () => 'x86_64' },
    './powershell': { ps: async () => JSON.stringify([{ pid: 42, name: 'game', title: 'Game', started: 'start-id' }]) },
    './sysinfo': { getGamingHardware: async () => ({ cpu: 'CPU', gpus: [{ model: 'GPU' }], ramGB: 32, warnings: [] }) },
    '../../shared/gaming': gaming(), '../../shared/recording': recording(),
    child_process: { spawn: (_exe, args, options) => {
      spawns.push({ args, options, collectorClosed })
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.pid = 999
      child.kill = () => child.emit('close', 1)
      if (args.includes('--terminate_existing_session')) {
        queueMicrotask(() => { child.emit('close', 0); collectorClosed = true; live.emit('close', 0) })
      } else {
        live = child
        collectorClosed = false
        queueMicrotask(() => {
          child.emit('spawn')
          if (finishImmediately) { child.stdout.emit('data', Buffer.from(recordedCsv())); child.emit('close', 0) }
        })
      }
      return child
    } }
  }, { process: { platform: 'win32', arch: 'x64', pid: 100 }, AbortController, AbortSignal })
  await assert.rejects(service.startRecording(0, 'start-id', 30, () => {}), /Invalid/)
  await assert.rejects(service.startRecording(42, 'wrong-start-id', 30, () => {}), /restarted/)
  const run = await service.startRecording(42, 'start-id', 30, () => {})
  assert.equal(run.summary.averageFps, 100)
  assert.equal(service.isRecording(), false)
  assert.ok(spawns[0].args.includes('--process_id'))
  assert.ok(!spawns[0].args.includes('--restart_as_admin'))
  assert.ok(!spawns[0].args.includes('--stop_existing_session'))
  assert.equal(spawns[0].options.shell, undefined)
  finishImmediately = false
  let notify
  const started = new Promise((resolve) => { notify = resolve })
  const pending = service.startRecording(42, 'start-id', 30, notify)
  await started
  await assert.rejects(service.startRecording(42, 'start-id', 30, () => {}), /already running/)
  await service.cancelRecording()
  assert.equal(await pending, null)
  assert.equal(service.isRecording(), false)
  assert.ok(spawns[2].args.includes('--terminate_existing_session'))
  assert.equal(spawns[1].args[3], spawns[2].args[1])
  assert.equal(spawns[2].collectorClosed, false)
  assert.equal(spawns[3].collectorClosed, true, 'Retry ETW cleanup after exit, including late-created sessions')
  assert.deepEqual(spawns[3].args, spawns[2].args, 'Both cleanup attempts target only the same owned session')
})

test('optimization profiles require explicit eligible selections and exclude risky automatic changes', () => {
  const { exclusionFor, profileSelection } = load('src/renderer/src/lib/optimization.ts')
  const tweaks = [
    { id: 'gamemode-on', recommended: true },
    { id: 'menu-delay', recommended: true },
    { id: 'transparency-off', recommended: false },
    { id: 'hags-on', needsAdmin: true, recommended: true },
    { id: 'power-high', laptopWarning: true, recommended: true },
    { id: 'unknown', recommended: true }
  ]
  const states = Object.fromEntries(tweaks.slice(0, 5).map((tw) => [tw.id, { available: true, applied: false }]))
  assert.deepEqual(Array.from(profileSelection('gaming', tweaks, states, false, true)), ['gamemode-on'])
  assert.deepEqual(Array.from(profileSelection('desktop', tweaks, states, false, true)), ['menu-delay', 'transparency-off'])
  assert.deepEqual(Array.from(profileSelection('recommended', tweaks, states, false, true)), ['gamemode-on', 'menu-delay'])
  assert.deepEqual(Array.from(profileSelection('recommended', tweaks, states, true, null)), [])
  assert.equal(exclusionFor(tweaks[0], { applied: true, available: true }, false, false), 'applied')
  assert.equal(exclusionFor(tweaks[0], { applied: false, available: false }, true, false), 'unknown')
  assert.equal(exclusionFor(tweaks[3], states['hags-on'], false, false), 'admin')
  assert.equal(exclusionFor(tweaks[4], states['power-high'], true, true), 'laptop')
})

test('tweak state failure rejects rather than reporting success-shaped inactive settings', async () => {
  const { getTweakStates } = load('src/main/system/optimizer.ts', {
    './powershell': { psJson: async () => null }, './i18n': {}
  }, { console: { error() {} } })
  await assert.rejects(getTweakStates(), /Invalid tweak state response/)
  const engine = load('src/main/system/optimizer.ts', {
    './powershell': { psJson: async () => ({ 'gamemode-on': false, 'menu-delay': 'invalid' }) }, './i18n': {}
  })
  const states = await engine.getTweakStates()
  assert.equal(states.find((st) => st.id === 'gamemode-on').available, true)
  assert.equal(states.find((st) => st.id === 'menu-delay').available, false)
})

test('transparency optimization restores original DWORD or absence using an isolated registry fixture', { skip: process.platform !== 'win32' }, async () => {
  const { promisify } = require('node:util')
  const { execFile } = require('node:child_process')
  const { randomUUID } = require('node:crypto')
  const root = 'HKCU:\\Software\\PkaizenTest_' + randomUUID()
  const key = root + '\\Personalize'
  const backup = root + '\\Backup'
  const execute = async (script) => (await promisify(execFile)('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from("$ErrorActionPreference='Stop';" + script, 'utf16le').toString('base64')
  ], { windowsHide: true, timeout: 30_000 })).stdout.trim()
  const engine = load('src/main/system/optimizer.ts', {
    './i18n': { T: (english) => english },
    './powershell': { ps: (script) => execute(script
      .replaceAll('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', key)
      .replaceAll('HKCU:\\Software\\PkaizenForge\\Backups\\Transparency', backup)) }
  })
  try {
    for (const initial of [null, 0, 1, 7]) {
      await execute(`if (Test-Path '${root}') { Remove-Item '${root}' -Recurse }; New-Item '${key}' -Force | Out-Null`)
      if (initial !== null) await execute(`New-ItemProperty '${key}' -Name EnableTransparency -Value ${initial} -PropertyType DWord | Out-Null`)
      assert.equal((await engine.applyTweak('transparency-off')).ok, true)
      assert.equal((await engine.applyTweak('transparency-off')).ok, true, 'Reapply must preserve the first backup')
      const reverted = await engine.revertTweak('transparency-off')
      assert.equal(reverted.ok, true, reverted.message)
      assert.equal(await execute(`$item=Get-Item '${key}'; if ($item.GetValueNames() -contains 'EnableTransparency') { $item.GetValue('EnableTransparency') } else { 'absent' }`), initial === null ? 'absent' : String(initial))
      assert.equal(await execute(`Test-Path '${backup}'`), 'False')
    }
    assert.equal((await engine.revertTweak('transparency-off')).ok, false, 'Must not guess a missing backup')
    await execute(`New-ItemProperty '${key}' -Name EnableTransparency -Value 'custom' -PropertyType String -Force | Out-Null`)
    assert.equal((await engine.applyTweak('transparency-off')).ok, false)
    assert.equal(await execute(`(Get-Item '${key}').GetValue('EnableTransparency')`), 'custom')
  } finally {
    await execute(`if (Test-Path '${root}') { Remove-Item '${root}' -Recurse }`)
  }
})

test('gaming CSV accepts raw PresentMon and decimal-comma frame times without estimating FPS', () => {
  const { parseCapture, summarizeFrames } = gaming()
  const csv = '\uFEFFApplication,ProcessID,SwapChainAddress,MsBetweenPresents\r\n' +
    Array.from({ length: 120 }, () => '"Game, Edition.exe",42,0x1,10').join('\r\n')
  const capture = parseCapture(csv)
  assert.equal(capture.frames.length, 120)
  assert.equal(summarizeFrames(capture.frames).averageFps, 100)
  for (const separator of [';', '\t']) {
    const decimal = 'FrameTime (ms)' + separator + 'Other\n' + Array.from({ length: 120 }, () => `12,5${separator}x`).join('\n')
    assert.equal(summarizeFrames(parseCapture(decimal).frames).averageFps, 80)
  }
  assert.equal(parseCapture('frametime_ms\n' + Array(120).fill('20').join('\n')).frames[0], 20)
})

test('gaming capture rejects unsupported, mixed, malformed, negative and oversized data', () => {
  const { parseCapture, MAX_CAPTURE_FRAMES, MAX_CAPTURE_BYTES } = gaming()
  const fail = (text, code) => assert.throws(() => parseCapture(text), (error) => error.code === code)
  fail('AverageFPS\n144', 'column')
  fail('TimeInSeconds\n0.01', 'column')
  fail('MsBetweenPresents,Frametime\n10,10', 'column')
  for (const value of ['0', '-1', 'NaN', 'Infinity', '0x10', '', '12ms']) {
    fail(`FrameTime (ms),Other\n${value},x`, 'value')
  }
  fail('FrameTime (ms),Other\n10', 'format')
  fail('FrameTime (ms)\n"10', 'format')
  fail('Application,MsBetweenPresents\nA,10\nB,10', 'mixed')
  fail('ProcessID,SwapChainAddress,MsBetweenPresents\n1,0x1,10\n1,0x2,10', 'mixed')
  fail('FrameTime (ms)\n10', 'short')
  fail('FrameTime (ms)\n' + Array(MAX_CAPTURE_FRAMES + 1).fill('10').join('\n'), 'size')
  fail('x'.repeat(MAX_CAPTURE_BYTES + 1), 'size')
  fail('\n'.repeat(MAX_CAPTURE_FRAMES + 2), 'size')
})

test('gaming metrics use total time, slowest-one-percent mean, nearest-rank p99 and exact thresholds', () => {
  const { summarizeFrames, targetCoverage, frameBuckets } = gaming()
  const frames = [...Array(990).fill(10), ...Array(10).fill(100)]
  const stats = summarizeFrames(frames)
  assert.equal(stats.durationSeconds, 10.9)
  assert.equal(stats.averageFps, 1000000 / 10900)
  assert.equal(stats.low1Fps, 10)
  assert.equal(stats.p99Ms, 10)
  assert.equal(stats.maxMs, 100)
  assert.equal(stats.over50, 10)
  assert.equal(stats.over100, 0)
  assert.equal(targetCoverage(frames, 100), 99)
  assert.equal(targetCoverage(frames, 120), 0)
  assert.equal(targetCoverage(Array(120).fill(1000 / 144), 144), 100)
  assert.throws(() => targetCoverage(frames, 0))
  assert.throws(() => summarizeFrames(Array(120).fill(NaN)))
  const chart = frameBuckets([...Array(999).fill(10), 250])
  assert.ok(chart.length <= 100)
  assert.equal(Math.max(...chart), 250)
})

test('gaming sessions validate saved shape and never compare different games, scenes or generated frames', () => {
  const { validSession, summarizeFrames, sameScenario } = gaming()
  const context = { game: 'Game', resolution: '1920x1080', scene: 'Route', settings: 'Medium', frameGeneration: 'off' }
  const session = { version: 1, date: new Date().toISOString(), context, summary: summarizeFrames(Array(4000).fill(10)) }
  assert.ok(validSession(session))
  assert.equal(validSession({ ...session, date: 'invalid' }), false)
  assert.equal(validSession({ ...session, summary: { ...session.summary, low1Fps: 99999 } }), false)
  assert.equal(validSession({ ...session, context: { ...context, frameGeneration: 'maybe' } }), false)
  assert.equal(validSession({ ...session, summary: { ...session.summary, count: 100 } }), false)
  assert.ok(sameScenario(context, { ...context, settings: 'Low' }))
  for (const change of [{ game: 'Different' }, { resolution: '2560x1440' }, { scene: 'Other' }, { frameGeneration: 'on' }]) {
    assert.equal(sameScenario(context, { ...context, ...change }), false)
  }
})

test('screen advice is conservative, excludes short or generated captures, and never extrapolates resolution', () => {
  const { assessDisplay, summarizeFrames, gameGuide } = gaming()
  const display = { resX: 1920, resY: 1080, hz: 60 }
  const session = (fps, game = 'Game') => ({
    version: 1, date: new Date().toISOString(),
    context: { game, resolution: '1920 × 1080', settings: 'Medium', scene: 'Route', frameGeneration: 'off' },
    summary: summarizeFrames(Array(6000).fill(1000 / fps))
  })
  assert.equal(assessDisplay({ ...display, hz: 0 }, [session(144)]).kind, 'unknown')
  assert.equal(assessDisplay(display, []).kind, 'no-data')
  for (const context of [{ resolution: '2560x1440' }, { frameGeneration: 'on' }, { frameGeneration: 'unknown' }]) {
    const sample = session(144)
    sample.context = { ...sample.context, ...context }
    assert.equal(assessDisplay(display, [sample]).kind, 'no-data')
  }
  const short = session(144)
  short.summary = summarizeFrames(Array(120).fill(10))
  assert.equal(assessDisplay(display, [short]).kind, 'no-data')
  assert.equal(assessDisplay(display, [session(120)]).suggestedHz, 120)
  assert.equal(assessDisplay(display, [session(45)]).kind, 'limited')
  assert.equal(assessDisplay(display, [session(60)]).kind, 'balanced')
  const advice = assessDisplay(display, [session(144, 'A'), session(165, 'B'), session(120, 'C'), session(240, 'A')])
  assert.equal(advice.games, 3)
  assert.equal(advice.suggestedHz, 120)
  assert.equal(assessDisplay(display, [session(240), session(40, 'Slow game')]).kind, 'limited')
  assert.equal(gameGuide('Grand Theft Auto V Enhanced').id, 'gta')
  assert.equal(gameGuide('Cyberpunk 2077').id, 'cyberpunk')
  assert.equal(gameGuide('Unlisted Game').id, 'other')
})

test('installed games parse Steam and Epic manifests without trusting incomplete or traversal paths', () => {
  const { steamGame, epicGame, vdfPairs } = load('src/main/system/games.ts', { './powershell': {} })
  const manifest = '"AppState" { "appid" "730" "name" "Counter-Strike 2" "StateFlags" "4" "installdir" "Counter-Strike Global Offensive" }'
  assert.equal(steamGame(manifest, 'C:\\Steam').name, 'Counter-Strike 2')
  assert.equal(steamGame(manifest.replace('"4"', '"2"'), 'C:\\Steam'), null)
  assert.equal(steamGame(manifest.replace('"Counter-Strike Global Offensive"', '"..\\\\Windows"'), 'C:\\Steam'), null)
  assert.equal(vdfPairs('"path" "D:\\\\SteamLibrary"')[0][1], 'D:\\SteamLibrary')
  const epic = { DisplayName: 'Fortnite', AppName: 'Fortnite', InstallLocation: 'C:\\Games\\Fortnite', bIsIncompleteInstall: false }
  assert.equal(epicGame(JSON.stringify(epic)).launcher, 'Epic Games')
  assert.equal(epicGame(JSON.stringify({ ...epic, bIsIncompleteInstall: true })), null)
  assert.equal(epicGame(JSON.stringify({ ...epic, InstallLocation: '\\\\server\\share' })), null)
  assert.throws(() => epicGame('{broken'))
})

test('installed game discovery checks actual folders, extra Steam drives, Epic and partial failures', { skip: process.platform !== 'win32' }, async () => {
  const fs = require('node:fs/promises')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')
  const root = await fs.mkdtemp(join(tmpdir(), 'pkaizen-games-test-'))
  try {
    const steam = join(root, 'Steam')
    const second = join(root, 'Second')
    const epic = join(root, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
    await fs.mkdir(join(steam, 'steamapps'), { recursive: true })
    await fs.mkdir(join(second, 'steamapps', 'common', 'Test'), { recursive: true })
    await fs.mkdir(epic, { recursive: true })
    await fs.writeFile(join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "1" { "path" "${second.replaceAll('\\', '\\\\')}" } }`)
    await fs.writeFile(join(second, 'steamapps', 'appmanifest_42.acf'), '"appid" "42" "name" "Installed" "StateFlags" "4" "installdir" "Test"')
    await fs.writeFile(join(second, 'steamapps', 'appmanifest_43.acf'), '"appid" "43" "name" "Stale" "StateFlags" "4" "installdir" "Missing"')
    await fs.writeFile(join(epic, 'game.item'), JSON.stringify({ AppName: 'Test', DisplayName: 'Epic game', InstallLocation: second }))
    await fs.writeFile(join(epic, 'broken.item'), '{invalid')
    const { getInstalledGames } = load('src/main/system/games.ts', {
      './powershell': { ps: async () => steam }
    }, { process: { env: { ProgramData: root } }, console: { error() {} } })
    const result = await getInstalledGames()
    assert.deepEqual(Array.from(result.games, (game) => game.name), ['Epic game', 'Installed'])
    assert.equal(result.warnings.length, 1)
    assert.match(result.warnings[0], /broken.item/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

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
    './displays': { getDisplays: () => [] },
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
  assert.equal(result.gpuMs, null)
})

test('Forge GPU timing uses timer queries, rejects disjoint clocks, and releases every query', async () => {
  for (const mode of ['measured', 'unsupported', 'disjoint', 'invalid']) {
    let clock = 0
    let queries = 0
    let deleted = 0
    let lost = false
    const ext = { TIME_ELAPSED_EXT: 100, GPU_DISJOINT_EXT: 101 }
    const gl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
      ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, QUERY_RESULT_AVAILABLE: 8, QUERY_RESULT: 9,
      COLOR_BUFFER_BIT: 10, TRIANGLES: 11, SYNC_GPU_COMMANDS_COMPLETE: 12, WAIT_FAILED: 13, TIMEOUT_EXPIRED: 14,
      getExtension: (name) => name === 'EXT_disjoint_timer_query_webgl2' ? mode === 'unsupported' ? null : ext :
        name === 'WEBGL_lose_context' ? { loseContext: () => { lost = true } } : null,
      getParameter: () => mode === 'disjoint',
      createProgram: () => ({}), createBuffer: () => ({}), createShader: () => ({}),
      createQuery: () => { queries++; return {} },
      deleteQuery: () => { deleted++ },
      getQueryParameter: (_query, parameter) => parameter === 8 ? true : mode === 'invalid' ? NaN : 2_000_000,
      getShaderParameter: () => true, getProgramParameter: () => true,
      getAttribLocation: () => 0, getUniformLocation: () => ({}),
      isContextLost: () => false, clientWaitSync: () => 15, fenceSync: () => ({})
    }
    for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'useProgram', 'bindBuffer',
      'bufferData', 'enableVertexAttribArray', 'vertexAttribPointer', 'viewport', 'clearColor', 'clear', 'uniform1f',
      'beginQuery', 'endQuery', 'drawArrays', 'flush', 'deleteSync', 'deleteShader', 'deleteBuffer', 'deleteProgram']) {
      gl[name] = () => {}
    }
    const { runGpuBench } = load('src/renderer/src/lib/benchmark.ts', {}, {
      performance: { now: () => { clock += 16; return clock } },
      setTimeout: (fn) => setTimeout(fn, 0)
    })
    const result = await runGpuBench({ getContext: () => gl, width: 1280, height: 720 }, new AbortController().signal)
    assert.equal(result.gpuMs, mode === 'measured' ? 2 : null)
    assert.equal(queries, deleted)
    assert.ok(lost)
  }
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

test('driver assistants match mixed components and reject unsupported selections and signatures', async () => {
  let signature = { status: 'Valid', publisher: 'Intel Corporation' }
  let machine = { manufacturer: 'ASUSTeK COMPUTER INC.', model: 'Test laptop' }
  let graphics = { controllers: [{ vendor: 'NVIDIA', model: 'GeForce RTX 4060' }] }
  const installers = load('src/main/system/driverInstallers.ts', {
    './i18n': { T: (english) => english },
    os: { platform: () => 'win32', arch: () => 'x64', release: () => '10.0.26200.0' },
    './hardware': { __esModule: true, default: {
      graphics: async () => graphics,
      cpu: async () => ({ brand: 'AMD Ryzen 7 7800X3D', manufacturer: 'AMD' }),
      system: async () => machine
    } },
    './drivers': { scanDrivers: async () => [{ device: 'Intel Wi-Fi 6', provider: 'Intel', className: 'NET' }] },
    './powershell': { ps: async (script, timeout, strict) => {
      assert.equal(strict, true)
      assert.match(script, /Get-AuthenticodeSignature -LiteralPath/)
      return JSON.stringify(signature)
    } }
  })
  assert.equal((await installers.getDriverInstallers()).map(option => option.id).join(','), 'asus,nvidia,amd,intel')
  machine = { manufacturer: 'Custom PC', model: 'Desktop' }
  graphics = { controllers: [{ vendor: 'NVIDIA', model: 'GeForce GTX 750' }] }
  assert.equal((await installers.getDriverInstallers()).map(option => option.id).join(','), 'amd,intel')
  assert.equal((await installers.launchDriverInstaller('nvidia')).ok, false)
  assert.equal((await installers.launchDriverInstaller('__proto__')).ok, false)
  await installers.verifyDriverSignature('fixture.exe', ['Intel Corporation'])
  signature = { status: 'Valid', publisher: 'Unrelated publisher' }
  await assert.rejects(installers.verifyDriverSignature('fixture.exe', ['Intel Corporation']))
  signature = { status: 'HashMismatch', publisher: 'Intel Corporation' }
  await assert.rejects(installers.verifyDriverSignature('fixture.exe', ['Intel Corporation']))
})

test('driver installer URLs come from official pages and all redirects remain allowlisted', async () => {
  let malicious = false
  const calls = []
  const installers = load('src/main/system/driverInstallers.ts', {
    './i18n': { T: (english) => english }, './hardware': {}, './drivers': {}, './powershell': {}
  }, { URL, AbortSignal, fetch: async (url) => {
    calls.push(url)
    if (malicious) return new Response(null, { status: 302, headers: { location: 'https://amd.com.attacker.test/setup.exe' } })
    return new Response('<a href="https://attacker.test/minimalsetup.exe">Bad</a><a href="https://drivers.amd.com/drivers/installer/26/amd-minimalsetup_web.exe">Download</a>')
  } })
  const url = await installers.resolveDriverInstaller('amd', AbortSignal.timeout(1000))
  assert.equal(url, 'https://drivers.amd.com/drivers/installer/26/amd-minimalsetup_web.exe')
  assert.equal(installers.isOfficialDownload(new URL('https://user:pass@amd.com/file.exe'), ['amd.com']), false)
  malicious = true
  await assert.rejects(installers.fetchOfficialDownload(url, ['amd.com'], AbortSignal.timeout(1000)), /unofficial source/)
  assert.equal(calls.length, 2)
})

test('browser detection handles suffixed IDs, executable identity and separate protocol defaults', async () => {
  const browser = load('src/main/system/browser.ts', {
    './i18n': { T: (english) => english },
    './powershell': {
      asArray: (value) => value == null ? [] : Array.isArray(value) ? value : [value],
      psJson: async (script) => {
        assert.match(script, /AssocQueryString/)
        assert.match(script, /Read-Association 'https'/)
        assert.match(script, /RegisteredApplications/)
        return { http: { progId: 'BraveHTML.ABC' }, https: { progId: 'VivaldiHTM.XYZ' }, installed: ['Opera GX Stable', 'Firefox'], running: [] }
      }
    }
  })
  for (const [value, expected] of [['BraveHTML.ABC', 'brave'], ['VivaldiHTM.XYZ', 'vivaldi'], ['FirefoxURL-123', 'firefox'], ['MSEdgeHTM', 'edge'], ['Opera GX Stable', 'operagx'], ['Unknown', null]]) {
    assert.equal(browser.identifyBrowser(value), expected)
  }
  assert.equal(browser.identifyBrowser('FirefoxURL-123', '"C:\\Program Files\\LibreWolf\\librewolf.exe" "%1"'), 'librewolf')
  const report = await browser.getBrowserReport()
  assert.equal(report.defaultBrowser, 'vivaldi')
  assert.equal(report.defaults.http, 'brave')
  assert.equal(report.defaults.https, 'vivaldi')
  assert.ok(report.installed.includes('operagx'))
  assert.ok(report.installed.includes('vivaldi'))
  assert.ok(!report.installed.includes('edge'))
})

test('driver search excludes hidden updates and distinguishes errors from no applicable drivers', async () => {
  let output = '[]'
  const { searchDriverUpdates } = load('src/main/system/updater.ts', {
    './i18n': { T: (english) => english },
    './powershell': { ps: async (script, timeout, strict) => {
      assert.equal(strict, true)
      assert.match(script, /IsInstalled=0 and IsHidden=0 and Type='Driver'/)
      assert.match(script, /\$searcher.Online = \$true/)
      assert.match(script, /\$result.ResultCode -ne 2/)
      assert.match(script, /\$u.DriverClass -eq 'Firmware'/)
      if (output === 'offline') throw new Error('Windows Update unavailable')
      return output
    } }
  })
  assert.equal((await searchDriverUpdates()).length, 0)
  output = JSON.stringify([{ id: 'device-update', title: 'Applicable driver' }])
  assert.equal((await searchDriverUpdates())[0].id, 'device-update')
  for (const invalid of ['', 'null', '{}', '[{}]', 'offline']) {
    output = invalid
    await assert.rejects(searchDriverUpdates())
  }
})

test('driver installation reports partial failure instead of counting requested updates as installed', async () => {
  const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
  let calls = 0
  let failure = false
  const { installDriverUpdates } = load('src/main/system/updater.ts', {
    './i18n': { T: (english) => english },
    './powershell': { ps: async (script, timeout, strict) => {
      calls++
      assert.equal(strict, true)
      assert.match(script, /\$item.ResultCode -eq 2/)
      assert.match(script, /\$update.IsDownloaded/)
      assert.match(script, /\$installer.Updates = \$ready/)
      assert.match(script, /RebootRequiredBeforeInstallation/)
      assert.match(script, /IsHidden=0/)
      assert.match(script, /\$u.DriverClass -ne 'Firmware'/)
      assert.doesNotMatch(script, /shutdown|pnputil|ForceInstall/)
      if (failure) throw new Error('Service disabled')
      return JSON.stringify({ installed: 1, requested: 2, reboot: true, results: [
        { id: ids[0], title: 'Network driver', ok: true, message: 'Result: 2' },
        { id: ids[1], title: 'Audio driver', ok: false, message: 'Download HRESULT: 0x80070005' }
      ] })
    } }
  })
  for (const invalid of [[], ['first'], ["'; shutdown /r"], null]) {
    assert.equal((await installDriverUpdates(invalid)).ok, false)
  }
  assert.equal(calls, 0)
  const result = await installDriverUpdates([...ids, ids[0]])
  assert.equal(result.ok, false)
  assert.equal(result.installed, 1)
  assert.equal(result.rebootRequired, true)
  assert.equal(result.results[1].ok, false)
  failure = true
  const failed = await installDriverUpdates(ids)
  assert.match(failed.message, /Service disabled/)
  assert.doesNotMatch(failed.message, /admin/i)
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

test('browser association query executes on Windows without changing settings', { skip: process.platform !== 'win32' }, async () => {
  const powershell = load('src/main/system/powershell.ts')
  const { getBrowserReport } = load('src/main/system/browser.ts', {
    './i18n': { T: (english) => english }, './powershell': powershell
  })
  const report = await getBrowserReport()
  assert.ok(Array.isArray(report.installed))
  assert.ok(Object.hasOwn(report.defaults, 'http'))
  assert.ok(Object.hasOwn(report.defaults, 'https'))
})

test('browser defaults use registered Windows settings and never claim to change protected associations', async () => {
  const opened = []
  const { openBrowserDefaults } = load('src/main/system/browser.ts', {
    './i18n': { T: (english) => english },
    electron: { shell: { openExternal: async (url) => opened.push(url) } },
    os: { release: () => '10.0.26200.0' },
    './powershell': {
      asArray: (value) => value || [],
      psJson: async () => ({ http: {}, https: {}, installed: ['Vivaldi'], running: [], registrations: [{ name: 'Vivaldi.ABC', identity: 'VivaldiHTM.ABC', scope: 'user' }] })
    }
  })
  const result = await openBrowserDefaults('vivaldi')
  assert.equal(result.ok, true)
  assert.match(result.message, /Confirm/)
  assert.equal(opened[0], 'ms-settings:defaultapps?registeredAppUser=Vivaldi.ABC')
  assert.equal((await openBrowserDefaults('unknown')).ok, false)
  assert.equal(opened.length, 1)
})

test('browser detection does not invent an Edge installation', async () => {
  const { getBrowserReport, installBrowser } = load('src/main/system/browser.ts', {
    './i18n': { T: (english) => english },
    './powershell': {
      asArray: (value) => Array.isArray(value) ? value : value == null ? [] : [value],
      psJson: async () => ({ http: { progId: 'FirefoxURL' }, https: { progId: 'FirefoxURL' }, installed: ['Firefox'], running: [] }),
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
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm, readFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { resolve, join } = require('node:path')
const { _electron } = require('playwright')
const { expect } = require('@playwright/test')
const sharp = require('sharp')

test('Electron opens, remains idle, protects actions and completes or cancels benchmarks', { timeout: 180_000 }, async () => {
  const userData = await mkdtemp(join(tmpdir(), 'pkaizen-test-'))
  const artifacts = resolve(__dirname, '../release/smoke')
  await mkdir(artifacts, { recursive: true })
  let electron
  try {
    const executablePath = process.env.PKAIZEN_TEST_EXE
    electron = await _electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: [...(executablePath ? [] : [resolve(__dirname, '..')]), `--user-data-dir=${userData}`],
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        !['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL'].includes(key.toUpperCase()))),
      timeout: 30_000
    })
    const page = await electron.firstWindow()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForSelector('.sidebar')
    await electron.evaluate(({ ipcMain }) => {
      globalThis.smoke = { reportCalls: 0, applied: [], cancelled: 0, reportReady: false }
      const replace = (channel, callback) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, callback) }
      replace('system:report', async () => {
        globalThis.smoke.reportCalls++
        if (!globalThis.smoke.reportReady) throw new Error('Simulated unavailable inventory')
        return { isLaptop: true }
      })
      replace('system:pendingReboot', () => false)
      replace('system:isAdmin', () => false)
      replace('tweaks:list', () => [
        { id: 'portable-risk', name: 'Portable risk', category: 'performance', recommended: true, laptopWarning: true },
        { id: 'safe', name: 'Safe fixture', category: 'performance', recommended: true, laptopWarning: false }
      ])
      replace('tweaks:states', () => [{ id: 'portable-risk', applied: false, available: true }, { id: 'safe', applied: false, available: true }])
      replace('tweaks:relevance', () => [])
      replace('tweaks:apply', (_event, id) => { globalThis.smoke.applied.push(id); return { ok: true } })
      replace('bench:disk', () => ({ writeMBps: 100, readMBps: 200, sizeMB: 256 }))
      replace('bench:cancel', () => { globalThis.smoke.cancelled++ })
      replace('games:installed', () => ({
        games: [{ id: 'epic:test', name: 'Cyberpunk 2077', launcher: 'Epic Games', installPath: 'C:\\Games\\Cyberpunk' }],
        warnings: ['Steam: test library unavailable']
      }))
      replace('system:details', () => ({
        displays: [{ model: 'Test display', main: true, resX: 1920, resY: 1080, hz: 60, connection: 'HDMI' }]
      }))
      replace('clean:preview', () => [
        { id: 'user-temp', name: 'Temporary files', description: 'Old files', needsAdmin: false, sizeMB: 5 },
        { id: 'recycle', name: 'Recycle bin', description: 'Deleted files', needsAdmin: false, sizeMB: 10 }
      ])
      replace('clean:run', () => [{ id: 'user-temp', ok: false, freedMB: 0, message: 'Cleanup denied' }])
      replace('drivers:links', () => [])
      replace('drivers:gpuStatus', () => [{ vendor: 'intel', model: 'Intel test GPU', note: 'Test', upToDate: null }])
      replace('drivers:problems', () => [])
      replace('drivers:checklist', () => [])
      replace('drivers:scan', () => [])
      replace('drivers:installIntelDsa', () => { throw new Error('Installer unavailable') })
      replace('drivers:installers', () => [
        { id: 'intel', name: 'Intel Driver & Support Assistant', hardware: 'Intel Wi-Fi 6 AX200', kind: 'installer', note: 'Official assistant' },
        { id: 'asus', name: 'MyASUS', hardware: 'ASUS test laptop', kind: 'store', note: 'Model-specific updates' }
      ])
      replace('drivers:launchInstaller', () => new Promise((resolve) => { globalThis.smoke.finishInstaller = resolve }))
      replace('drivers:wuSearch', () => { throw new Error('Windows Update service unavailable') })
      replace('startup:list', () => [{ name: 'Test startup', command: 'test.exe', scope: 'user', enabled: true, canToggle: true }])
      replace('startup:set', () => { throw new Error('Startup access denied') })
      replace('net:info', () => ({ iface: 'Test adapter', type: 'Ethernet', gateway: null, speedMbps: 100 }))
      replace('net:ping', () => [])
      replace('net:dns', () => [])
      replace('net:speedtest', () => new Promise((resolve) => { globalThis.smoke.finishSpeed = resolve }))
      replace('net:cancelSpeed', () => { globalThis.smoke.finishSpeed?.({ downMbps: null, upMbps: null }) })
      replace('browser:report', () => ({ defaultBrowser: 'vivaldi', defaults: { http: 'brave', https: 'vivaldi' }, installed: ['vivaldi', 'firefox'], running: [] }))
      replace('browser:defaults', (_event, id) => { globalThis.smoke.defaultRequested = id; return { ok: true, message: 'Confirm in Windows Settings' } })
      replace('browser:install', () => { throw new Error('Browser install unavailable') })
      replace('report:generate', () => { throw new Error('Documents folder unavailable') })
    })
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pkaizen-lang', 'en') })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Scan hardware', exact: true })).toBeVisible()
    assert.equal(await electron.evaluate(() => globalThis.smoke.reportCalls), 0)
    assert.equal(await page.evaluate(() => getComputedStyle(document.body, '::before').animationName), 'none')
    await page.screenshot({ path: join(artifacts, 'dashboard.png'), animations: 'disabled' })

    await page.locator('.nav-btn').nth(1).click()
    await expect(page.locator('.switch').first()).toBeVisible()
    await expect(page.locator('.toolbar .primary')).toBeDisabled()
    assert.deepEqual(await electron.evaluate(() => globalThis.smoke.applied), [])
    await electron.evaluate(() => { globalThis.smoke.reportReady = true })
    await page.locator('.nav-btn').nth(0).click()
    await page.locator('.nav-btn').nth(1).click()
    await page.getByRole('button', { name: 'Legacy recommendations (review carefully)', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Include: Portable risk', exact: true })).toBeDisabled()
    await expect(page.getByRole('checkbox', { name: 'Include: Safe fixture', exact: true })).toBeChecked()
    await page.screenshot({ path: join(artifacts, 'optimization-plan.png') })
    await expect(page.locator('.toolbar .primary')).toBeEnabled()
    await page.locator('.toolbar .primary').click()
    await expect(page.getByRole('status').filter({ hasText: '1 applied, 0 failed, 0 skipped' })).toBeVisible()
    await expect(page.locator('.toolbar .primary')).toBeDisabled()
    assert.deepEqual(await electron.evaluate(() => globalThis.smoke.applied), ['safe'])

    await electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('tweaks:apply')
      ipcMain.handle('tweaks:apply', () => ({ ok: false, message: 'Setting blocked by policy' }))
    })
    await page.getByRole('button', { name: 'Legacy recommendations (review carefully)', exact: true }).click()
    await page.locator('.toolbar .primary').click()
    await expect(page.getByRole('alert')).toHaveText('Setting blocked by policy')

    await electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('tweaks:states')
      ipcMain.handle('tweaks:states', () => { throw new Error('Simulated registry unavailable') })
    })
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Include: Safe fixture', exact: true })).toBeDisabled()
    await expect(page.locator('.toolbar .primary')).toBeDisabled()
    await electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('tweaks:states')
      ipcMain.handle('tweaks:states', () => [{ id: 'portable-risk', available: true, applied: false }, { id: 'safe', available: true, applied: false }])
    })
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
    await expect(page.locator('.toolbar .primary')).toBeEnabled()
    await page.locator('.row').filter({ hasText: 'Safe fixture' }).locator('.switch').click()
    await expect(page.getByRole('alert')).toHaveText('Setting blocked by policy')

    await electron.evaluate(({ ipcMain }) => {
      globalThis.smoke.planWrites = []
      ipcMain.removeHandler('tweaks:list')
      ipcMain.handle('tweaks:list', () => ['menu-delay', 'transparency-off'].map((id) => ({
        id, name: id, category: 'systeme', recommended: false, laptopWarning: false, needsAdmin: false
      })))
      ipcMain.removeHandler('tweaks:states')
      ipcMain.handle('tweaks:states', () => ['menu-delay', 'transparency-off'].map((id) => ({ id, available: true, applied: false })))
      ipcMain.removeHandler('tweaks:apply')
      ipcMain.handle('tweaks:apply', (_event, id) => {
        globalThis.smoke.planWrites.push(id)
        return new Promise((resolve) => { globalThis.smoke.finishPlan = resolve })
      })
    })
    await page.locator('.nav-btn').nth(0).click()
    await page.locator('.nav-btn').nth(1).click()
    await page.getByRole('button', { name: 'Desktop comfort', exact: true }).click()
    await page.getByRole('button', { name: 'Apply selection (2)', exact: false }).click()
    await expect.poll(() => electron.evaluate(() => globalThis.smoke.planWrites.length)).toBe(1)
    await page.getByRole('button', { name: 'Stop after current action', exact: true }).click()
    await electron.evaluate(() => globalThis.smoke.finishPlan({ ok: true }))
    await expect(page.getByRole('status').filter({ hasText: '1 applied, 0 failed, 1 skipped' })).toBeVisible()
    assert.deepEqual(await electron.evaluate(() => globalThis.smoke.planWrites), ['menu-delay'])
    await page.getByRole('button', { name: 'Desktop comfort', exact: true }).click()
    await page.getByRole('button', { name: 'Apply selection (2)', exact: false }).click()
    await expect.poll(() => electron.evaluate(() => globalThis.smoke.planWrites.length)).toBe(2)
    await page.locator('.nav-btn').nth(0).click()
    await page.locator('.nav-btn').nth(1).click()
    await expect(page.getByRole('button', { name: 'Desktop comfort', exact: true })).toBeDisabled()
    await electron.evaluate(() => globalThis.smoke.finishPlan({ ok: true }))
    await expect(page.getByRole('button', { name: 'Desktop comfort', exact: true })).toBeEnabled()
    assert.deepEqual(await electron.evaluate(() => globalThis.smoke.planWrites), ['menu-delay', 'menu-delay'])

    await page.locator('.nav-btn').nth(2).click()
    await page.getByRole('tab', { name: '2. FPS in my games', exact: true }).click()
    await page.getByRole('button', { name: 'Find my installed games', exact: true }).click()
    await page.getByLabel('Detected games (Steam / Epic)').selectOption('epic:test')
    await expect(page.getByLabel('Game name and edition')).toHaveValue('Cyberpunk 2077')
    await expect(page.getByText('Steam: test library unavailable', { exact: true })).toBeVisible()
    await page.getByLabel('Actual graphics settings', { exact: true }).fill('Medium, native, RT off, no cap')
    await page.getByLabel('Repeatable scene / route', { exact: true }).fill('Built-in benchmark, same PC')
    await page.getByLabel('Frame generation during this capture', { exact: true }).selectOption('off')
    const captureInput = page.getByLabel('Import frame-time CSV', { exact: true })
    const csv = (fps) => Buffer.from('FrameTime (ms)\n' + Array(4000).fill(String(1000 / fps)).join('\n'))
    await captureInput.setInputFiles({ name: 'measured-120.csv', mimeType: 'text/csv', buffer: csv(120) })
    await expect(page.getByRole('region', { name: '3. Understand your measured results' })).toContainText('120 FPS')
    await page.getByRole('button', { name: 'Detect my displays', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Does your screen match these games?' })).toContainText('A 120 Hz option')
    const exportPath = join(userData, 'gaming-summary.json')
    await electron.evaluate(({ session }, filename) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(filename))
    }, exportPath)
    await page.getByRole('link', { name: 'Export this summary (JSON)' }).click()
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(exportPath, 'utf8')).summary.count } catch { return null }
    }).toBe(4000)
    const exported = JSON.parse(await readFile(exportPath, 'utf8'))
    assert.equal(exported.context.game, 'Cyberpunk 2077')
    assert.equal(exported.context.frameGeneration, 'off')
    assert.equal(exported.summary.count, 4000)
    assert.ok(!('frames' in exported))
    assert.ok(!JSON.stringify(exported).includes('C:\\Games'))
    await page.getByRole('button', { name: 'Save this session', exact: true }).click()
    await captureInput.setInputFiles({ name: 'measured-60.csv', mimeType: 'text/csv', buffer: csv(60) })
    await page.getByLabel('Reference session', { exact: true }).selectOption('0')
    await expect(page.getByText('Average: -50% · 1% low: -50% versus the reference.', { exact: true })).toBeVisible()
    await page.getByLabel('Resolution', { exact: true }).fill('2560x1440')
    await expect(page.getByText('Comparison disabled:', { exact: false })).toBeVisible()
    await page.getByLabel('Frame generation during this capture', { exact: true }).selectOption('on')
    await expect(page.getByText('Comparison disabled:', { exact: false })).toBeVisible()
    await page.getByText('Saved gaming sessions (1/10)', { exact: true }).click()
    await page.getByRole('button', { name: 'Delete saved sessions', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Does your screen match these games?' })).toContainText('Import at least 30 seconds')
    await page.getByLabel('Resolution', { exact: true }).fill('1920 × 1080')
    await page.getByLabel('Frame generation during this capture', { exact: true }).selectOption('off')
    await page.getByRole('button', { name: 'Save this session', exact: true }).click()
    await page.screenshot({ path: join(artifacts, 'gaming.png'), fullPage: true })
    for (const width of [800, 390]) {
      await page.setViewportSize({ width, height: 844 })
      assert.ok(await page.locator('.main').evaluate((element) => element.scrollWidth <= element.clientWidth), 'Gaming page must fit viewport')
    }
    await page.setViewportSize({ width: 1240, height: 800 })
    await captureInput.setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('FPS\n200') })
    await expect(page.getByRole('alert').filter({ hasText: 'No unambiguous frame-time column' })).toBeVisible()
    await expect(page.getByRole('region', { name: '3. Understand your measured results' })).toHaveCount(0)
    await page.locator('.nav-btn').nth(0).click()
    await page.locator('.nav-btn').nth(2).click()
    await page.getByRole('tab', { name: '2. FPS in my games', exact: true }).click()
    await expect(page.getByText('Saved gaming sessions (1/10)', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '1. Test this PC', exact: true }).click()
    await page.getByRole('button', { name: 'Run benchmark', exact: false }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run benchmark', exact: false })).toBeEnabled()
    assert.equal(await page.locator('.score-num').count(), 0)
    const webglAvailable = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
      return !!gl
    })
    await page.getByRole('button', { name: 'Run benchmark', exact: false }).click()
    if (webglAvailable) {
      await expect(page.locator('#bench-canvas')).toBeVisible({ timeout: 20_000 })
      const canvas = await page.locator('#bench-canvas').screenshot({ path: join(artifacts, 'gpu.png') })
      const statistics = await sharp(canvas).stats()
      assert.ok(statistics.channels.slice(0, 3).some((channel) => channel.stdev > 5), 'GPU scene must not be blank')
      const secondFrame = await page.locator('#bench-canvas').screenshot()
      assert.notDeepEqual(canvas, secondFrame, 'GPU scene must move')
    }
    await expect(page.getByRole('button', { name: 'Run benchmark', exact: false })).toBeEnabled({ timeout: 20_000 })
    await page.getByText('Technical results and internal CPU index', { exact: true }).click()
    await expect(page.locator('.score-num')).toBeVisible()
    if (!webglAvailable) {
      await expect(page.getByText('Accurate GPU timing is unavailable', { exact: false })).toBeVisible()
    }
    assert.ok(Number(await page.locator('.score-num').textContent()) > 0)
    await page.screenshot({ path: join(artifacts, 'benchmark.png') })

    for (const width of [800, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await page.screenshot({ path: join(artifacts, `benchmark-${width}.png`) })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert.ok(await page.locator('.main').evaluate((element) => element.scrollWidth <= element.clientWidth))
    }
    await page.setViewportSize({ width: 1240, height: 800 })
    await page.getByRole('button', { name: 'Run benchmark', exact: false }).click()
    await page.locator('.nav-btn').nth(0).click()
    await expect.poll(() => electron.evaluate(() => globalThis.smoke.cancelled)).toBeGreaterThanOrEqual(2)

    await page.locator('.nav-btn').nth(3).click()
    await expect(page.locator('.main .spinner')).toHaveCount(0)
    await page.getByRole('button', { name: 'Analyze', exact: false }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(2)
    await expect(page.getByRole('checkbox').first()).not.toBeChecked()
    await expect(page.getByRole('checkbox').last()).not.toBeChecked()
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Clean selection', exact: false }).click()
    await expect(page.getByRole('alert')).toHaveText('Cleanup denied')
    await expect(page.getByRole('button', { name: 'Analyze', exact: false })).toBeEnabled()

    await page.locator('.nav-btn').nth(4).click()
    await page.getByRole('button', { name: 'Scan drivers & components', exact: false }).click()
    const dsa = page.locator('.row').filter({ hasText: 'Intel Driver & Support Assistant' }).getByRole('button')
    await dsa.click()
    await expect(page.getByRole('button', { name: 'Scan drivers & components', exact: false })).toBeDisabled()
    await page.locator('.nav-btn').nth(0).click()
    await page.locator('.nav-btn').nth(4).click()
    await expect(dsa).toBeDisabled()
    await electron.evaluate(() => globalThis.smoke.finishInstaller({ ok: false, message: 'Installer unavailable' }))
    await expect(dsa).toBeEnabled()
    await expect(page.getByRole('status').filter({ hasText: 'Installer unavailable' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Microsoft Store', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Search for missing drivers', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Windows Update service unavailable')
    await electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('drivers:wuSearch')
      ipcMain.handle('drivers:wuSearch', () => [{ id: '11111111-1111-1111-1111-111111111111', title: 'Test network driver', provider: 'Intel', driverClass: 'NET', sizeMB: 5 }])
    })
    await page.getByRole('button', { name: 'Search for missing drivers', exact: true }).click()
    await expect(page.getByRole('checkbox')).toBeChecked()
    await expect(page.getByRole('button', { name: 'Install selection (1)', exact: true })).toBeDisabled()
    for (const width of [1240, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await page.screenshot({ path: join(artifacts, `drivers-${width}.png`) })
      assert.ok(await page.locator('.main').evaluate((element) => element.scrollWidth <= element.clientWidth))
    }
    await page.setViewportSize({ width: 1240, height: 800 })

    await page.locator('.nav-btn').nth(5).click()
    await page.locator('.switch').click()
    await expect(page.locator('.switch')).toBeEnabled()
    await expect(page.locator('.toast').filter({ hasText: 'Startup access denied' })).toBeVisible()

    await page.locator('.nav-btn').nth(6).click()
    const speed = page.getByRole('button', { name: 'Run speed test', exact: false })
    await speed.click()
    await expect(page.getByRole('button', { name: 'Run test (ping + DNS)', exact: false })).toBeDisabled()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(speed).toBeEnabled()
    await speed.click()
    await page.locator('.nav-btn').nth(7).click()
    await page.getByRole('button', { name: 'Detect my browsers', exact: false }).click()
    const installBrowser = page.locator('.row').filter({ hasText: 'Brave' }).getByRole('button')
    await installBrowser.click()
    await expect(installBrowser).toBeEnabled()
    await expect(page.locator('.toast').filter({ hasText: 'Browser install unavailable' })).toBeVisible()
    const vivaldi = page.locator('.row').filter({ hasText: 'Vivaldi' })
    await vivaldi.getByRole('button', { name: 'Set as default', exact: true }).click()
    assert.equal(await electron.evaluate(() => globalThis.smoke.defaultRequested), 'vivaldi')
    await expect(vivaldi.locator('.badge.okay')).toHaveCount(0)
    await electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('browser:report')
      ipcMain.handle('browser:report', () => ({ defaultBrowser: 'vivaldi', defaults: { http: 'vivaldi', https: 'vivaldi' }, installed: ['vivaldi'], running: [] }))
    })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(vivaldi.locator('.badge.okay')).toBeVisible()
    for (const width of [1240, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await page.screenshot({ path: join(artifacts, `browser-${width}.png`) })
      assert.ok(await page.locator('.main').evaluate((element) => element.scrollWidth <= element.clientWidth))
    }
    await page.setViewportSize({ width: 1240, height: 800 })

    await page.locator('.nav-btn').nth(8).click()
    await page.locator('.toolbar .primary').click()
    await expect(page.locator('.toolbar .primary')).toBeEnabled()
    await expect(page.locator('.toast').filter({ hasText: 'Documents folder unavailable' })).toBeVisible()
    await page.getByRole('button', { name: 'Gaming readiness', exact: false }).click()
    await page.getByRole('button', { name: 'Check gaming readiness', exact: true }).click()
    await expect(page.getByText('Test display: 1920 × 1080, 60 Hz.', { exact: false })).toBeVisible()
    await expect(page.getByText('Storage: unavailable.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Trust & source code', exact: false }).click()
    await expect(page.getByText('Get-FileHash', { exact: false })).toBeVisible()
    await page.screenshot({ path: join(artifacts, 'trust.png') })
    for (const language of ['fr', 'es', 'ru', 'de', 'pt', 'it', 'en']) {
      await page.locator('.lang-select').selectOption(language)
      await expect(page.locator('.main h1')).toBeVisible()
    }
    assert.deepEqual(errors, [])
    console.log('Screenshots:', artifacts)
  } finally {
    await electron?.close()
    await rm(userData, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined)
  }
})
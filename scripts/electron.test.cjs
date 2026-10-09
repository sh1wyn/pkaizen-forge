const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { resolve, join } = require('node:path')
const { _electron } = require('playwright')
const { expect } = require('@playwright/test')
const sharp = require('sharp')

test('Electron opens, remains idle, protects actions and completes or cancels benchmarks', { timeout: 120_000 }, async () => {
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
      replace('tweaks:states', () => [{ id: 'portable-risk', applied: false }, { id: 'safe', applied: false }])
      replace('tweaks:relevance', () => [])
      replace('tweaks:apply', (_event, id) => { globalThis.smoke.applied.push(id); return { ok: true } })
      replace('bench:disk', () => ({ writeMBps: 100, readMBps: 200, sizeMB: 256 }))
      replace('bench:cancel', () => { globalThis.smoke.cancelled++ })
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
      replace('startup:list', () => [{ name: 'Test startup', command: 'test.exe', scope: 'user', enabled: true, canToggle: true }])
      replace('startup:set', () => { throw new Error('Startup access denied') })
      replace('net:info', () => ({ iface: 'Test adapter', type: 'Ethernet', gateway: null, speedMbps: 100 }))
      replace('net:ping', () => [])
      replace('net:dns', () => [])
      replace('net:speedtest', () => new Promise((resolve) => { globalThis.smoke.finishSpeed = resolve }))
      replace('net:cancelSpeed', () => { globalThis.smoke.finishSpeed?.({ downMbps: null, upMbps: null }) })
      replace('browser:report', () => ({ defaultBrowser: null, installed: [], running: [] }))
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
    await expect(page.locator('.toolbar .primary')).toBeEnabled()
    await page.locator('.toolbar .primary').click()
    await expect(page.locator('.toolbar .primary')).toBeEnabled()
    assert.deepEqual(await electron.evaluate(() => globalThis.smoke.applied), ['safe'])

    await electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('tweaks:apply')
      ipcMain.handle('tweaks:apply', () => ({ ok: false, message: 'Setting blocked by policy' }))
    })
    await page.locator('.toolbar .primary').click()
    await expect(page.getByRole('alert')).toHaveText('Setting blocked by policy')
    await expect(page.locator('.toolbar .primary')).toBeEnabled()
    await page.locator('.row').filter({ hasText: 'Safe fixture' }).locator('.switch').click()
    await expect(page.getByRole('alert')).toHaveText('Setting blocked by policy')

    await page.locator('.nav-btn').nth(2).click()
    await page.getByRole('button', { name: 'Run benchmark', exact: false }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run benchmark', exact: false })).toBeEnabled()
    assert.equal(await page.locator('.score-num').count(), 0)
    await page.getByRole('button', { name: 'Run benchmark', exact: false }).click()
    await expect(page.locator('#bench-canvas')).toBeVisible({ timeout: 20_000 })
    const canvas = await page.locator('#bench-canvas').screenshot({ path: join(artifacts, 'gpu.png') })
    const statistics = await sharp(canvas).stats()
    assert.ok(statistics.channels.slice(0, 3).some((channel) => channel.stdev > 5), 'GPU scene must not be blank')
    const secondFrame = await page.locator('#bench-canvas').screenshot()
    assert.notDeepEqual(canvas, secondFrame, 'GPU scene must move')
    await expect(page.getByRole('button', { name: 'Run benchmark', exact: false })).toBeEnabled({ timeout: 20_000 })
    await expect(page.locator('.score-num')).toBeVisible()
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
    const dsa = page.getByRole('button', { name: 'Install Intel DSA', exact: false })
    await dsa.click()
    await expect(dsa).toBeEnabled()
    await expect(page.locator('.toast').filter({ hasText: 'Installer unavailable' })).toBeVisible()

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

    await page.locator('.nav-btn').nth(8).click()
    await page.locator('.toolbar .primary').click()
    await expect(page.locator('.toolbar .primary')).toBeEnabled()
    await expect(page.locator('.toast').filter({ hasText: 'Documents folder unavailable' })).toBeVisible()
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
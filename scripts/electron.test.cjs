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
    assert.deepEqual(errors, [])
    console.log('Screenshots:', artifacts)
  } finally {
    await electron?.close()
    await rm(userData, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined)
  }
})
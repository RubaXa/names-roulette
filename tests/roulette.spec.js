// @ts-check
// Playwright E2E spec for Names Roulette
// Run: npx playwright test --config=playwright.config.js
// Requires: npx playwright install chromium

const { test, expect } = require('@playwright/test')

const BASE = 'http://localhost:4173/secret-stork'
const TOTAL_NAMES = 243

// Fake user injected via ?e2e_user= param (only works on localhost)
const FAKE_USER = Buffer.from(JSON.stringify({
  uid: 'e2e-user-001',
  displayName: 'Тест Тестовна',
  email: 'test@e2e.local',
  photoURL: null,
})).toString('base64')

// Second user to test multi-participant flow
const FAKE_USER_2 = Buffer.from(JSON.stringify({
  uid: 'e2e-user-002',
  displayName: 'Второй Участник',
  email: 'test2@e2e.local',
  photoURL: null,
})).toString('base64')

function appUrl(hash = '') {
  // strip a leading '#' so callers can pass either '#/path' or '/path'
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  return `${BASE}/?e2e_user=${FAKE_USER}${h ? '#' + h : ''}`
}

// Helper: read IDB votes for a space
async function getIDBVotes(page, spaceId) {
  return page.evaluate(async (sid) => {
    const r = await window.__e2e.getVotes(sid)
    return r
  }, spaceId)
}

// Helper: read outbox
async function getOutbox(page) {
  return page.evaluate(() => window.__e2e.getOutbox())
}

// Helper: get current spaceId from hash
async function getSpaceId(page) {
  const hash = await page.evaluate(() => location.hash)
  const m = hash.match(/\/space\/([^/]+)/)
  return m ? m[1] : null
}

// ─── TEST GROUP 1: Auth & Navigation ──────────────────────────────────────────

test.describe('Auth', () => {

  test('shows login screen when not authenticated (desktop)', async ({ page }) => {
    await page.goto(BASE + '/')
    await expect(page.locator('.login-title')).toHaveText('Назовём')
    await expect(page.locator('#btn-login')).toBeVisible()
    await page.screenshot({ path: 'tests/screenshots/01_login_desktop.png' })
  })

  test('shows login screen when not authenticated (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE + '/')
    await expect(page.locator('.login-title')).toBeVisible()
    await page.screenshot({ path: 'tests/screenshots/02_login_mobile.png' })
  })

  test('shows home screen with fake auth (desktop)', async ({ page }) => {
    await page.goto(appUrl())
    await page.waitForSelector('.home-create')
    await expect(page.locator('.home-create-text')).toHaveText('Новое голосование')
    await page.screenshot({ path: 'tests/screenshots/03_home_desktop.png' })
  })

  test('shows home screen with fake auth (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(appUrl())
    await page.waitForSelector('.home-create')
    await page.screenshot({ path: 'tests/screenshots/04_home_mobile.png' })
  })

  test('analytics link navigates to chart.html', async ({ page }) => {
    await page.goto(appUrl())
    const [newPage] = await Promise.all([
      page.waitForEvent('popup', { timeout: 1000 }).catch(() => null),
      page.locator('a[href="chart.html"]').click(),
    ])
    // chart.html is same tab (no target=_blank)
    await page.waitForURL('**/chart.html')
    await expect(page.locator('h1')).toContainText('Женские имена')
  })

})

// ─── TEST GROUP 2: Create Space ───────────────────────────────────────────────

test.describe('Create Space', () => {

  test('create space and redirect to voting', async ({ page }) => {
    await page.goto(appUrl())
    await page.waitForSelector('.home-create')
    await page.locator('.home-create').click()

    // New space form
    await page.waitForSelector('#inp-title')
    await page.locator('#inp-title').fill('E2E Test Space')
    await page.locator('#btn-create').click()

    // Should redirect to /space/:id
    await page.waitForURL(/.*#\/space\/[a-z0-9]+$/)
    await expect(page.locator('.card-current .name-card')).toBeVisible()
    await page.screenshot({ path: 'tests/screenshots/05_voting_screen.png' })
  })

  test('create space appears in home list on reload', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#inp-title').fill('My Baby Space')
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)

    // Go back to home
    await page.locator('.nav-back').click()
    await page.waitForSelector('.space-card')
    await expect(page.locator('.space-card-name').first()).toHaveText('My Baby Space')
    await page.screenshot({ path: 'tests/screenshots/06_home_with_space.png' })
  })

})

// ─── TEST GROUP 3: Local-first Voting ────────────────────────────────────────

test.describe('Local-first voting (IndexedDB)', () => {

  test('votes persist in IndexedDB with Firebase blocked', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#inp-title').fill('Offline Test Space')
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)

    const spaceId = await getSpaceId(page)
    expect(spaceId).toBeTruthy()

    // Block Firebase sync
    await page.evaluate(() => window.__e2e.blockSync(true))

    // Vote on 3 names
    const votes = []
    for (let i = 0; i < 3; i++) {
      const nameEl = page.locator('.card-current .card-name')
      const name = await nameEl.textContent()
      await page.locator('.r-btn').nth(3).click() // score=4 "Нравится" — instant advance
      votes.push(name.trim())
      await page.waitForTimeout(400)
    }

    // Verify IDB has all 3 votes
    const idbVotes = await getIDBVotes(page, spaceId)
    expect(Object.keys(idbVotes)).toHaveLength(3)
    for (const name of votes) {
      expect(idbVotes[name]).toBe(4)
    }

    // Verify outbox has pending entries
    const outbox = await getOutbox(page)
    const voteEntries = outbox.filter(e => e.type === 'VOTE')
    expect(voteEntries.length).toBeGreaterThanOrEqual(3)

    // Sync dot should show error/pending
    const syncDot = page.locator('.sync-dot')
    const dotClass = await syncDot.getAttribute('class')
    expect(dotClass).toMatch(/pending|error/)

    await page.screenshot({ path: 'tests/screenshots/07_local_first_offline.png' })
  })

  test('outbox drains when Firebase unblocked', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#inp-title').fill('Sync Test Space')
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)

    // Block and vote
    await page.evaluate(() => window.__e2e.blockSync(true))
    await page.locator('.r-btn').nth(4).click() // Обожаю — instant advance
    await page.waitForTimeout(400)

    // Unblock — Firebase calls will fail (fake user) but outbox drain runs
    await page.evaluate(() => window.__e2e.blockSync(false))
    // drainOutbox is async — sync dot transitions through states
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'tests/screenshots/08_sync_recovery.png' })
  })

  test('votes survive page reload (IDB persistence)', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#inp-title').fill('Persistence Test')
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)

    const spaceId = await getSpaceId(page)
    await page.evaluate(() => window.__e2e.blockSync(true))

    // Vote on 5 names
    for (let i = 0; i < 5; i++) {
      await page.locator('.r-btn').nth(2).click() // Нейтрально — instant advance
      await page.waitForTimeout(400)
    }

    const before = await getIDBVotes(page, spaceId)

    // Reload the page (preserves IDB, resets sessionStorage)
    await page.reload()
    await page.waitForSelector('.voting-view, .done-view')

    const after = await getIDBVotes(page, spaceId)
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length)

    await page.screenshot({ path: 'tests/screenshots/09_after_reload.png' })
  })

})

// ─── TEST GROUP 4: Voting UX ──────────────────────────────────────────────────

test.describe('Voting UX', () => {

  async function goToVoting(page) {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#inp-title').fill('UX Test')
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)
    await page.evaluate(() => window.__e2e.blockSync(true))
  }

  test('rating tap instantly advances (no confirm button)', async ({ page }) => {
    await goToVoting(page)
    await expect(page.locator('#btn-next')).toHaveCount(0) // legacy mechanic: no "Далее" button
    const first = (await page.locator('.card-current .card-name').textContent()).trim()
    await page.locator('.r-btn').nth(4).click() // ❤️ Обожаю
    await page.waitForTimeout(400)
    const second = (await page.locator('.card-current .card-name').textContent()).trim()
    expect(second).not.toBe(first)
  })

  test('progress bar advances with each vote', async ({ page }) => {
    await goToVoting(page)
    const progressBefore = await page.locator('.progress-text').textContent()
    expect(progressBefore).toBe('0/243')

    await page.locator('.r-btn').nth(3).click() // instant advance
    await page.waitForTimeout(400)

    const progressAfter = await page.locator('.progress-text').textContent()
    expect(progressAfter).toBe('1/243')
    await page.screenshot({ path: 'tests/screenshots/10_progress_advance.png' })
  })

  test('back button restores previous card for review', async ({ page }) => {
    await goToVoting(page)
    const firstName = (await page.locator('.card-current .card-name').textContent()).trim()
    await page.locator('.r-btn').nth(4).click() // ❤️ vote → advance
    await page.waitForTimeout(400)
    await page.locator('.card-current .card-back-btn').click()
    const reviewName = (await page.locator('.card-current .card-name').textContent()).trim()
    expect(reviewName).toBe(firstName)
    // prior rating highlighted + "Вперёд →" available in review mode
    await expect(page.locator('.r-btn.active')).toHaveCount(1)
    await expect(page.locator('.card-current .card-skip-btn')).toBeVisible()
    await page.screenshot({ path: 'tests/screenshots/11_back_review.png' })
  })

  test('history shows voted names', async ({ page }) => {
    await goToVoting(page)
    const hash = await page.evaluate(() => location.hash)
    const spaceId = hash.match(/\/space\/([^/]+)/)?.[1]

    await page.locator('.r-btn').nth(4).click() // instant advance
    await page.waitForTimeout(400)
    await page.locator('.r-btn').nth(1).click() // instant advance
    await page.waitForTimeout(400)

    await page.locator(`a[data-nav="/space/${spaceId}/history"]`).click()
    await page.waitForSelector('.hist-list')
    const histItems = page.locator('.hist-item')
    await expect(histItems).toHaveCount(2)
    await page.screenshot({ path: 'tests/screenshots/12_history.png' })
  })

  test('re-vote from history removes name from voted list', async ({ page }) => {
    await goToVoting(page)
    await page.locator('.r-btn').first().click() // instant advance
    await page.waitForTimeout(400)

    const hash = await page.evaluate(() => location.hash)
    const spaceId = hash.match(/\/space\/([^/]+)/)?.[1]
    await page.goto(appUrl(`#/space/${spaceId}/history`))
    await page.waitForSelector('.hist-item')

    const name = await page.locator('.hist-name').first().textContent()
    await page.locator('.hist-item').first().click()

    // Should navigate back to voting with that name available
    await page.waitForSelector('.voting-view')
    const progress = await page.locator('.progress-text').textContent()
    expect(progress).toBe('0/243')
  })

})

// ─── TEST GROUP 5: Admin & Results ────────────────────────────────────────────

test.describe('Admin panel', () => {

  test('creator can access admin panel', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)

    const hash = await page.evaluate(() => location.hash)
    const spaceId = hash.match(/\/space\/([^/]+)/)?.[1]

    await page.goto(appUrl(`#/space/${spaceId}/admin`))
    await page.waitForSelector('.admin-view')
    await expect(page.locator('.admin-space-name')).toBeVisible()
    await expect(page.locator('#btn-close')).toBeVisible()
    await page.screenshot({ path: 'tests/screenshots/13_admin_panel.png' })
  })

  test('share link is correct format', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)

    const hash = await page.evaluate(() => location.hash)
    const spaceId = hash.match(/\/space\/([^/]+)/)?.[1]
    await page.goto(appUrl(`#/space/${spaceId}/admin`))
    await page.waitForSelector('.share-url')

    const shareUrl = await page.locator('.share-url').textContent()
    expect(shareUrl).toContain(`#/space/${spaceId}`)
  })

})

// ─── TEST GROUP 6: Mobile responsiveness ─────────────────────────────────────

test.describe('Mobile (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('voting card fits mobile screen', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)
    await page.evaluate(() => window.__e2e.blockSync(true))
    await expect(page.locator('.card-current .name-card')).toBeVisible()
    const card = await page.locator('.card-current .name-card').boundingBox()
    expect(card.width).toBeLessThanOrEqual(390)
    await page.screenshot({ path: 'tests/screenshots/14_voting_mobile.png' })
  })

  test('rating buttons visible without scroll', async ({ page }) => {
    await page.goto(appUrl())
    await page.locator('.home-create').click()
    await page.locator('#btn-create').click()
    await page.waitForURL(/.*#\/space\//)
    const btns = page.locator('.r-btn')
    await expect(btns.nth(0)).toBeVisible()
    await expect(btns.nth(4)).toBeVisible()
    await page.screenshot({ path: 'tests/screenshots/15_rating_mobile.png' })
  })

  test('home screen create button full-width on mobile', async ({ page }) => {
    await page.goto(appUrl())
    await page.waitForSelector('.home-create')
    const btn = await page.locator('.home-create').boundingBox()
    // Should span most of mobile width
    expect(btn.width).toBeGreaterThan(300)
    await page.screenshot({ path: 'tests/screenshots/16_home_mobile.png' })
  })

})

// ─── TEST GROUP 7: Deep link (join via URL) ───────────────────────────────────

test.describe('Deep link joining', () => {

  test('unauthenticated user sees login when opening space link', async ({ page }) => {
    await page.goto(`${BASE}/#/space/abc123xyz`)
    await expect(page.locator('#btn-login')).toBeVisible()
    // URL is saved so after login they'd be redirected
    const saved = await page.evaluate(() => sessionStorage.getItem('pendingRoute'))
    expect(saved).toBe('#/space/abc123xyz')
  })

})

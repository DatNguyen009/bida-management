import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

test('dashboard loads and shows tables', async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const tableCards = window.locator('[data-testid="table-card"]')
  await expect(tableCards.first()).toBeVisible()

  await app.close()
})

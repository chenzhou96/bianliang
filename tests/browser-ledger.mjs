import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { newGame } from '../lib/game/engine.ts';
import { setDay } from './helpers.ts';
import { measureLayout } from './layout-check.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
mkdirSync('tests/browser-output/ledger', { recursive: true });
try {
  await page.goto('http://127.0.0.1:4173');
  for (const [width, height] of [
    [1536, 864],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const populated of [false, true]) {
      const s = newGame(42);
      if (populated) {
        setDay(s, 15);
        s.ledger.dailyCash = Array.from({ length: 7 }, (_, i) => ({
          day: i + 9,
          income: [0, 230, 70, 0, 560, 210, 80][i],
          expense: [85, 60, 140, 0, 160, 320, 38][i],
        }));
        Object.assign(s.ledger, {
          tradeRevenue: 800,
          tradeCost: 370,
          productionRevenue: 350,
          productionCost: 170,
          workIncome: 180,
          purchases: 580,
          living: 198,
          housing: 300,
        });
      }
      await page.evaluate((s) => {
        localStorage.clear();
        localStorage.setItem('bianliang-save-v4', JSON.stringify(s));
      }, s);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /继续第/ }).click();
      await page
        .getByRole('navigation', { name: '经营工作区' })
        .getByRole('button', { name: '账本', exact: true })
        .click();
      await page
        .locator('.ledger-illustration')
        .evaluate((img) => img.decode());
      assert.equal(
        await page
          .getByRole('heading', { name: '近期流水', exact: true })
          .count(),
        0,
      );
      assert(
        await page
          .getByRole('heading', { name: '近七日收支', exact: true })
          .isVisible(),
      );
      assert(
        await page
          .getByRole('heading', { name: '完整记录', exact: true })
          .count(),
      );
      if (!populated)
        assert.match(
          await page.locator('.cash-chart').innerText(),
          /还没有现金来往/,
        );
      if (populated)
        assert.match(await page.locator('.cash-totals').innerText(), /1,150文/);
      const layout = await measureLayout(page);
      assert.deepEqual(
        layout.bad,
        [],
        `${width}: ${JSON.stringify(layout.bad)}`,
      );
      assert(layout.pageWidth <= width + 1);
      if (width >= 1100) assert(layout.pageHeight <= height + 1);
      await page.screenshot({
        path: `tests/browser-output/ledger/${width}-${populated ? 'populated' : 'empty'}.png`,
        fullPage: true,
      });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'Ledger overview passed: 6 empty/populated desktop/mobile states.',
  );
} finally {
  await browser.close();
}

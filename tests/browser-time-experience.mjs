import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { newGame, dispatch, readSave } from '../lib/game/engine.ts';
import { generateOrders } from '../lib/game/commerce.ts';
import { setDay } from './helpers.ts';
import { measureLayout } from './layout-check.mjs';
const out = 'tests/browser-output/time-experience';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
const checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const nav = (name) =>
  page
    .getByRole('navigation', { name: '经营工作区' })
    .getByRole('button', { name, exact: true })
    .click();
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v4')));
async function load(s) {
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('bianliang-save-v3', 'legacy-keep');
    localStorage.setItem('bianliang-save-v4', JSON.stringify(s));
  }, s);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /继续第/ }).click();
  await nav('住宅');
}
try {
  await page.goto('http://127.0.0.1:4173');
  for (const [width, height] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const s = dispatch(newGame(width), { type: 'wait', minutes: 720 }).state;
    await load(s);
    assert.equal(await page.getByText(/^鸡群 ·/).count(), 0);
    await page.getByLabel('主餐', { exact: true }).selectOption('bread');
    const close = page.getByRole('button', { name: /^今日收工 ·/ });
    assert.doesNotMatch(
      await page.locator('.life-detail').innerText(),
      /体力成本增至/,
    );
    if (width >= 700) {
      const boundary = await page.locator('.life-detail').boundingBox();
      for (const label of ['用主餐 · 30分钟', '休息1小时']) {
        const box = await page
          .getByRole('button', { name: label, exact: true })
          .boundingBox();
        assert(
          box.y >= boundary.y &&
            box.y + box.height <= boundary.y + boundary.height &&
            box.y + box.height < height,
        );
      }
      const box = await close.boundingBox();
      assert(
        box.y + box.height <= boundary.y + boundary.height &&
          box.y + box.height < height,
      );
    }
    const layout = await measureLayout(page);
    assert.deepEqual(layout.bad, []);
    assert(layout.pageWidth <= width);
    await page.screenshot({
      path: `${out}/${width}x${height}-life.png`,
      fullPage: true,
    });
    await close.click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    const next = await read();
    assert.equal(next.clock.minute, 1920);
    assert.equal(next.cash, s.cash - 30);
    assert.equal(next.operationHistory.length, s.operationHistory.length + 1);
    assert.equal(next.operationHistory.at(-1).action, 'closeDay');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('bianliang-save-v3')),
      'legacy-keep',
    );
    await nav('市场');
    await nav('住宅');
    assert.equal(
      await page.getByLabel('主餐', { exact: true }).inputValue(),
      'bread',
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /继续第/ }).click();
    await nav('住宅');
    assert.equal(
      await page.getByLabel('主餐', { exact: true }).inputValue(),
      'bread',
    );
    checks.push({
      width,
      height,
      normalCloseClicks: 1,
      oldKeyPreserved: true,
      layout,
    });
  }
  await page.setViewportSize({ width: 1536, height: 864 });
  const risk = newGame(333);
  setDay(risk, 4, 1080);
  generateOrders(risk);
  const order = risk.commerce.orders[0];
  order.status = 'accepted';
  order.goods = { wheat: 1 };
  order.prices = { wheat: risk.prices.wheat.buy };
  order.postedDay = 3;
  order.price = order.prices.wheat;
  order.deadlineAt = risk.clock.minute + 300;
  await load(risk);
  await page.getByRole('button', { name: /^今日收工 ·/ }).click();
  assert.equal((await read()).clock.minute, risk.clock.minute);
  assert.match(await page.getByRole('dialog').innerText(), /截止/);
  await page.screenshot({ path: `${out}/risk-confirm.png`, fullPage: true });
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal((await read()).clock.minute, 6240);
  const morning = newGame(444);
  setDay(morning, 2, 450);
  await load(morning);
  assert(await page.getByRole('button', { name: /^今日收工 ·/ }).isDisabled());
  await page.getByLabel('先吃所选主餐（已经吃过则省略）').uncheck();
  assert(await page.getByRole('button', { name: /^今日收工 ·/ }).isDisabled());
  const full = newGame(445);
  full.stamina = 100;
  await load(full);
  assert(
    await page
      .getByRole('button', { name: '休息1小时', exact: true })
      .isDisabled(),
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/result.json`,
    JSON.stringify({ checks, riskCloseClicks: 2, errors }, null, 2),
  );
  console.log(
    'Time experience browser checks passed',
    checks.length,
    'viewports; normal 1 click, risk 2 clicks',
  );
} finally {
  await browser.close();
}

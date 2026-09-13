import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measureLayout } from './layout-check.mjs';
import { newGame, dispatch } from '../lib/game/engine.ts';
const out = 'tests/browser-output/street';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
const checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) =>
  page
    .getByRole('navigation', { name: '经营工作区' })
    .getByRole('button', { name, exact: true })
    .click();
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v4')));
async function check(label, mobile) {
  const result = await measureLayout(page, { allowVertical: mobile });
  // Mobile pages intentionally scroll vertically; horizontal overflow is never allowed.
  const horizontal = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(horizontal, false, label);
  if (!mobile) assert.deepEqual(result.bad, [], label);
  await page.screenshot({ path: `${out}/${label}.png`, fullPage: mobile });
  checks.push(label);
}
try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  for (const [width, height] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await button('走进汴梁 · 3000文').click();
    await nav('住宅');
    // 房屋 is available on the same workspace.
    await page.getByRole('button', { name: /租赁小屋 接手/ }).click();
    await button('租下').click();
    await nav('市场');
    await page.getByLabel('商品分类').selectOption('全部');
    await page
      .locator('.item-list .list-item')
      .filter({ hasText: '母鸡' })
      .click();
    await page.getByLabel('母鸡数量').fill('3');
    await button('买入').click();
    await nav('情报');
    await button('茶馆听消息 · 8文').click();
    const opening = await read();
    assert.equal(opening.hens.length, 3);
    assert.ok(opening.clock.minute < 660);
    await button('此刻能做什么 · 招工告示').click();
    assert.match(await page.locator('.workspace').innerText(), /明天06:00/);
    assert.ok(await button('短工 · 25文').isEnabled());
    const rects = await page.locator('.care-grid .btn').evaluateAll((buttons) =>
      buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return { y: r.y, height: r.height };
      }),
    );
    assert.ok(Math.abs(rects[0].y - rects[1].y) < 1);
    assert.ok(Math.abs(rects[0].height - rects[1].height) < 1);
    await page.getByLabel('做一趟短工', { exact: true }).check();
    await page.getByLabel('逛夜市', { exact: true }).check();
    await page.getByLabel('早些睡觉', { exact: true }).check();
    assert.ok(
      await page.getByLabel('看收货告示', { exact: true }).isDisabled(),
    );
    assert.equal((await read()).clock.minute, opening.clock.minute);
    await page.locator('.street-body > .list-column').evaluate((el) => {
      el.scrollTop = 0;
    });
    assert.equal(await page.locator('.street-body .city-schedule').count(), 0);
    assert.equal(await page.locator('.bottom-bar, .footer-wait').count(), 0);
    const clock = page.locator('footer.city-clock-note');
    const clockBox = await clock.boundingBox();
    if (width >= 1051) assert(clockBox.y > height - 55);
    await page
      .getByRole('button', { name: '时辰表与今日要事', exact: true })
      .click();
    assert.equal(
      await page.getByRole('dialog').locator('.city-schedule').count(),
      1,
    );
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await check(`${width}x${height}-street`, width < 700);
    await button('短工 · 25文').click();
    assert.equal((await read()).cash, opening.cash + 25);
    assert.equal((await read()).clock.minute, opening.clock.minute + 120);
    await button('回家安排饭食与鸡群').click();
    const meal = page.locator('.life-section').filter({
      has: page.getByRole('heading', { name: '饭食与短休', exact: true }),
    });
    assert.equal(await meal.getByRole('checkbox').count(), 0);
    const mealBox = await meal
      .getByRole('button', { name: '用主餐 · 30分钟', exact: true })
      .boundingBox();
    if (width >= 700)
      assert.ok(
        mealBox && mealBox.y + mealBox.height < height,
        'Daily meal is visible without scrolling',
      );
    await page.getByText(/^鸡群 ·/).click();
    const auto = page.getByLabel('每天清晨05:30，用存粮自动喂鸡');
    await auto.check();
    assert.equal((await read()).life.autoFeed, true);
    assert.match(
      await page.locator('.art-home-layout').innerText(),
      /明天05:30/,
    );
    await check(`${width}x${height}-home`, width < 700);
    await button('时辰表与今日要事').click();
    assert.match(await page.getByRole('dialog').innerText(), /今天18:00/);
    assert.match(await page.getByRole('dialog').innerText(), /明天06:00前/);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  await page.setViewportSize({ width: 1536, height: 864 });
  const night = dispatch(newGame(42), { type: 'wait', minutes: 720 }).state;
  night.cash = 3500;
  await page.evaluate(
    (s) => localStorage.setItem('bianliang-save-v4', JSON.stringify(s)),
    night,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /继续第/ }).click();
  await nav('街巷');
  const painting = page.locator('.street-scene img');
  assert.match(await painting.getAttribute('src'), /night-market/);
  await painting.evaluate((img) => img.decode());
  await check('1536x864-night-street', false);
  await button('时辰表与今日要事').click();
  await page
    .getByRole('dialog')
    .screenshot({ path: `${out}/calendar-dialog.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const homeward = page
    .locator('.status')
    .getByRole('button', { name: '支付3,000文归航', exact: true });
  assert(await homeward.isVisible());
  await homeward.click();
  if (await page.getByRole('dialog').isVisible())
    await button('确认执行').click();
  assert.equal((await read()).ending, 'return');
  checks.push('return-from-status');
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/result.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log('First-day street and home experience passed', checks.length);
} finally {
  await browser.close();
}

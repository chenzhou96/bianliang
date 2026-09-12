import { measureLayout } from './layout-check.mjs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame } from '../lib/game/engine.ts';

const out = 'tests/browser-output/ux';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const button = (name) => page.getByRole('button', { name, exact: true });
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v2')));
async function load(s) {
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('bianliang-save-v2', JSON.stringify(s));
  }, s);
  await page.reload();
  await page.getByRole('button', { name: /继续第/ }).click();
}
async function noOverflow(label) {
  const { bad } = await measureLayout(page);
  await page.screenshot({
    animations: 'disabled',
    path: `${out}/${label}.png`,
  });
  assert.deepEqual(bad, [], `${label}: ${JSON.stringify(bad)}`);
}
try {
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:4173');
  const s = newGame(20260911, 30000);
  s.cash = 3000;
  s.skills.food = 1;
  s.housing.id = 'room';
  s.equipment = [{ id: 900, kind: 'stove', installed: true, jobId: null }];
  s.batches = [];
  await load(s);
  let clicks = 0,
    inputs = 0;
  const steps = [];
  const click = async (name) => {
    await button(name).click();
    clicks++;
    steps.push(name);
  };
  await click('生产');
  await page.locator('.list-item').filter({ hasText: '炊饼' }).click();
  clicks++;
  steps.push('选择炊饼配方');
  await page.getByLabel('炊饼批量').fill('3');
  inputs++;
  steps.push('加工3批');
  await click('补齐原料');
  assert.match(await page.locator('.record-feed').innerText(), /原料补齐/);
  await click('开工');
  assert.match(await page.locator('.record-feed').innerText(), /炊饼\s*\+15/);
  await click('出售成品');
  await click('最大卖出');
  await click('卖出');
  const end = await read();
  assert.equal(end.cash, 3111);
  assert.equal(end.operationHistory.length, 3);
  assert(
    clicks + inputs <= 10,
    `Expected at least 30% fewer than 15 actions, got ${clicks + inputs}`,
  );
  const feedback = await page.locator('.record-feed').innerText();
  await button('生产').click();
  assert.equal(await page.getByLabel('炊饼批量').inputValue(), '3');
  assert.equal(await page.locator('.record-feed').innerText(), feedback);
  await button('市场').click();
  assert.equal(await page.getByLabel('炊饼数量').inputValue(), '15');
  await page.reload();
  await page.getByRole('button', { name: /继续第/ }).click();
  assert.equal(await page.getByLabel('炊饼数量').inputValue(), '15');
  assert.equal(await page.locator('.record-feed').innerText(), feedback);
  await noOverflow('saved-sale');
  assert.match(await page.locator('.record-feed').innerText(), /已售成本264文/);
  await page.getByLabel('减少动态').check();
  assert(await page.locator('main.reduce-motion').count());
  await page.getByLabel('减少动态').uncheck();
  await load(newGame(20260911));
  await button('人物').click();
  await button('休息 · 恢复25体力').click();
  assert.match(await page.locator('.record-feed').innerText(), /体力\s*\+20/);
  await button('短工 · 25文').click();
  assert.match(await page.locator('.record-feed').innerText(), /现金\s*\+25文/);
  await button('收工，安排今晚 →').click();
  await page.getByLabel('晚饭', { exact: true }).selectOption('diner');
  await page.getByLabel('住宿', { exact: true }).selectOption('inn');
  await button('安排妥当，度过这一夜 →').click();
  assert.equal((await read()).nightPreference.meal, 'diner');
  const saved = await read();
  saved.event = null;
  saved.encounterDay = saved.day;
  await load(saved);
  await button('收工，安排今晚 →').click();
  assert.equal(
    await page.getByLabel('晚饭', { exact: true }).inputValue(),
    'diner',
  );
  await button('返回白天处理').click();
  assert.equal((await read()).day, saved.day);
  const learning = newGame(20);
  learning.cash = 5000;
  learning.health = 60;
  learning.buffs.cold = learning.day + 1;
  await load(learning);
  await button('人物').click();
  await button('调养 · 30文 / +10健康').click();
  assert.match(await page.locator('.record-feed').innerText(), /健康\s*\+10/);
  assert.match(await page.locator('.record-feed').innerText(), /风寒：解除/);
  await page.locator('.list-item').filter({ hasText: '食品' }).click();
  await page.getByRole('button', { name: /^学习 ·/ }).click();
  assert.equal((await read()).skills.food, 1);
  assert.match(await page.locator('.record-feed').innerText(), /进阶1级/);
  await button('收下这份喜悦').click();
  await noOverflow('learned-and-treated');
  const invalidBed = structuredClone(learning);
  invalidBed.phase = 'night';
  invalidBed.nightPreference = {
    meal: 'diner',
    bed: 'mansion',
    feedMode: 'all',
    feed: 0,
  };
  await load(invalidBed);
  assert.match(
    await page.getByLabel('住宿', { exact: true }).innerText(),
    /已不可用/,
  );
  assert(await button('安排妥当，度过这一夜 →').isDisabled());
  const legacy = newGame(19);
  delete legacy.saveRevision;
  delete legacy.operationHistory;
  delete legacy.nightPreference;
  await load(legacy);
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      'setItem',
    ).value;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes('before-ux-'))
        throw new DOMException('Quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await button('人物').click();
  await button('短工 · 25文').click();
  assert.match(
    await page.locator('.save-alert').innerText(),
    /操作已完成，但保存失败/,
  );
  assert.deepEqual(await read(), legacy);
  const downloading = page.waitForEvent('download');
  await button('导出当前进度').click();
  assert((await downloading).suggestedFilename().includes('bianliang-save-v2'));
  await noOverflow('save-failure');
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/result.json`,
    JSON.stringify(
      {
        passed: true,
        clicks,
        inputs,
        total: clicks + inputs,
        baselineTotal: 15,
        steps,
        finalCash: end.cash,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('UX flow passed', { clicks, inputs, total: clicks + inputs });
} finally {
  await browser.close();
}

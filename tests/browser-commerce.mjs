import { todayTasks } from '../lib/game/today.ts';
import { setDay } from './helpers.ts';
import { measureLayout } from './layout-check.mjs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame, dispatch, readSave } from '../lib/game/engine.ts';
import {
  generateOrders,
  orderTerms,
  CUSTOMER_IDS,
  CUSTOMERS,
  MILESTONES,
} from '../lib/game/commerce.ts';

import { GOOD_IDS, GOODS, BUFFS } from '../lib/game/config.ts';

const output = 'tests/browser-output/commerce';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const button = (name) => page.getByRole('button', { name, exact: true });
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v4')));
async function load(s) {
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('bianliang-save-v4', JSON.stringify(s));
  }, s);
  await page.reload();
  await page.getByRole('button', { name: /继续第/ }).click();
}
const metrics = [];
async function layout(label) {
  const m = await measureLayout(page);
  metrics.push({ label, ...m });
  await page.screenshot({
    animations: 'disabled',
    path: `${output}/${label}.png`,
    fullPage: m.width < 1000,
  });
  assert(
    (m.width < 1000 || m.pageHeight <= m.height + 1) &&
      m.pageWidth <= m.width + 1,
    `${label}: ${JSON.stringify(m)}`,
  );
  assert.deepEqual(m.bad, [], `${label}: ${JSON.stringify(m.bad)}`);
}
try {
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:4173');
  let fixture;
  for (let seed = 1; seed < 50; seed++) {
    const s = newGame(seed, 30000);
    setDay(s, 4);
    s.cash = 20000;
    s.stamina = 100;
    s.encounterDay = 4;
    s.housing.id = 'mansion';
    s.skills = { food: 3, textile: 3, brewing: 3, husbandry: 3 };
    s.commerce.relations = Object.fromEntries(
      CUSTOMER_IDS.map((id) => [id, 3]),
    );
    for (const m of MILESTONES) s.commerce.milestones[m.id] = 1;
    generateOrders(s);
    if (s.commerce.orders.some((o) => o.highRisk)) {
      fixture = s;
      break;
    }
  }
  assert(fixture);
  const target = fixture.commerce.orders.find((o) => o.highRisk);
  fixture.batches = Object.entries(target.goods).map(([good, q], i) => ({
    id: 800 + i,
    good,
    units: q * 10,
    cost: Math.floor(q * fixture.prices[good].buy * 0.6),

    remainingMinutes: GOODS[good].life ? GOODS[good].life * 1440 : null,
    origin: 'buy',
  }));
  fixture.nextId = 1000;
  await load(fixture);
  await button('订单').click();
  await page.locator('.list-item').filter({ hasText: target.title }).click();
  await button('接取订单').click();
  assert.match(await page.getByRole('dialog').innerText(), /保证金/);
  assert.deepEqual(await read(), fixture);
  await button('返回调整').click();
  assert.deepEqual(await read(), fixture);
  await button('接取订单').click();
  await button('确认执行').click();
  const accepted = await read();
  assert.equal(accepted.cash, fixture.cash - target.deposit);
  await page.locator('.order-detail').waitFor();
  await button('交付全部货物').click();
  if (await page.getByRole('dialog').isVisible())
    await button('确认执行').click();
  const delivered = await read();
  assert.equal(delivered.cash, fixture.cash + target.price);
  assert.equal(delivered.commerce.completed, 1);
  assert.match(await page.locator('.record-feed').innerText(), /订单已交付/);
  await page.reload();
  await page.getByRole('button', { name: /继续第/ }).click();
  assert.equal((await read()).commerce.completed, 1);
  const failed = structuredClone(accepted);
  failed.stamina = 100;
  failed.event = null;
  await load(failed);
  await button('订单').click();
  await page.locator('.order-detail').waitFor();
  await page
    .locator('.orders-workbench .list-item')
    .filter({ hasText: target.title })
    .click();
  await button('放弃订单').click();
  assert.match(await page.getByRole('dialog').innerText(), /没收已冻结保证金/);
  await button('确认执行').click();
  assert.equal((await read()).ledger.depositLosses, target.deposit);
  const developed = structuredClone(accepted);
  const second = developed.commerce.orders.find((o) => o.status === 'offered');
  assert(second);
  const secondResult = dispatch(developed, {
    type: 'acceptOrder',
    orderId: second.id,
    confirm: orderTerms(second),
  });
  assert.equal(secondResult.error, undefined);
  Object.assign(developed, secondResult.state);
  assert.equal(
    developed.commerce.orders.filter((o) => o.status === 'accepted').length,
    2,
  );
  const third = developed.commerce.orders.find((o) => o.status === 'offered');
  assert(third);
  assert(
    dispatch(developed, {
      type: 'acceptOrder',
      orderId: third.id,
      confirm: orderTerms(third),
    }).error,
  );
  for (const id of CUSTOMER_IDS)
    developed.commerce.customers[id] = {
      met: true,
      visited: 2,
      lastOutcome: 'delivered',
    };
  for (const [w, h] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await load(developed);
    await button('订单').click();
    for (const name of ['可接订单', '进行中 (2/2)', '近期记录', '熟客']) {
      await page
        .getByRole('heading', {
          name: name.startsWith('进行中') ? '进行中' : name,
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await layout(`${w}x${h}-${name.replaceAll('/', '-')}`);
    }
    await page
      .locator('.list-item')
      .filter({ hasText: CUSTOMERS.baker.name })
      .filter({
        has: page.locator('strong', { hasText: CUSTOMERS.baker.name }),
      })
      .click();
    await button('拜访与回访').click();
    assert.match((await read()).story, /大户|掌勺/);
    await button('人物').click();
    // 经营成长 is available on the same workspace.
    await layout(`${w}x${h}-growth`);
    await page.getByRole('button', { name: /^今日要事/ }).click();
    await layout(`${w}x${h}-today`);
    await page.keyboard.press('Escape');
    const night = structuredClone(developed);
    setDay(night, Math.floor(target.deadlineAt / 1440) + 1, 1140);
    night.batches.forEach((b) => {
      if (GOODS[b.good].life) b.remainingMinutes = 60;
    });
    await load(night);
    await page.getByRole('button', { name: /^今日要事/ }).click();
    assert.deepEqual(
      await page.locator('.today-task strong').allTextContents(),
      todayTasks(night).map((task) => task.title),
    );
    await layout(`${w}x${h}-deadline-risk`);
    assert.match(await page.getByRole('dialog').innerText(), /20:00截止/);
    await page.keyboard.press('Escape');
  }
  const busyNight = structuredClone(developed);
  setDay(busyNight, Math.floor(target.deadlineAt / 1440) + 1, 1140);
  busyNight.cash = 123456789012;
  busyNight.batches = GOOD_IDS.filter((g) => g !== 'hen').map((g) => ({
    id: busyNight.nextId++,
    good: g,
    units: 10,
    cost: 10,

    remainingMinutes: GOODS[g].life ? 60 : null,
    origin: 'buy',
  }));
  busyNight.buffs = Object.fromEntries(
    Object.keys(BUFFS).map((id) => [id, busyNight.clock.minute + 60]),
  );
  const settled = dispatch(busyNight, {
    type: 'sleep',
    minutes: 600,
    bed: 'mansion',
  });
  assert.equal(settled.error, undefined);
  assert.equal(
    settled.result.items.length,
    GOOD_IDS.filter((g) => g !== 'hen' && GOODS[g].life).length,
  );
  assert.equal(
    settled.state.commerce.orders.find((o) => o.id === target.id).status,
    'failed',
  );
  for (const [w, h] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await load(settled.state);
    await button('住宅').click();
    // 生活 is available on the same workspace.
    await page.locator('.wake-summary summary').click();
    await layout(w + 'x' + h + '-sleep-summary');
    await page
      .locator('.record-feed')
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await layout(w + 'x' + h + '-all-changes');
    await page.getByRole('button', { name: /^今日要事/ }).focus();
    await page.keyboard.press('Enter');
    assert(await page.getByRole('dialog').isVisible());
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1536, height: 864 });
  await load(fixture);
  await button('市场').click();
  const seenGoods = new Set();
  for (let p = 0; p < 1; p++) {
    const rows = page.locator('.list-item');
    for (let i = 0; i < (await rows.count()); i++) {
      await rows.nth(i).click();
      const title = await rows.nth(i).locator('strong').innerText();
      seenGoods.add(title.trim());
      assert.equal(await rows.nth(i).locator('.good-art img').count(), 1);
      assert(
        await rows
          .nth(i)
          .locator('.good-art img')
          .evaluate(async (img) => {
            await img.decode();
            return img.naturalWidth > 0;
          }),
      );
      assert.equal(
        Math.round(
          (await page.locator('.detail .good-art').boundingBox()).width,
        ),
        Math.round(
          Math.max(140, Math.min(180, page.viewportSize().width * 0.1)),
        ),
      );
    }
    await layout('art-goods-page-' + p);
  }
  assert.equal(seenGoods.size, GOOD_IDS.length);
  for (const g of GOOD_IDS) assert(seenGoods.has(GOODS[g].name));
  await page.addStyleTag({
    content: '.good-icon { visibility: hidden !important; }',
  });
  assert.match(
    await page.locator('.detail').first().innerText(),
    /药材|茶叶|酒/,
  );
  await layout('art-text-fallback');
  for (const [width, height] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const trusted = structuredClone(developed);
    trusted.event = null;
    trusted.health = 88.333333333333;
    for (const id of CUSTOMER_IDS) {
      trusted.commerce.relations[id] = 10;
      trusted.commerce.customers[id] = {
        met: true,
        visited: 3,
        lastOutcome: null,
      };
    }
    await load(trusted);
    await button('订单').click();
    // 熟客 is available on the same workspace.
    for (const id of CUSTOMER_IDS) {
      await page
        .locator('.customers-section .list-item')
        .filter({ hasText: CUSTOMERS[id].name })
        .click();
      await button('拜访与回访').click();
      assert.ok(
        (await page.locator('.customers-section .detail').innerText()).includes(
          CUSTOMERS[id].stories[3],
        ),
      );
      assert.match(
        await page.locator('.customers-section .detail').innerText(),
        /4\/4/,
      );
      assert.ok(await button('拜访与回访').isDisabled());
    }
    assert.match(await page.locator('.vital').first().innerText(), /88.3\/100/);
    const saved = await read();
    assert.deepEqual(readSave(JSON.stringify(saved)), saved);
    await layout(`${width}x${height}-至交后续`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${output}/result.json`,
    JSON.stringify({ passed: true, metrics, errors }, null, 2),
  );
  console.log('Commerce browser checks passed', metrics.length);
} finally {
  await browser.close();
}

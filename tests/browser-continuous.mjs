import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { TRADE_MILESTONES } from '../lib/game/market-opportunities.ts';
import { newGame, dispatch } from '../lib/game/engine.ts';

const output = 'tests/browser-output/continuous';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
const measurements = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const state = newGame(20260912);
  state.cash = 10000;
  state.marketOffers.milestones = Object.fromEntries(
    Object.keys(TRADE_MILESTONES).map((id) => [id, state.clock.minute]),
  );
  state.housing = {
    id: 'yard',
    paidThrough: null,
    maintenanceSuspended: false,
  };
  state.home.cart = true;
  state.skills.brewing = 3;
  state.equipment = [
    { id: 8000, kind: 'brewVat', installed: true, jobId: 8001 },
  ];
  state.jobs = [
    {
      id: 8001,
      recipeId: 'wine',
      equipmentId: 8000,
      quantity: 1,
      startDay: 1,

      remainingMinutes: 75,
      inputCost: 100,
      outputUnits: 40,
      status: 'queued',
    },
  ];
  state.nextId = 9000;
  state.home.facilities = [
    { kind: 'warehouse', installed: true },
    { kind: 'bedroom', installed: true },
    { kind: 'coldStorage', installed: true },
    { kind: 'reception', installed: true },
  ];
  for (const [width, height] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((s) => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith('bianliang-ui:')) localStorage.removeItem(key);
      localStorage.setItem('bianliang-save-v3', JSON.stringify(s));
    }, state);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /继续第/ }).click();
    assert.match(
      await page.locator('.job-cells').innerText(),
      /第1日 09:15预计完成/,
    );
    for (const workspace of [
      '市场',
      '住宅',
      '人物',
      '资产',
      '生产',
      '情报',
      '账本',
      '订单',
    ]) {
      await page
        .getByRole('navigation', { name: '经营工作区' })
        .getByRole('button', { name: workspace, exact: true })
        .click();
      if (workspace === '资产') {
        await page.locator('.list-item').filter({ hasText: '炊饼' }).click();
        const details = await page.locator('.detail').innerText();
        assert.match(details, /剩余保鲜/);
        assert.doesNotMatch(details, /日结束时到期/);
      }
      const sections =
        workspace === '住宅'
          ? ['生活', '房屋', '设施']
          : workspace === '市场'
            ? ['行情', '机会']
            : ['默认'];
      for (const section of sections) {
        if (workspace === '住宅')
          await page
            .getByRole('button', { name: section, exact: true })
            .click();
        if (section === '机会') {
          await page
            .getByRole('button', { name: '货盘、夜市与收购', exact: true })
            .click();
          for (const title of Object.values(TRADE_MILESTONES))
            await page.locator('summary').filter({ hasText: title }).click();
          assert.match(
            await page.locator('.detail').last().innerText(),
            /纪念物：首批货签/,
          );
        }
        await page.screenshot({
          path: `${output}/${width}x${height}-${workspace}-${section}.png`,
          fullPage: true,
        });
        const size = await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
        }));
        measurements.push({ workspace, section, ...size });
      }
    }
  }
  // Exercise the actual UI across evening, late night, midnight and dawn.
  const evening = dispatch(state, {
    type: 'wait',
    minutes: 1290 - state.clock.minute,
  });
  assert.equal(evening.error, undefined);
  await page.evaluate((s) => {
    localStorage.setItem('bianliang-save-v3', JSON.stringify(s));
  }, evening.state);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /继续第/ }).click();
  assert.equal(
    await page.locator('main').getAttribute('data-period'),
    'evening',
  );
  await page.getByRole('button', { name: '等待30分钟', exact: true }).click();
  assert.equal(await page.locator('main').getAttribute('data-period'), 'late');
  await page
    .getByRole('navigation', { name: '经营工作区' })
    .getByRole('button', { name: '住宅', exact: true })
    .click();
  await page.getByRole('button', { name: '生活', exact: true }).click();
  await page.getByRole('button', { name: /^入睡 · 醒于/ }).click();
  const morning = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('bianliang-save-v3')),
  );
  assert.equal(morning.clock.minute, 1800);
  assert.equal(morning.day, 2);
  assert.equal(await page.locator('main').getAttribute('data-period'), 'dawn');
  assert.ok(morning.life.wakeSummary.lines.length > 0);
  await page.screenshot({ path: `${output}/390x844-睡醒.png`, fullPage: true });
  writeFileSync(
    `${output}/layout.json`,
    JSON.stringify({ errors, measurements }, null, 2),
  );
  console.log(JSON.stringify({ errors, measurements }, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(
    measurements.every((m) => m.pageWidth <= m.width + 1),
    'horizontal overflow',
  );
  assert.ok(
    measurements
      .filter((m) => m.width >= 1000)
      .every((m) => m.pageHeight <= m.height + 1),
    'desktop page overflow',
  );
} finally {
  await browser.close();
}

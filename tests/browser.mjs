import { setDay } from './helpers.ts';
import { measureLayout } from './layout-check.mjs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame, dispatch, readSave } from '../lib/game/engine.ts';
import { EVENTS, INFO_TEMPLATES } from '../lib/game/content.ts';
import { EQUIPMENT_IDS, GOOD_IDS, GOODS, BUFFS } from '../lib/game/config.ts';
const output = 'tests/browser-output';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const button = (name) => page.getByRole('button', { name, exact: true });
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v4')));
const load = async (s) => {
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  await page.evaluate((s) => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('bianliang-ui:')) localStorage.removeItem(key);
    localStorage.setItem('bianliang-save-v4', JSON.stringify(s));
  }, s);
  await page.reload();
  await page.getByRole('button', { name: /继续第/ }).click();
};
const metrics = [];
async function layout(label) {
  await page.evaluate(() => scrollTo(0, 0));
  const m = await measureLayout(page);
  metrics.push({ label, ...m });
  assert(
    m.assets.every((a) => a.bottom <= m.assetBottom + 1),
    `${label}: assets overlap their summary`,
  );
  assert.equal(
    await page
      .getByRole('button', { name: /^(上一页|下一页|进入市场|离开市场)$/ })
      .count(),
    0,
  );

  await page.screenshot({ path: `${output}/${label}.png` });
  assert(
    (m.width < 1000 || m.pageHeight <= m.height + 1) &&
      m.pageWidth <= m.width + 1,
    `${label} page overflow ${JSON.stringify(m)}`,
  );
  assert.equal(
    m.bad.length,
    0,
    `${label} panel overflow ${JSON.stringify(m.bad)}`,
  );
}
try {
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:4173');
  await button('走进汴梁 · 3000文').click();
  const original = await read();
  await page.reload();
  await button('挑战三万文').click();
  await page.getByRole('dialog').waitFor();
  assert.deepEqual(await read(), original);
  await button('保留当前旅程').click();
  assert.deepEqual(await read(), original);
  await button('挑战三万文').click();
  await button('开始新局').click();
  assert.equal((await read()).target, 30000);
  const downloadPromise = page.waitForEvent('download');
  await button('导出存档').click();
  assert(
    (await downloadPromise).suggestedFilename().includes('bianliang-save-v4'),
  );
  await page.locator('.footer-wait').evaluate((el) => (el.open = true));
  await page
    .locator('.footer-wait')
    .getByRole('button', { name: '等待30分钟', exact: true })
    .click();
  await page.locator('.footer-wait').evaluate((el) => (el.open = true));
  await page
    .locator('.footer-wait')
    .getByRole('button', { name: '等待30分钟', exact: true })
    .click();
  await button('情报').click();
  await button('茶馆听消息 · 8文').click();
  const tea = await read();
  assert.equal(new Set(tea.intel.map((i) => i.semantic)).size, 3);
  assert(!tea.intel.some((i) => i.text.includes(i.semantic)));
  assert(await button('回访核对').isDisabled());
  assert.doesNotMatch(
    await page.locator('.detail').innerText(),
    /核对结果：|追问所得：/,
  );
  await button('追问出处').click();
  assert((await read()).intel.some((i) => i.asked));
  assert.match(await page.locator('.detail').innerText(), /追问所得：/);
  const developed = newGame(20260910, 30000);
  setDay(developed, 100);
  developed.nextId = 1200;
  developed.cash = 25000;
  developed.skills = { husbandry: 3, food: 3, textile: 3, brewing: 3 };
  developed.skillXp = { husbandry: 99, food: 99, textile: 99, brewing: 99 };
  developed.buffs = Object.fromEntries(
    Object.keys(BUFFS).map((k) => [k, developed.clock.minute + 1440]),
  );
  developed.housing = {
    id: 'mansion',
    paidThrough: null,
    maintenanceSuspended: false,
  };
  developed.equipment = EQUIPMENT_IDS.map((kind, i) => ({
    id: 500 + i,
    kind,
    installed: true,
    jobId: null,
  }));
  developed.hens = [{ id: 799, hunger: 0, cost: 100 }];
  developed.batches = GOOD_IDS.filter((g) => g !== 'hen').map((good, i) => ({
    id: 800 + i,
    good,
    units: 100,
    cost: 100,

    remainingMinutes: GOODS[good].life ? GOODS[good].life * 1440 : null,
    origin: 'buy',
  }));
  const sample = dispatch(newGame(1), { type: 'short' }).result;
  developed.operationHistory = Array.from({ length: 50 }, (_, i) => ({
    ...structuredClone(sample),
    id: 900 + i,
    day: i + 1,
    startedAt: i * 1440 + 480,
    finishedAt: i * 1440 + 600,
    details: [`完整记录条目${i + 1}，货物与现金已经核对。`],
    items: GOOD_IDS.map((good) => ({ good, quantity: 1 })),
  }));
  developed.jobs = ['saltedEgg', 'wine'].map((recipeId, i) => ({
    id: 950 + i,
    recipeId,
    quantity: 20,
    equipmentId: developed.equipment.find(
      (e) => e.kind === (i ? 'brewVat' : 'pickleVat'),
    ).id,
    startDay: 99,

    remainingMinutes: (2 + i) * 1440,
    inputCost: 300,
    outputUnits: 800,
    status: 'queued',
  }));
  for (const j of developed.jobs)
    developed.equipment.find((e) => e.id === j.equipmentId).jobId = j.id;
  developed.intel = INFO_TEMPLATES.map((t, i) => ({
    id: `test-${i}`,
    templateId: t.id,
    reportVersion: 2,
    title: t.title,
    semantic: t.semantic,
    category: t.category,
    source: t.source,
    text: t.variants[0],
    heardDay: 99,
    usefulUntil: 110,
    status: 'confirmed',
    followUp: '你回访了原来的消息来源，已经核对过经营条件。',
  }));
  developed.logs = Array.from({ length: 80 }, (_, i) => ({
    id: 1000 + i,
    day: 90 + (i % 10),
    text: '码头的伙计送来了货物，原料与成品的账目已经仔细核对。',
    cash: -100,
    items: '小麦＋20，粟米＋10',
  }));
  await load(original);
  await button('资产').click();
  assert.doesNotMatch(
    await page.locator('.record-feed').innerText(),
    /已打开资产/,
  );
  assert.match(await page.locator('.status-effects').innerText(), /异乡人/);
  assert.match(await page.locator('.detail').innerText(), /2份 \/ 0文/);
  for (const category of ['在制品', '设备', '房产']) {
    assert.match(
      await page.locator('.list-column').innerText(),
      new RegExp('暂无' + category),
    );
    await layout('资产空清单-' + category);
  }
  await load(developed);
  assert.equal(await page.locator('.stock-cells > div').count(), 17);
  assert.equal(await page.locator('.record-feed article').count(), 50);
  await page.locator('.record-feed').focus();
  await page.keyboard.press('End');
  await page.waitForFunction(
    () => document.querySelector('.record-feed').scrollTop > 0,
  );
  assert.match(
    await page.locator('.record-feed').innerText(),
    /完整记录条目1，/,
  );
  assert.match(await page.locator('.status-effects').innerText(), /风寒/);
  await button('风寒').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await page.getByRole('tooltip').waitFor();
  assert.match(await page.getByRole('tooltip').innerText(), /健康/);
  await page.keyboard.press('Escape');
  await button('资产').click();
  for (const category of ['设备', '房产']) {
    await page
      .locator('.inventory-group')
      .filter({
        has: page.getByRole('heading', { name: category, exact: true }),
      })
      .getByRole('button')
      .first()
      .click();
    assert.match(await page.locator('.detail').innerText(), /回收|维护/);
    await layout('资产持有清单-' + category);
  }
  const inProgress = structuredClone(developed);
  inProgress.equipment.forEach((e) => {
    e.jobId = null;
  });
  const vat = inProgress.equipment.find((e) => e.kind === 'brewVat');
  vat.jobId = 950;
  inProgress.jobs = [
    {
      id: 950,
      recipeId: 'wine',
      quantity: 2,
      equipmentId: vat.id,
      startDay: 100,

      remainingMinutes: 2880,
      inputCost: 240,
      outputUnits: 80,
      status: 'queued',
    },
  ];
  await load(inProgress);
  await button('资产').click();
  await page
    .locator('.inventory-group')
    .filter({ has: page.getByRole('heading', { name: '在制品', exact: true }) })
    .getByRole('button')
    .first()
    .click();
  assert.match(await page.locator('.detail').innerText(), /投入成本240文/);
  assert.match(await page.locator('.detail').innerText(), /正常加工/);
  await layout('资产在制品');
  await load(original);
  await button('人物').click();
  await button('街巷').click();
  await button('短工 · 25文').click();
  assert.match(await page.locator('.record-feed').innerText(), /现金\s*\+25文/);
  assert.match(
    await page.locator('.record-feed').innerText(),
    /实际用时120分钟/,
  );
  await layout('顶部操作响应');
  const states = [
    ['初始', original],
    ['满列表', developed],
  ];
  for (const [w, h] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    for (const [name, s] of states) {
      await load(s);
      for (const tab of [
        '市场',
        '资产',
        '生产',
        '住宅',
        '人物',
        '情报',
        '账本',
      ]) {
        await button(tab).click();
        if (tab === '情报' && name === '满列表') {
          assert.doesNotMatch(
            await page.locator('.detail').innerText(),
            /你回访了原来的消息来源/,
          );
          assert(await button('回访核对').isDisabled());
        }
        await layout(`${w}x${h}-${name}-${tab}`);
      }
      await button('生产').click();
      await page
        .locator('.inventory-group')
        .filter({
          has: page.getByRole('heading', { name: '设备', exact: true }),
        })
        .getByRole('button')
        .first()
        .click();
      await layout(`${w}x${h}-${name}-设备`);
    }
    const evening = structuredClone(developed);
    setDay(evening, 100, 1320);
    await load(evening);
    await button('住宅').click();
    // 生活 is available on the same workspace.
    await layout(`${w}x${h}-夜间生活`);
    await page
      .getByText('午休、自选睡眠与等待', { exact: true })
      .evaluate((el) => (el.parentElement.open = true));
    await page.getByLabel('睡眠小时').fill('11');
    assert(
      await page.getByRole('button', { name: /^入睡 · 醒于/ }).isDisabled(),
    );
    await layout(`${w}x${h}-睡眠错误`);
    const variants = EVENTS.flatMap((f) =>
      f.variants.map((v) => ({ f, v })),
    ).sort(
      (a, b) =>
        b.v.texts[0].length +
        b.v.clue.length +
        b.v.inspection.length -
        (a.v.texts[0].length + a.v.clue.length + a.v.inspection.length),
    );
    const { f, v } = variants[0];
    await load({
      ...developed,
      event: {
        id: 999,
        family: f.id,
        variant: v.id,
        person: v.person,
        title: f.title,
        text: v.texts[0],
        clue: v.clue,
        hiddenFact: v.fact,
        inspection: v.inspection,
        inspected: true,
        choices: v.choices,
      },
    });
    await layout(`${w}x${h}-最长遭遇`);
    await load({ ...developed, phase: 'ended', ending: 'return' });
    await layout(`${w}x${h}-结局`);
    await load({ ...developed, cash: 30000 });
    await layout(`${w}x${h}-归航可用`);
    // 价格记录 is available on the same workspace.
    await layout(`${w}x${h}-行情历史`);
    // 交易详情 is available on the same workspace.
    await page
      .locator('.item-list')
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await layout(`${w}x${h}-市场末页`);
  }
  await page.setViewportSize({ width: 1536, height: 864 });
  // Visible-control transaction and fatigue confirmation.
  await load(original);
  await page.getByLabel('粟米数量').fill('1.5');
  await button('买入').click();
  assert.equal((await read()).cash, original.cash - 32);
  await page.reload();
  await page.getByRole('button', { name: /继续第/ }).click();
  assert.equal((await read()).phase, 'day');
  await load({ ...original, stamina: 40 });
  await button('人物').click();
  await button('街巷').click();
  await button('重活 · 40文').click();
  assert.equal((await read()).stamina, 0);
  assert.equal((await read()).health, 100);
  // Production with insufficient cash/materials gives visible reasons, not silent click failures.
  await load({ ...developed, cash: 0, stamina: 0 });
  await button('生产').click();
  await layout('1536-invalid-production');
  assert(await button('开工').isDisabled());
  const legacy = { ...original, version: 2 };
  await page.evaluate(
    (raw) => localStorage.setItem('bianliang-save-v4', raw),
    JSON.stringify(legacy),
  );
  await page.reload();
  await page.getByText(/存档损坏或版本不兼容/).waitFor();
  assert.deepEqual(await read(), legacy);
  await layout('incompatible-save-preserved');
  await page.evaluate(() =>
    localStorage.setItem('bianliang-save-v4', '{"broken":true}'),
  );
  await page.reload();
  await page.getByText(/存档损坏或版本不兼容/).waitFor();
  await button('挑战三万文').click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('bianliang-save-v4')),
    '{"broken":true}',
  );
  await button('保留当前旅程').click();
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync(
    `${output}/result.json`,
    JSON.stringify(
      {
        passed: true,
        checks: metrics.length,
        metrics,
        errors,
        scope:
          '1536×864, 1920×900, 1920×1080 desktop and 390×844 mobile; mobile permits vertical scrolling',
      },
      null,
      2,
    ),
  );
  console.log('Desktop and mobile browser checks passed', metrics.length);
} catch (e) {
  writeFileSync(
    `${output}/failure.json`,
    JSON.stringify({ error: String(e), metrics, errors }, null, 2),
  );
  throw e;
} finally {
  await page.context().close();
  await browser.close();
  console.log('Browser cleanup complete');
}

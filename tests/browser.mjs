import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core',
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const output = 'tests/browser-output';
mkdirSync(output, { recursive: true });
const save = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v1')));
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  await page.getByRole('button', { name: '走进汴梁 →' }).click();
  await page.getByRole('button', { name: '茶馆听消息', exact: false }).click();
  await page.getByRole('tab', { name: '情报', exact: true }).click();
  assert.equal((await save()).cash, 792);
  await page.getByRole('button', { name: '州桥市', exact: false }).click();
  await page.getByRole('spinbutton', { name: '粟米数量' }).fill('20');
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('spinbutton', { name: '粟米数量' }) })
    .getByRole('button', { name: '买入', exact: true })
    .click();
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('spinbutton', { name: '母鸡数量' }) })
    .getByRole('button', { name: '买入', exact: true })
    .click();
  assert.equal((await save()).cash, 246);
  await page.screenshot({
    path: output + '/market-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '离开市场', exact: true }).click();
  await page.getByRole('spinbutton', { name: '喂鸡数量' }).fill('1');
  await page.getByRole('button', { name: '安排妥当，度过这一夜 →' }).click();
  const day2 = await save();
  assert.equal(day2.day, 2);
  assert.equal(day2.cash, 216);
  await page.reload();
  await page.getByRole('button', { name: '继续第 2 日的旅程' }).click();
  assert.deepEqual(await save(), day2);
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '保留当前旅程', exact: true }).click();
  assert.deepEqual(await save(), day2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + '/mobile.png', fullPage: true });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'page horizontally overflows',
  );
  // Finish a complete run through visible controls. Do not inject state or read hidden outcomes.
  let n = 0;
  let inspected=false;
  while ((await save()).phase !== 'ended' && n++ < 180) {
    const current = await save();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'flow horizontally overflows');
    if (current.event) {
      if(!inspected){
        await page.getByRole('button',{name:'向附近人查问',exact:false}).click();
        const checked=await save();assert.equal(checked.cash,current.cash-5);assert(checked.event.inspected);
        await page.reload();await page.getByRole('button',{name:`继续第 ${checked.day} 日的旅程`}).click();
        assert.deepEqual(await save(),checked);await page.screenshot({path:output+'/encounter.png',fullPage:true});inspected=true;
      }
      await page
        .getByRole('button', { name: '告辞离开', exact: false })
        .click();
      continue;
    }
    if (current.phase === 'last') {
      await page.getByRole('button', { name: '留在北宋，结算此生' }).click();
      continue;
    }
    if (current.phase === 'night') {
      const hasBread = current.batches.some(
        (b) => b.good === 'bread' && b.units >= 10,
      );
      await page
        .getByRole('radio', {
          name: hasBread ? '炊饼一个' : '食肆 · 18文 / 体力 +5',
          exact: true,
        })
        .check();
      await page
        .getByRole('radio', {
          name: current.rented
            ? '租屋 · 免费 / 体力回满'
            : '通铺 · 30文 / 体力回满',
          exact: true,
        })
        .check();
      await page
        .getByRole('spinbutton', { name: '喂鸡数量' })
        .fill(
          String(
            Math.min(
              current.hens.length,
              Math.floor(
                current.batches
                  .filter((b) => b.good === 'grain')
                  .reduce((a, b) => a + b.units, 0) / 2,
              ),
            ),
          ),
        );
      await page
        .getByRole('button', { name: '安排妥当，度过这一夜 →' })
        .click();
      continue;
    }
    if (current.cash >= 3000) {
      await page
        .getByRole('button', { name: '支付3000文归航', exact: true })
        .click();
      continue;
    }
    if (!current.rented && current.cash >= 450) {
      await page
        .getByRole('button', { name: '租住小屋', exact: false })
        .click();
      continue;
    }
    const heavy = page.getByRole('button', { name: '码头重活', exact: false });
    if (await heavy.isEnabled()) await heavy.click();
    else
      await page
        .getByRole('button', { name: '坐下歇脚', exact: false })
        .click();
  }
  const end = await save();
  assert.equal(end.phase, 'ended');
  assert.equal(end.ending, 'return');
  assert(inspected);
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: output + '/ending.png', fullPage: true });
  // Corrupt-save handling must preserve the original until explicit replacement.
  await page.evaluate(() =>
    localStorage.setItem('bianliang-save-v1', '{"broken":true}'),
  );
  await page.reload();
  await page.getByRole('status').filter({ hasText: '存档损坏' }).waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('bianliang-save-v1')),
    '{"broken":true}',
  );
  writeFileSync(
    output + '/result.json',
    JSON.stringify(
      {
        passed: true,
        completedDay: end.day,
        ending: end.ending,
        browserErrors: errors,
        nativeWebMCP:await page.evaluate(()=>typeof document.modelContext?.registerTool==='function'),
        checks: [
          'opening',
          'tea',
          'market',
          'night',
          'save reload',
          'restart cancel',
          '390px viewport',
          'full visible-control run',
          'corrupt save',
          'inspect encounter and reload',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Browser checks passed', end.day, end.ending);
} finally {
  await browser.close();
}

import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const click = async (name) => {
  await page.getByRole('button', { name, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible())
    await page.getByRole('button', { name: '确认执行', exact: true }).click();
};
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v2')));
try {
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:4173');
  await click('走进汴梁 · 3000文');
  let s;
  let steps = 0;
  let inspections = 0;
  while ((s = await read()).phase !== 'ended' && steps++ < 1200) {
    if (s.event) {
      if (!s.event.inspected && s.cash >= 5 && inspections < 1) {
        await click('向附近人查问 · 5文');
        inspections++;
      }
      await click('告辞离开');
      continue;
    }
    if (s.cash >= s.target) {
      await click(`支付${s.target.toLocaleString('zh-CN')}文归航`);
      continue;
    }
    if (s.phase === 'night') {
      await page
        .getByLabel('晚饭')
        .selectOption(
          s.batches.some((b) => b.good === 'bread' && b.units >= 10)
            ? 'bread'
            : 'diner',
        );
      await page
        .getByLabel('住宿')
        .selectOption(s.housing.id === 'street' ? 'inn' : s.housing.id);
      await page.getByLabel('喂鸡数量').fill('0');
      await click('安排妥当，度过这一夜 →');
      continue;
    }
    if (s.housing.id === 'street') {
      await click('住宅');
      await page.getByRole('button', { name: /租赁小屋 接手/ }).click();
      await click('租下');
      continue;
    }
    await click('人物');
    if (!s.daily.rest) {
      await click('休息 · 恢复25体力');
      continue;
    }
    if (!s.daily.snack) {
      await click('加餐 · 6文 / +15体力');
      continue;
    }
    if (s.health < 70 && s.cash > 100 && !s.daily.treatment) {
      await click('调养 · 30文 / +10健康');
      continue;
    }
    const heavy = page.getByRole('button', {
      name: '重活 · 40文',
      exact: true,
    });
    if (await heavy.isEnabled()) {
      await click('重活 · 40文');
      continue;
    }
    const short = page.getByRole('button', {
      name: '短工 · 25文',
      exact: true,
    });
    if (await short.isEnabled()) {
      await click('短工 · 25文');
      continue;
    }
    await click('收工，安排今晚 →');
  }
  assert.equal(s.ending, 'return');
  assert.equal(errors.length, 0);
  assert(inspections > 0);
  await page.screenshot({
    path: 'tests/browser-output/visible-flow-ending.png',
  });
  writeFileSync(
    'tests/browser-output/flow-result.json',
    JSON.stringify(
      { passed: true, completedDay: s.day, steps, inspections, errors },
      null,
      2,
    ),
  );
  console.log('Full visible desktop flow passed', s.day, steps);
} finally {
  await browser.close();
}

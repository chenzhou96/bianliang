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
  page.evaluate(() => JSON.parse(localStorage.getItem('bianliang-save-v4')));
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
    if (s.housing.id === 'street') {
      await click('住宅');
      // 房屋 is available on the same workspace.
      await page.getByRole('button', { name: /租赁小屋 接手/ }).click();
      await click('租下');
      continue;
    }
    const time = s.clock.minute % 1440;
    const cycle = Math.floor((s.clock.minute - 360) / 1440);
    if (s.life.ateCycle !== cycle && time >= 360 && time < 1440) {
      await click('住宅');
      // 生活 is available on the same workspace.
      await page
        .getByLabel('主餐', { exact: true })
        .selectOption(
          s.batches.some((b) => b.good === 'bread' && b.units >= 10)
            ? 'bread'
            : 'diner',
        );
      await click('用主餐 · 30分钟');
      continue;
    }
    await click('人物');
    if (
      s.health < 70 &&
      s.cash > 100 &&
      !s.daily.treatment &&
      time >= 480 &&
      time <= 900
    ) {
      await click('调养 · 30文 / +10健康');
      continue;
    }
    await click('街巷');
    const short = page.getByRole('button', {
      name: '短工 · 25文',
      exact: true,
    });
    if (await short.isEnabled()) {
      await click('短工 · 25文');
      continue;
    }
    if (time >= 480 && time <= 900 && s.stamina < 30) {
      await click('人物');
      await click('休息1小时');
      continue;
    }
    await click('住宅');
    // 生活 is available on the same workspace.
    await page.getByLabel('住宿', { exact: true }).selectOption(s.housing.id);
    const untilMorning = time < 480 ? 480 - time : 1920 - time;
    const minutes = Math.min(600, untilMorning);
    await page
      .getByText('午休、自选睡眠与等待', { exact: true })
      .evaluate((el) => (el.parentElement.open = true));
    await page
      .getByLabel('睡眠小时', { exact: true })
      .fill(String(minutes / 60));
    await page
      .getByText('午休、自选睡眠与等待', { exact: true })
      .evaluate((el) => (el.parentElement.open = true));
    await page.getByRole('button', { name: /^入睡 · 醒于/ }).click();
  }
  assert.equal(s.ending, 'return');
  assert.match(
    await page.locator('.asset-rail').innerText(),
    new RegExp(`已结清第${s.day}日费用`),
  );
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

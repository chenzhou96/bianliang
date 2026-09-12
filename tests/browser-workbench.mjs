import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { newGame } from '../lib/game/engine.ts';
import { measureLayout } from './layout-check.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const nav = (name) =>
  page
    .getByRole('navigation', { name: '经营工作区' })
    .getByRole('button', { name, exact: true })
    .click();
const out = 'tests/browser-output/workbench';
mkdirSync(out, { recursive: true });
try {
  await page.goto('http://127.0.0.1:4173');
  for (const [width, height] of [
    [1536, 864],
    [1920, 900],
    [1920, 1080],
    [2630, 2100],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.opening-art').evaluate((img) => img.decode());
    const cover = await page.locator('.opening').boundingBox();
    const art = await page.locator('.opening-art').boundingBox();
    assert(Math.abs(cover.x) <= 1 && Math.abs(cover.width - width) <= 1);
    assert(cover.y + cover.height >= height - 1);
    assert(
      Math.abs(art.width - cover.width) <= 1 &&
        Math.abs(art.height - cover.height) <= 1,
    );
    await page.screenshot({ path: `${out}/${width}-cover.png` });
    await page.evaluate(
      (s) => localStorage.setItem('bianliang-save-v4', JSON.stringify(s)),
      newGame(42),
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /继续第/ }).click();
    for (const name of ['市场', '生产', '住宅', '资产', '人物', '订单']) {
      await nav(name);
      const layout = await measureLayout(page);
      assert.deepEqual(
        layout.bad,
        [],
        `${width} ${name}: ${JSON.stringify(layout.bad)}`,
      );
      assert(layout.pageWidth <= width + 1);
      if (width >= 1100) assert(layout.pageHeight <= height + 1);
      if (name === '市场') {
        assert(
          await page
            .getByRole('heading', { name: '货盘、夜市与收购' })
            .isVisible(),
        );
        assert(
          await page.getByRole('heading', { name: '价格记录' }).isVisible(),
        );
        assert.equal(
          await page.getByRole('button', { name: '返回商品行情' }).count(),
          0,
        );
        const buy = page.getByRole('button', { name: '买入', exact: true });
        const tradeCard = page.getByRole('group', {
          name: '买入',
          exact: true,
        });
        const tradeHint = tradeCard.getByRole('button', {
          name: '操作详情：买入',
          exact: true,
        });
        const actionBox = await buy.boundingBox();
        const hintBox = await tradeHint.boundingBox();
        assert(
          Math.abs(
            actionBox.y +
              actionBox.height / 2 -
              (hintBox.y + hintBox.height / 2),
          ) < 2,
        );
        await tradeHint.click();
        await page.getByRole('tooltip').waitFor();
        assert.match(await page.getByRole('tooltip').innerText(), /耗时12分钟/);
        await page.keyboard.press('Escape');
        await tradeHint.evaluate((el) => el.blur());
        await page.mouse.move(0, 0);
        await page.getByRole('tooltip').waitFor({ state: 'hidden' });
        if (width >= 1100) {
          const b = await buy.boundingBox(),
            panel = await page.locator('.market-detail').boundingBox();
          assert(
            b.y >= panel.y && b.y + b.height <= panel.y + panel.height + 1,
            'trade action clipped',
          );
        }
        const hint = page.getByRole('button', { name: '成本与利润说明' });
        await hint.click();
        await page.getByRole('tooltip').waitFor();
        assert(await page.getByRole('tooltip').isVisible());
        assert.match(
          await page.getByRole('tooltip').innerText(),
          /不含生活与住房/,
        );
        await page.keyboard.press('Escape');
        await hint.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await page.getByRole('tooltip').waitFor();
        await page.keyboard.press('Escape');
        await hint.evaluate((el) => el.blur());
        await page.mouse.move(0, 0);
        await page.getByRole('tooltip').waitFor({ state: 'hidden' });
      }
      if (name === '生产')
        for (const group of ['配方', '设备', '队列 (0)'])
          assert(
            await page
              .getByRole('heading', { name: group, exact: true })
              .isVisible(),
          );
      if (name === '住宅')
        for (const cls of [
          '.art-home-layout',
          '.facilities-section',
          '.property-section',
        ])
          assert(await page.locator(cls).isVisible());
      if (name === '住宅') {
        const motion = page.getByRole('checkbox', { name: '减少动态' });
        await motion.check();
        assert(await motion.isChecked());
        assert(await page.locator('main.reduce-motion').count());
        await motion.focus();
        await page.keyboard.press('Space');
        assert.equal(await motion.isChecked(), false);
      }
      if (name === '订单')
        for (const group of ['可接订单', '进行中', '近期记录', '熟客'])
          assert(
            await page
              .getByRole('heading', { name: group, exact: true })
              .isVisible(),
          );
      if (name === '人物')
        assert(
          await page.getByRole('heading', { name: '经营成长' }).isVisible(),
        );
      await page
        .locator('img:visible')
        .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${out}/${width}-${name}.png`,
        fullPage: width < 700,
      });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'Flat workbench passed: 5 cover sizes; 30 workspace states; on-page sections, trade visibility, pointer and keyboard hints.',
  );
} finally {
  await page.context().close();
  await browser.close();
}

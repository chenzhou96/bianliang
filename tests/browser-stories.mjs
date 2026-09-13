import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame, maybeEncounter, readSave } from '../lib/game/engine.ts';
import { discoverStory } from '../lib/game/story-engine.ts';
import { STREET_SCENES } from '../lib/game/street-scenes.ts';
import { setDay } from './helpers.ts';

const output = 'tests/browser-output/stories';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  checks = [];
try {
  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:4173');
    const button = (name) => page.getByRole('button', { name, exact: true });
    const read = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('bianliang-save-v4')),
      );
    const load = async (s) => {
      readSave(JSON.stringify(s));
      await page.evaluate((s) => {
        localStorage.clear();
        localStorage.setItem('bianliang-save-v4', JSON.stringify(s));
      }, s);
      await page.reload();
      await page.getByRole('button', { name: /继续第/ }).click();
    };
    const s = newGame(812, 30000);
    setDay(s, 2, 540);
    s.cooldowns = Object.fromEntries(
      STREET_SCENES.filter((e) => e.family !== 'eggs').map((e) => [
        e.family,
        99999,
      ]),
    );
    maybeEncounter(s, true);
    assert.equal(s.event.sceneId, 'eggs-bridge');
    await load(s);
    const modal = page.getByRole('dialog');
    await modal.waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.click(1, 1);
    assert.equal(await modal.count(), 1);
    await page.keyboard.press('Tab');
    assert.ok(
      await modal.evaluate((node) => node.contains(document.activeElement)),
    );
    await modal.getByRole('heading').first().click();
    await page.screenshot({ path: `${output}/${viewport.width}-scene.png` });
    const box = await modal.boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
    );
    await page.reload();
    await page.getByRole('button', { name: /继续第/ }).click();
    assert.equal((await read()).event.id, s.event.id);
    await button('给陈婆婆20文解急').click();
    await modal.waitFor({ state: 'detached' });
    assert.equal((await read()).cash, s.cash - 20);
    assert.equal((await read()).stories[0].stage, 'letter');
    await button('情报').click();
    await page.getByText('等待来信', { exact: true }).first().waitFor();
    await page.screenshot({ path: `${output}/${viewport.width}-waiting.png` });
    await load(s);
    await button('帮阿成整理并护送').click();
    await modal.waitFor({ state: 'detached' });
    assert.equal((await read()).stories[0].stage, 'porter');
    await button('情报').click();
    await button('等跑堂交班作证').click();
    assert.equal((await read()).stories[0].stage, 'reconcile');
    await button('随阿成去码头认门').click();
    const alternate = await read();
    assert.equal(alternate.stories[0].stage, 'porter-end');
    assert.equal(alternate.commerce.customers.ferryman.met, true);
    assert.equal(alternate.cash, s.cash);
    await page.getByText(/此前的选择/).click();
    await page.screenshot({
      path: `${output}/${viewport.width}-porter-ending.png`,
    });
    const full = newGame(822, 30000);
    setDay(full, 3, 540);
    full.cash = 3000;
    const q = discoverStory(full, 'broken-eggs', 'encounter', 'supply');
    discoverStory(full, 'theatre', 'encounter', 'seams');
    discoverStory(full, 'granary', 'encounter', 'settlement');
    discoverStory(full, 'embroidery', 'tea');
    discoverStory(full, 'old-house', 'tea');
    discoverStory(full, 'guest-cook', 'tea');
    await load(full);
    await button('情报').click();
    await page.getByRole('button', { name: /一篮碎蛋与一纸欠账/ }).click();
    await button('前往市场：交付四枚鸡蛋').click();
    const deliver = button('交付四枚鸡蛋');
    await deliver.waitFor();
    assert.equal(await deliver.isDisabled(), true);
    await deliver.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${viewport.width}-missing.png` });
    full.batches.push({
      id: full.nextId++,
      good: 'egg',
      units: 40,
      cost: 40,
      origin: 'buy',
      remainingMinutes: 2880,
    });
    await load(full);
    await button('情报').click();
    await page.getByRole('button', { name: /一篮碎蛋与一纸欠账/ }).click();
    await button('前往市场：交付四枚鸡蛋').click();
    await deliver.click();
    assert.equal(
      (await read()).stories.find((v) => v.id === q.id).stage,
      'supplier-end',
    );
    assert.equal((await read()).cash, full.cash + 90);
    await button('情报').click();
    await page.getByLabel('情报分类').selectOption('已结束');
    await page.getByText(/此前的选择/).click();
    await page.screenshot({ path: `${output}/${viewport.width}-ending.png` });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    checks.push({
      viewport,
      scene: true,
      restore: true,
      branches: true,
      missing: true,
      delivery: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${output}/report.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(`Stories browser: ${checks.length} viewports passed`);
} finally {
  await browser.close();
}

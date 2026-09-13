import { measureLayout } from './layout-check.mjs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame, dispatch, readSave } from '../lib/game/engine.ts';
import { GOODS } from '../lib/game/config.ts';
import { discoverStory } from '../lib/game/story-engine.ts';
const output = 'tests/browser-output/market-control';
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
    await page.goto('http://127.0.0.1:4173');
    const read = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('bianliang-save-v4')),
      );
    const button = (name) => page.getByRole('button', { name, exact: true });
    const load = async (s) => {
      readSave(JSON.stringify(s));
      await page.evaluate((s) => {
        localStorage.clear();
        localStorage.setItem('bianliang-save-v4', JSON.stringify(s));
      }, s);
      await page.reload();
      await page.getByRole('button', { name: /继续第/ }).click();
    };
    const s = newGame(711, 30000);
    s.cash = 5000;
    for (const good of ['tea', 'herb', 'silk', 'egg', 'salt', 'bread'])
      s.batches.push({
        id: s.nextId++,
        good,
        units: 30,
        cost: 100,
        origin: 'buy',
        remainingMinutes: GOODS[good].life ? 1440 : null,
      });
    await load(s);
    await button('市场').click();
    await page.getByText('主动影响粟米行情', { exact: true }).click();
    for (const [name, expected] of [
      ['招徕买家', /现金变化：\s*-30文/],
      ['联络外埠来货', /现金变化：\s*-40文/],
      ['散布紧缺消息', /现金变化：\s*不确定/],
    ]) {
      await button(`操作详情：${name}`).click();
      const tip = page.getByRole('tooltip');
      await tip.waitFor();
      const text = await tip.innerText();
      assert.match(text, expected);
      assert.doesNotMatch(text, /失窃/);
      if (name === '散布紧缺消息') assert.match(text, /罚/);
      await page.screenshot({
        path: `${output}/${viewport.width}-${name}-hint.png`,
      });
      await page.keyboard.press('Escape');
      await page.mouse.move(1, 1);
      await tip.waitFor({ state: 'hidden' });
    }
    await button('招徕买家').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.item-list .list-item').count(), 17);
    assert.equal(await page.getByText('统一牌价', { exact: true }).count(), 1);
    await page.screenshot({ path: `${output}/${viewport.width}-expanded.png` });
    await button('招徕买家').click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('bianliang-save-v4')).marketControl
          .expenses > 0,
    );
    assert.equal((await read()).cash, 4970);
    assert.equal(await button('联络外埠来货').isDisabled(), true);
    await page.reload();
    await page.getByRole('button', { name: /继续第/ }).click();
    assert.ok((await read()).marketControl.nextAt > 0);
    const poor = structuredClone(s);
    poor.cash = 0;
    await load(poor);
    await button('市场').click();
    await page.getByText('主动影响粟米行情', { exact: true }).click();
    for (const name of ['招徕买家', '联络外埠来货', '散布紧缺消息'])
      assert.equal(await button(name).isDisabled(), true);
    await button('散布紧缺消息').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${viewport.width}-disabled.png` });
    const shortage = structuredClone(s);
    shortage.batches = shortage.batches.filter((b) => b.good !== 'bread');
    discoverStory(shortage, 'tea-price', 'tea', 'tea-table');
    await load(shortage);
    await button('市场').click();
    assert.equal(await button('交付茶席炊饼').isDisabled(), true);
    await button('交付茶席炊饼').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/${viewport.width}-story-shortage.png`,
    });
    shortage.batches.push({
      id: shortage.nextId++,
      good: 'bread',
      units: 40,
      cost: 80,
      origin: 'buy',
      remainingMinutes: 1440,
    });
    await load(shortage);
    await button('市场').click();
    await button('交付茶席炊饼').click();
    assert.equal((await read()).stories[0].stage, 'honest-end');
    assert.equal((await read()).cash, 5100);
    let caught;
    for (let seed = 1; seed < 100; seed++) {
      const state = newGame(seed, 30000);
      state.cash = 5000;
      const q = discoverStory(state, 'tea-price', 'tea');
      const r = dispatch(state, {
        type: 'storyAction',
        storyId: q.id,
        stage: q.stage,
        choiceId: 'rumor',
      });
      if (r.state.marketControl.jailedUntil) {
        caught = r.state;
        break;
      }
    }
    assert.ok(caught);
    await load(caught);
    await button('情报').click();
    assert.match(
      await page.locator('[aria-label="拘押"]').innerText(),
      /20:45/,
    );
    await button('服满拘押').scrollIntoViewIfNeeded();
    const custodyLayout = await measureLayout(page);
    assert.deepEqual(custodyLayout.bad, []);
    assert.ok(
      viewport.width < 1000 || custodyLayout.pageHeight <= viewport.height + 1,
    );
    await page.screenshot({ path: `${output}/${viewport.width}-custody.png` });
    await button('服满拘押').click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('bianliang-save-v4')).marketControl
          .jailedUntil === 0,
    );
    assert.equal((await read()).clock.minute, caught.clock.minute + 720);
    await button('认罚结束此事').click();
    assert.equal((await read()).stories[0].stage, 'risk-end');
    const size = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
    checks.push({
      viewport,
      fullList: true,
      influence: true,
      disabled: true,
      reload: true,
      custody: true,
      storyEnding: true,
      noOverflow: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}

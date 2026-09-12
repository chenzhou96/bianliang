import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { newGame } from '../lib/game/engine.ts';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const nav = (name) =>
  page
    .getByRole('navigation', { name: '经营工作区' })
    .getByRole('button', { name, exact: true })
    .click();
async function load(s) {
  await page.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem('bianliang-save-v4', JSON.stringify(state));
  }, s);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /继续第/ }).click();
}
try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const manifest = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
  for (const row of manifest) {
    const response = await page.request.get(
      `http://127.0.0.1:4173/${row.file.replace('public/', '')}`,
    );
    assert.equal(response.status(), 200, row.file);
    assert.equal((await response.body()).length, row.bytes, row.file);
  }
  for (const [housing, scene] of Object.entries({
    street: 'street',
    room: 'home-room',
    courtyard: 'home-empty',
    yard: 'home-yard',
    mansion: 'home-mansion',
  })) {
    const s = newGame(20260912);
    s.housing = {
      id: housing,
      paidThrough: ['room', 'courtyard'].includes(housing) ? 5 : null,
      maintenanceSuspended: false,
    };
    s.equipment = [
      { id: 8000, kind: 'mill', installed: true, jobId: null },
      { id: 8001, kind: 'stove', installed: false, jobId: null },
    ];
    s.nextId = 9000;
    await load(s);
    await nav('住宅');
    const estate = page.locator('.home-estate');
    assert.equal(
      await estate.locator('.scene-art img').getAttribute('src'),
      `/art/scenes/${scene}-v1.webp`,
    );
    await estate.locator('.scene-art img').evaluate((img) => img.decode());
    assert.equal(await estate.locator('[data-equipment="mill"]').count(), 1);
    assert.equal(await estate.locator('[data-equipment="stove"]').count(), 0);
    assert.match(await estate.innerText(), /0 只母鸡/);
  }
  for (const minute of [480, 1200]) {
    const s = newGame(42);
    s.clock.minute = minute;
    await load(s);
    await nav('市场');
    assert.match(
      await page.locator('.market-panel .panel-head img').getAttribute('src'),
      minute === 480 ? /morning-market/ : /night-market/,
    );
  }
  await load(newGame(42));
  await nav('市场');
  const buy = page.getByRole('button', { name: '买入', exact: true });
  const box = await buy.boundingBox();
  assert(box && box.y >= 0 && box.y + box.height < 864);
  await buy.focus();
  assert(await buy.evaluate((el) => document.activeElement === el));
  await page.route('**/art/goods/*', (route) => route.abort());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /继续第/ }).click();
  await nav('市场');
  await page.waitForFunction(
    () => !document.querySelector('.market-detail .good-art img'),
  );
  assert(await page.locator('.market-detail .good-art-fallback').isVisible());
  assert(await buy.isVisible());
  await page.unroute('**/art/goods/*');
  await load(newGame(42));
  mkdirSync('tests/browser-output/art', { recursive: true });
  for (const name of ['街巷', '市场', '生产', '住宅', '情报']) {
    await nav(name);
    await page
      .locator('img:visible')
      .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    await page.screenshot({ path: `tests/browser-output/art/${name}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Art checks passed: 51 assets, 5 housing states, installed-only equipment, day/night, visible trade action, keyboard focus, image-failure fallback.',
  );
} finally {
  await browser.close();
}

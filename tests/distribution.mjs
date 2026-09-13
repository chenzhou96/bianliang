import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';
const run = promisify(execFile);
const root = resolve('releases/v4-r6-20260913/Bianliang-v4-r6-20260913-macOS');
const temporary = await mkdtemp(join(tmpdir(), '汴梁 release test '));
const extracted = join(temporary, '含空格 游戏');
await mkdir(extracted);
await run('/usr/bin/ditto', ['-x', '-k', root + '.zip', extracted]);
const app = join(
  extracted,
  'Bianliang-v4-r6-20260913-macOS/汴梁归途.app/Contents/MacOS/launcher',
);
await mkdir('tests/browser-output/distribution', { recursive: true });
const env = {
  ...process.env,
  BIANLIANG_PORT: '41749',
  BIANLIANG_DATA_DIR: join(temporary, 'data'),
  BIANLIANG_NO_BROWSER: '1',
};
const launch = (...args) => run(app, args, { env });
const url = 'http://127.0.0.1:41749';
let browser;
const errors = [],
  external = [];
try {
  await launch();
  const health = await (await fetch(url + '/__game_health')).json();
  await launch();
  assert.equal(
    (await (await fetch(url + '/__game_health')).json()).pid,
    health.pid,
  );
  assert.equal(
    (await fetch(url + '/__game_stop', { method: 'POST' })).status,
    403,
  );
  assert.equal((await fetch(url + '/settings.mjs')).status, 404);
  assert.equal((await fetch(url + '/%2e%2e%2fbuild.json')).status, 403);
  assert.equal((await fetch(url, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(url, { method: 'PUT' })).status, 405);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1536, height: 864 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== url) {
      external.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto(url);
  const art = JSON.parse(await readFile('public/art/manifest.json', 'utf8'));
  for (const row of art) {
    const path = '/' + row.file.replace('public/', '');
    const response = await page.request.get(url + path);
    assert.equal(response.status(), 200, path);
    assert.match(response.headers()['content-type'], /^image\/webp/);
    assert.equal(
      createHash('sha256')
        .update(await response.body())
        .digest('hex'),
      row.sha256,
      path,
    );
    const size = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, path);
    assert.deepEqual(size, row.size, path);
  }
  await page.locator('.opening-art').evaluate((img) => img.decode());
  await page.screenshot({
    path: 'tests/browser-output/distribution/cover.png',
  });
  console.log(
    `All ${art.length} art assets: HTTP, MIME, SHA-256 and browser decoding passed.`,
  );
  await page.getByRole('button', { name: '走进汴梁 · 3000文' }).first().click();
  for (const name of ['街巷', '市场', '生产', '住宅', '情报']) {
    await page
      .getByRole('navigation', { name: '经营工作区' })
      .getByRole('button', { name, exact: true })
      .click();
    await page
      .locator('img:visible')
      .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
  }
  await page.getByRole('button', { name: '市场', exact: true }).click();
  await page.getByText('主动影响粟米行情', { exact: true }).click();
  await page.getByRole('button', { name: '招徕买家', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('bianliang-save-v4')).marketControl
        .expenses > 0,
  );
  const save = await page.evaluate(() =>
    localStorage.getItem('bianliang-save-v4'),
  );
  assert.equal(JSON.parse(save).cash, 770);
  await mkdir('tests/browser-output/distribution', { recursive: true });
  await page.screenshot({
    path: 'tests/browser-output/distribution/desktop.png',
  });
  await launch('--stop');
  await new Promise((r) => setTimeout(r, 300));
  await launch();
  await page.reload();
  await page.getByRole('button', { name: /继续第/ }).click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('bianliang-save-v4')),
    save,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '市场', exact: true }).click();
  await page.screenshot({
    path: 'tests/browser-output/distribution/mobile.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const win = resolve(
    'releases/v4-r6-20260913/Bianliang-v4-r6-20260913-Windows11',
  );
  for (const [arch, machine] of [
    ['x64', 0x8664],
    ['arm64', 0xaa64],
  ]) {
    const pe = await readFile(join(win, `runtime/win-${arch}/node.exe`));
    assert.equal(pe.toString('ascii', 0, 2), 'MZ');
    const offset = pe.readUInt32LE(0x3c);
    assert.equal(pe.readUInt16LE(offset + 4), machine);
  }
  const cmd = await readFile(join(win, '开始游戏.cmd'), 'utf8');
  assert.ok(cmd.includes('\r\n'));
  assert.match(cmd, /%~dp0runtime/);
  console.log(
    'PASS: extracted Mac bundle, Chinese/spaced path, restart/save, desktop/mobile, local-only assets, authenticated stop, Windows PE architectures and launcher structure.',
  );
} finally {
  await browser?.close();
  await launch('--stop').catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await rm(temporary, { recursive: true, force: true });
}

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const root = new URL('.', import.meta.url).pathname;
const compact = `
body{padding:10px 12px;font-size:14px}
header{height:34px}header h1{font-size:23px}header .seal{font-size:21px;padding:1px 7px}header>div,header aside{gap:10px}header button{padding:4px 10px}
.status{height:64px;margin:6px 0 8px;gap:14px;grid-template-columns:.65fr 1.25fr 1fr 1fr .8fr auto}
.status>div{height:54px;padding-right:10px}.status strong{font-size:16px;line-height:20px}.status small,.status span{font-size:14px;line-height:17px}.status progress{margin:1px 0;height:4px;flex-shrink:0}.status>button{padding:7px 11px}
.a main{height:calc(100% - 112px);grid-template-columns:236px minmax(0,1fr) 252px;gap:8px}
.panel{border-radius:5px}.panel-title{padding:10px 9px 8px;gap:5px}.panel-title b{font-size:18px}.panel-title span{font-size:14px}.assets .panel-title{flex-wrap:wrap}.assets .panel-title span{color:#647965}
.asset-content{padding:0 9px}.assets .group{padding:7px 0}.assets .group h3{font-size:14px;margin-bottom:5px}.group h3 small{font-size:14px}
.stock-grid{gap:3px}.stock-grid>div{padding:3px 4px;gap:2px;font-size:14px}.stock-grid b{font-weight:500}.equipment-grid{gap:3px}.equipment-grid span{padding:3px 4px;font-size:14px}.jobs-group .stock-grid{gap:4px}.home-group>div{flex-direction:column;gap:0}.panel-foot{padding:8px 9px;font-size:14px;line-height:1.6}
.records .panel-title{align-items:center;flex-wrap:wrap}.records .panel-title span{font-size:14px}.record-scroll{padding:0 10px}.record-scroll article{padding:10px 0}.record-scroll article>strong{margin:3px 0;line-height:1.6}.record-scroll article p{line-height:1.55}time{font-size:14px}
nav{padding:5px 10px;gap:8px}nav button{padding:7px 16px}.workspace-title{padding:11px 16px}.workspace-title h2{font-size:24px}.work-scroll{padding:0 15px 12px}.production{grid-template-columns:182px minmax(0,1fr);gap:14px}.recipe{padding:10px;margin-bottom:7px}.recipe-detail{padding:17px 20px}.detail-name h2{font-size:25px}.work-actions{padding:10px 15px}.more{margin-top:14px;padding:12px 0}
`;
let html = fs
  .readFileSync(root + 'layout-a.html', 'utf8')
  .replace('</style>', compact + '</style>')
  .replace('汴梁归途布局方案 A', '汴梁归途 · A紧凑版');
html = html.replace('最近50次 · 新 → 旧', '50次 · 新 → 旧');
fs.writeFileSync(root + 'layout-a-compact.html', html);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1536, height: 864 },
  deviceScaleFactor: 1,
});
await page.goto('file://' + root + 'layout-a-compact.html');
const metrics = await page.evaluate(() => {
  const dims = (e) => ({
    width: Math.round(e.getBoundingClientRect().width),
    height: Math.round(e.getBoundingClientRect().height),
  });
  const assets = document.querySelector('.asset-content');
  return {
    viewport: [innerWidth, innerHeight],
    document: [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ],
    work: dims(document.querySelector('.work')),
    assets: dims(document.querySelector('.assets')),
    records: dims(document.querySelector('.records')),
    assetOverflow:
      assets.scrollHeight > assets.clientHeight ||
      assets.scrollWidth > assets.clientWidth,
    hiddenFixedText: [
      ...document.querySelectorAll(
        '.assets b,.assets small,.assets strong,.assets .equipment-grid span,.status div',
      ),
    ]
      .filter((e) => {
        const r = e.getBoundingClientRect(),
          p = e.closest('.assets')?.getBoundingClientRect();
        return (
          e.scrollWidth > e.clientWidth + 2 ||
          (p && (r.bottom > p.bottom || r.right > p.right))
        );
      })
      .map((e) => e.textContent),
  };
});
assert.deepEqual(metrics.document, metrics.viewport);
assert.equal(metrics.assetOverflow, false);
assert.deepEqual(metrics.hiddenFixedText, []);
await page.screenshot({
  path: root + 'layout-a-compact.png',
  animations: 'disabled',
});
fs.writeFileSync(
  root + 'metrics-a-compact.json',
  JSON.stringify(metrics, null, 2),
);
console.log(metrics);
await browser.close();

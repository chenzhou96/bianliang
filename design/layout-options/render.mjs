import fs from 'node:fs';
import { chromium } from 'playwright-core';
const root = new URL('.', import.meta.url).pathname;
const goods = [
  ['◒', '面粉', '12份', '成本 528文'],
  ['◓', '炊饼', '15个', '今日临期'],
  ['♧', '茶叶', '8份', '成本 1,120文'],
  ['◉', '鸡蛋', '18枚', '第20日到期'],
];
const stock = [
  ['粟米', '20'],
  ['小麦', '16'],
  ['面粉', '12'],
  ['盐', '8'],
  ['柴薪', '10'],
  ['原麻', '6'],
  ['麻线', '8'],
  ['生丝', '4'],
  ['丝绸', '2'],
  ['母鸡', '6'],
  ['鸡蛋', '18'],
  ['炊饼', '15'],
  ['咸蛋', '9'],
  ['麻布', '4'],
  ['茶叶', '8'],
  ['酒', '12'],
  ['药材', '5'],
];
const assets = `<section class="panel assets"><div class="panel-title"><b>我的资产</b><span>估值 9,860文</span></div><div class="asset-content"><div class="group goods-group"><h3>货物 <small>17类</small></h3><div class="stock-grid">${stock.map(([n, q]) => `<div><b>${n}</b><strong>${q}</strong></div>`).join('')}</div></div><div class="group jobs-group"><h3>在制品 <small>2项</small></h3><div class="stock-grid"><div><b>清酒 ×12</b><small>20日完工</small></div><div><b>麻布 ×6</b><small>19日完工</small></div></div></div><div class="group equipment-group"><h3>设备 <small>7件</small></h3><div class="equipment-grid">${['石磨 · 闲', '灶台 · 闲', '腌缸 · 闲', '纺车 · 闲', '织机 · 忙', '酿缸 · 忙', '鸡舍 · 用'].map((n) => `<span>${n}</span>`).join('')}</div></div><div class="group home-group"><h3>房产</h3><div><b>临河小院</b><small>租赁 · 24日续租</small></div></div></div><div class="panel-foot">现金8,420文 · 冻结保证金360文</div></section>`;

const logs = [
  [
    '刚刚',
    '生产完成',
    '炊饼 +15　面粉 −6　体力 −18',
    '三炉炊饼出笼，原料成本264文，食品经验 +3。',
  ],
  [
    '片刻前',
    '采购完成',
    '面粉 +6　现金 −264文　体力 −6',
    '按当前市场报价补齐原料，货物已放入仓库。',
  ],
  [
    '第18日',
    '休息完成',
    '体力 +25 → 100',
    '在廊下歇息片刻，恢复25点体力；今日休息次数已用完。',
  ],
  [
    '第18日',
    '订单已接取',
    '保证金冻结 360文',
    '孙娘托你供应20个炊饼，第21日白天截止。成功退还保证金；违约损失360文、关系−2。',
  ],
  [
    '第17日',
    '夜间结算',
    '现金 −54文　健康 +2　体力 +60',
    '在临河小院吃过晚饭。已喂养全部母鸡，清酒继续酿造。',
  ],
  [
    '第17日',
    '货物售出',
    '鸡蛋 −12　实收 216文　毛利 +72文',
    '售出成本144文。货款已入账，搬运消耗12点体力。',
  ],
];
const records = `<section class="panel records"><div class="panel-title"><b>完整记录</b><span>最近50次 · 新 → 旧</span></div><div class="record-scroll scroll">${logs.map(([t, n, d, body]) => `<article><div><b>${n}</b><time>${t}</time></div><strong>${d}</strong><p>${body}</p></article>`).join('')}</div></section>`;
const work = `<section class="panel work"><nav><button>市场</button><button class="active">生产</button><button>订单 <em>2</em></button><button>人物</button><button>情报</button><button>住宅</button><button>账本</button></nav><div class="workspace-title"><h2>作坊</h2><span>选配方 → 补齐原料 → 开工</span><button class="light">今日要事 3</button></div><div class="work-scroll scroll"><div class="production"><div class="recipes"><h3>配方清单</h3>${[
  ['炊饼', '即时出炉 · 食品', '◓'],
  ['磨面粉', '即时加工 · 食品', '◒'],
  ['腌咸蛋', '需要2夜 · 食品', '◉'],
  ['清酒', '需要3夜 · 酿造', '▱'],
  ['纺麻线', '即时加工 · 纺织', '〰'],
  ['织麻布', '需要1夜 · 纺织', '▦'],
]
  .map(
    ([n, d, i], j) =>
      `<button class="recipe ${!j ? 'chosen' : ''}"><i>${i}</i><span><b>${n}</b><small>${d}</small></span></button>`,
  )
  .join(
    '',
  )}</div><div class="recipe-detail"><div class="detail-name"><i>◓</i><div><h2>炊饼</h2><p>一份热食，也是一门小生意。</p></div></div><div class="chips"><span>灶台空闲</span><span>食品 · 入门</span><span>即时完工</span></div><div class="quantity"><b>加工批量</b><input value="3" readonly/><button class="light">1</button><button class="light">5</button><button class="light">最多</button></div><div class="materials"><div><span>所需原料</span><span>已有 / 需要</span><span>缺少</span></div><div><b>◒ 面粉</b><b>12 / 6份</b><b class="green">无需补料</b></div></div><div class="estimate"><p><span>预计产出</span><strong>炊饼 ×15</strong></p><p><span>体力 / 用时</span><strong>18体力 / 即时</strong></p><p><span>按库存成本计算毛利</span><strong class="green">+111文</strong></p><p><span>按现价补料后毛利</span><strong>+111文</strong></p><small>毛利不含生活和住房等费用。成品今夜到期。</small></div><div class="tip">订单备货：已接20个炊饼，交付前请保留所需数量。</div></div></div><div class="more"><h3>设备与排产</h3><p>酿缸正在制作清酒，第20日完工。安排新的订单前，请留意设备占用。</p></div></div><div class="work-actions"><span>本次：18体力　面粉6份</span><button class="light">补齐原料</button><button>开工 · 3批</button></div></section>`;
const top = `<header><div><b class="seal">宋</b><h1>汴梁归途</h1><span>长期经营手记</span></div><aside><span>已保存</span><button class="light">设置</button><button class="light">导出存档</button></aside></header><section class="status"><div><small>第18日 · 晴</small><strong>白昼经营</strong></div><div><small>现金 / 归航目标</small><strong>8,420 / 30,000文</strong><progress value="28" max="100"></progress></div><div><small>健康 92 / 100</small><progress value="92" max="100"></progress><small>体力 76 / 100</small><progress value="76" max="100"></progress></div><div><small>仓储（含在制预留）</small><strong>181 / 240</strong><span>现货163 · 在制预留18</span></div><div><small>当前状态</small><strong>平稳 · 无异常</strong></div><button>收工，安排今晚 →</button></section>`;
const css = `*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font:14px/1.5 "PingFang SC","Microsoft YaHei",sans-serif;color:#243c3e;background:#eaf0e9;padding:14px 20px 18px}button,input{font:inherit}button{border:1px solid #315f60;background:#315f60;color:white;padding:8px 13px;border-radius:5px;white-space:nowrap}button.light{background:#fafbf7;color:#315f60;border-color:#aabeb5}header{height:46px;display:flex;align-items:center;justify-content:space-between}header>div,header aside{display:flex;align-items:center;gap:14px}header span{color:#657b78}h1,h2,h3,p{margin:0}h1{font:26px "Songti SC",serif}h2{font:24px "Songti SC",serif}h3{font-size:15px}.seal{background:#a65a45;color:white;padding:2px 9px;font:25px "Songti SC",serif}.status{height:98px;display:grid;grid-template-columns:.75fr 1.15fr 1fr 1fr 1fr auto;gap:22px;align-items:center;border-top:1px solid #c8d6ce;border-bottom:1px solid #c8d6ce;margin:8px 0 12px}.status>div{height:68px;border-right:1px solid #c8d6ce;padding-right:16px;display:flex;flex-direction:column;justify-content:center}.status strong{font-size:17px}.status small,.status span{color:#566e6a;font-size:14px}progress{height:5px;width:100%;margin:4px 0;accent-color:#74916d}main{height:calc(100% - 164px);display:grid;gap:12px;min-height:0}.panel{background:#fbfaf5;border:1px solid #c5d4cb;border-radius:7px;min-width:0;min-height:0;overflow:hidden}.assets,.records{display:flex;flex-direction:column}.panel-title{padding:14px 14px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d5dfd7;gap:10px}.panel-title b{font:20px "Songti SC",serif}.panel-title span{font-size:14px;color:#687b72}.scroll{overflow-y:scroll;overflow-x:hidden;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#9bb0a2 #eef1e9}.scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-track{background:#edf0e7}.scroll::-webkit-scrollbar-thumb{background:#9cb2a2;border:2px solid #edf0e7;border-radius:8px}.asset-scroll{flex:1;padding:0 12px}.group{padding:11px 0;border-bottom:1px solid #dae2db}.group h3{display:flex;justify-content:space-between;color:#315c51;margin-bottom:6px}.group h3 small{font-weight:400;color:#6a7e75;font-size:14px}.asset-row{display:flex;gap:9px;align-items:center;padding:6px 0}.asset-row>div{flex:1;min-width:0}.asset-row b{font-weight:500}.asset-row small{display:block;font-size:14px;color:#6b7e73}.asset-row strong{font-size:14px;font-weight:500;white-space:nowrap}i{font-style:normal;background:#eee4c9;color:#8b704a;border-radius:50%;width:29px;height:29px;display:inline-flex;justify-content:center;align-items:center;font-size:23px;flex-shrink:0}.panel-foot{padding:10px 12px;color:#60766b;background:#f0f3eb;font-size:14px}.record-scroll{padding:0 15px;flex:1}article{padding:14px 0;border-bottom:1px solid #d5dfd7}article>div{display:flex;justify-content:space-between;gap:9px}time{color:#76867d;font-size:14px}article>strong{display:block;font-weight:500;color:#3e7865;margin:5px 0}article p{font-size:14px;color:#516961;line-height:1.65}.work{display:flex;flex-direction:column}nav{display:flex;gap:3px;padding:8px 10px;border-bottom:1px solid #d5dfd7;flex-shrink:0}nav button{border:0;background:none;color:#5b736b;padding:9px 12px}.active{background:#dfece1!important;color:#255845!important;font-weight:600}em{font-style:normal;background:#d2ded0;padding:0 5px;border-radius:4px}.workspace-title{display:flex;align-items:center;gap:16px;padding:14px 18px;flex-shrink:0}.workspace-title>span{flex:1;color:#768579}.work-scroll{flex:1;padding:0 15px 16px}.production{display:grid;grid-template-columns:190px minmax(0,1fr);gap:18px}.recipes h3{padding:5px 0 8px;color:#5b7466}.recipe{background:#f7f8f1;color:#29453a;border:1px solid #d3dfd1;width:100%;display:flex;text-align:left;align-items:center;gap:12px;margin:0 0 9px;padding:11px}.recipe span{display:flex;flex-direction:column}.recipe small{font-size:14px;color:#6a7c70}.recipe.chosen{background:#e6eee1;border-left:3px solid #477b64}.recipe-detail{background:#f1f4eb;border:1px solid #d0dcce;border-radius:5px;padding:17px;min-width:0}.detail-name{display:flex;align-items:center;gap:14px}.detail-name i{width:46px;height:46px;font-size:34px}.detail-name p{font-size:14px;color:#6f8071;margin-top:4px}.chips{display:flex;gap:8px;margin:14px 0}.chips span{background:#e4ecdc;border:1px solid #d0ddc8;color:#657653;padding:2px 7px;border-radius:4px;font-size:14px}.quantity{display:flex;gap:7px;align-items:center;margin-bottom:16px}.quantity b{flex:1}.quantity input{width:50px;background:#fff;border:1px solid #adc0ad;padding:7px}.quantity button{padding:6px 9px}.materials>div{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #d2decf}.materials>div:first-child{color:#6f8071;font-size:14px}.estimate{margin-top:10px}.estimate p{display:flex;justify-content:space-between;margin:7px 0;gap:10px}.estimate strong{font-weight:500}.green{color:#387452}.estimate small{display:block;font-size:14px;color:#70816c;margin:12px 0}.tip{border-left:3px solid #b3985c;background:#f0ead6;padding:9px 11px;color:#756649;font-size:14px}.more{border-top:1px solid #d2decf;margin-top:17px;padding:14px 0;color:#62796a}.more p{margin-top:8px}.work-actions{border-top:1px solid #d2decf;padding:12px 15px;display:flex;gap:10px;align-items:center;background:#f7f8f0;flex-shrink:0}.work-actions span{flex:1;color:#637668}.a main{grid-template-columns:274px minmax(0,1fr) 320px}.b main{grid-template-columns:290px minmax(0,1fr);grid-template-rows:minmax(0,1fr) 222px}.b .assets{grid-row:1}.b .work{grid-row:1}.b .records{grid-column:1/-1;grid-row:2}.b .record-scroll article{display:grid;grid-template-columns:200px 375px 1fr;gap:18px;align-items:start;padding:12px 0}.b .record-scroll article>strong{margin:0}.b .record-scroll article>div{display:block}.b time{margin-left:12px}.b .assets .asset-row{padding:4px 0}.c main{grid-template-columns:minmax(0,1fr) 430px;grid-template-rows:1fr 1fr}.c .work{grid-column:1;grid-row:1/3}.c .assets{grid-column:2;grid-row:1}.c .records{grid-column:2;grid-row:2}.c .asset-scroll{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;align-content:start}.c .asset-row strong{font-size:14px}.c .asset-row small{font-size:14px}.c .assets .group:first-child{grid-row:1/3}.c .group h3{display:block}.c .group h3 small{margin-left:7px}.c .assets .panel-foot{font-size:14px}.c .production{grid-template-columns:220px minmax(0,1fr)}`;
const finalCss = `
.asset-content{flex:1;min-height:0;padding:2px 12px;overflow:visible}.assets .group{padding:8px 0}.assets .group h3{margin:0 0 7px;font-size:15px}.stock-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.stock-grid>div{display:flex;justify-content:space-between;align-items:center;gap:3px;padding:5px 6px;background:#eef2e7;border-radius:4px;font-size:14px}.stock-grid b{font-weight:500}.stock-grid strong{font-weight:600;color:#526c48}.jobs-group .stock-grid{grid-template-columns:1fr 1fr}.jobs-group .stock-grid>div{flex-direction:column;align-items:flex-start;gap:0}.stock-grid small{font-size:14px;color:#6b7d70}.equipment-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.equipment-grid span{background:#f0f2e9;padding:3px 6px;font-size:14px}.home-group>div{display:flex;justify-content:space-between;gap:6px}.home-group small{font-size:14px;color:#6b7d70}.a main{grid-template-columns:310px minmax(0,1fr) 320px}.b main{grid-template-columns:minmax(0,1fr) 340px;grid-template-rows:200px minmax(0,1fr)}.b .assets{grid-row:1;grid-column:1/-1}.b .asset-content{display:grid;grid-template-columns:2.6fr 1.05fr 1.1fr 1fr;gap:20px;padding:2px 16px}.b .assets .group{border-bottom:0;border-right:1px solid #d5dfd7;padding-right:16px}.b .goods-group .stock-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}.b .stock-grid>div{padding:3px 5px}.b .assets .panel-title{padding:8px 16px}.b .assets .panel-foot{display:none}.b .home-group>div{flex-direction:column}.b .work{grid-row:2;grid-column:1}.b .records{grid-row:2;grid-column:2}.b .record-scroll article{display:block;padding:14px 0}.b .record-scroll article>div{display:flex}.b .record-scroll article>strong{margin:5px 0}.c main{grid-template-columns:minmax(0,1fr) 500px;grid-template-rows:388px minmax(0,1fr)}.c .asset-content{display:grid;grid-template-columns:1.15fr 1fr;gap:0 12px}.c .goods-group{grid-column:1;grid-row:1/4}.c .jobs-group{grid-column:2;grid-row:1}.c .equipment-group{grid-column:2;grid-row:2}.c .home-group{grid-column:2;grid-row:3}.c .assets .group{padding:6px 0}.c .group h3{font-size:14px}.c .stock-grid{gap:5px}.c .stock-grid>div{padding:4px 5px}.c .goods-group .stock-grid>div{flex-direction:column;gap:0;align-items:flex-start}.c .equipment-grid span{padding:2px 4px}.c .home-group>div{flex-direction:column;gap:0}.c .assets .panel-foot{padding:8px 12px}
`;
const compactCss = `.assets .group{padding:5px 0}.stock-grid{gap:4px}.stock-grid>div{padding:3px 6px}.equipment-grid{gap:4px}.equipment-grid span{padding:2px 6px}.b main{grid-template-rows:216px minmax(0,1fr)}.c .assets .group{padding:4px 0}.c .goods-group .stock-grid>div{flex-direction:row;align-items:center;padding:3px 4px}.c .stock-grid{gap:4px}.c .panel-title{padding-top:10px;padding-bottom:10px}.c .assets .panel-foot{padding:6px 12px}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const key of ['a', 'b', 'c']) {
  const html = `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>汴梁归途布局方案 ${key.toUpperCase()}</title><style>${css}${finalCss}${compactCss}.c .assets .panel-foot{display:none}.scroll{scrollbar-width:auto}.scroll::-webkit-scrollbar{-webkit-appearance:none;width:9px}</style><body class="${key}">${top}<main>${key === 'a' ? assets + work + records : key === 'b' ? assets + work + records : work + assets + records}</main></body></html>`;
  fs.writeFileSync(root + `layout-${key}.html`, html);
  const page = await browser.newPage({
    viewport: { width: 1536, height: 864 },
    deviceScaleFactor: 1,
  });
  await page.goto('file://' + root + `layout-${key}.html`);
  await page.screenshot({
    path: root + `layout-${key}.png`,
    animations: 'disabled',
  });
  results.push(
    await page.evaluate(() => ({
      page: document.body.className,
      viewport: [innerWidth, innerHeight],
      document: [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ],
      fixedAssetOverflow:
        document.querySelector('.asset-content').scrollHeight >
        document.querySelector('.asset-content').clientHeight,
      scrollRegions: [...document.querySelectorAll('.scroll')].map((e) => ({
        name: e.className,
        visibleHeight: e.clientHeight,
        contentHeight: e.scrollHeight,
      })),
    })),
  );
  await page.close();
}
await browser.close();
fs.writeFileSync(root + 'metrics.json', JSON.stringify(results, null, 2));
console.log(results);

import { chromium } from '/Users/zhouchen/Documents/CS_project/bianliang/node_modules/playwright-core/index.mjs';
import {writeFileSync} from 'node:fs';
const out='/tmp/bianliang-audit-20260909';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173');
await page.getByRole('button',{name:'走进汴梁 · 3000文',exact:true}).click();
const rows=[];
for(const [width,height] of [[1536,864],[1920,900],[1920,1080],[390,844]]){
 await page.setViewportSize({width,height});
 for(const tab of ['市场','生产','住宅','人物','情报','账本']){
  await page.getByRole('button',{name:tab,exact:true}).click();await page.evaluate(()=>scrollTo(0,0));
  rows.push({width,height,tab,...await page.evaluate(()=>({pageHeight:document.documentElement.scrollHeight,pageWidth:document.documentElement.scrollWidth,bottom:document.querySelector('.bottom-bar').getBoundingClientRect().bottom,internalScroll:[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>e.className)}))});
  if(width===1536||width===390&&tab==='市场')await page.screenshot({path:`${out}/${width}-${tab}.png`});
 }
}
await page.setViewportSize({width:1536,height:864});
await page.getByRole('button',{name:'情报',exact:true}).click();await page.getByRole('button',{name:'茶馆听消息 · 8文',exact:true}).click();
const intel=await page.locator('.intel-list').innerText();await page.screenshot({path:`${out}/intel.png`});
await page.reload(); const oldSave=await page.evaluate(()=>localStorage.getItem('bianliang-save-v2'));
await page.getByRole('button',{name:'挑战三万文',exact:true}).click();
const overwrite={modalCount:await page.locator('.modal').count(),oldSaveChanged:oldSave!==await page.evaluate(()=>localStorage.getItem('bianliang-save-v2')),target:await page.evaluate(()=>JSON.parse(localStorage.getItem('bianliang-save-v2')).target)};
writeFileSync(`${out}/result.json`,JSON.stringify({rows,intel,overwrite,errors},null,2));console.log(JSON.stringify({rows,intel,overwrite,errors},null,2));
await browser.close();

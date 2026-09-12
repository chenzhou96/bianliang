# 连续时间更新逐项核对

依据 `CONTINUOUS_TIME_PLAN.md` 的执行清单。编号为“章节.该章第几个验收项”，不改变原范围。规则核对结合实际实现与回归；界面核对使用真实 Chrome。此表不以测试数量代替规则审查。正式经济v9、112项规则测试及最新完整浏览器验证全部通过，最终结果已写入TEST_REPORT。

## 时钟与城市

| 项 | 实现与证据 | 结论 |
| --- | --- | --- |
| 1.1 | `time.ts` 从绝对分钟派生日期、生活周期、时段及传统时辰；`time.test.ts` 午夜/06点边界 | 通过 |
| 1.2 | `dayPeriod` 五段边界；`time.test.ts` 359/360及08、18、20、22点；连续浏览器跨夜配色 | 通过 |
| 1.3 | `OPENING_HOURS` 与 `actionTiming` 场所映射；购置和已有资产拆装分开；闭店完成及晚一分钟回归 | 通过 |
| 1.4 | `action-time.ts` 全Action映射；`home-trade.test.ts` 三种遭遇劳动120/240分钟，拒绝15分钟；无行动点字段 | 通过 |
| 1.5 | 引擎休息/劳动无次数拒绝，学习/治疗/加餐保留周期检查；engine与continuous-engine回归 | 通过 |
| 1.6 | `wait` 上限1440且无恢复；`sleep/wait` 不调用遭遇触发；browser-continuous实际等待与睡眠 | 通过 |
| 1.7 | 共用actionPreview：开始/完成、营业/下次办理、费用、困倦、房费/腐坏/契约风险；preview-time与commerce精确截止回归 | 通过 |
| 1.8 | dispatch预检、复制、预留、推进、释放、完成；settlement-v3死亡释放、运输腐坏和失败原子性；preview-time不同随机数同一公开预览 | 通过 |

## 生活与睡眠

| 项 | 实现与证据 | 结论 |
| --- | --- | --- |
| 2.1 | rest60分钟、20体力受上限限制，不清困倦；continuous-engine重复休息回归 | 通过 |
| 2.2 | LifeControls默认8小时、自选、下一07点；非法11小时禁用；browser-ux与continuous跨夜实际交互 | 通过 |
| 2.3 | projectTime清醒+1/120、睡眠−1/30每分钟，上限12；staminaCap每小时−3且至少30；time回归 | 通过 |
| 2.4 | exertionMultiplier连续清醒18小时开始增加、最多额外1；满240分钟睡眠才重置；time回归 | 通过 |
| 2.5 | 22—06体力倍率、02—06每小时1至5健康、清醒24小时额外2；分钟中点积分；time回归 | 通过 |
| 2.6 | 分段与连续投影相同，睡眠无清醒惩罚，22—08恢复1其余0.8；time与status-time回归 | 通过 |
| 2.7 | advanceGameTime累计恢复，卧房仅有效居家+15%；home-trade/continuous-engine外宿对照 | 通过 |
| 2.8 | lifeCycle、ateCycle及eat/host，18点提示，06点健康优先扣8；settlement-v3未用餐致死优先级回归 | 通过 |
| 2.9 | feedHens稳定顺序、fed去重；05:30仅用现有粟米、不足提示；06点产蛋/三周期饥饿死亡；continuous-engine与engine养殖账目回归 | 通过 |
| 2.10 | 恢复行动无体力门槛、街头免费；engine零现金睡眠与settlement-v3健康归零停止回归 | 通过 |

## 商人路线

| 项 | 实现与证据 | 结论 |
| --- | --- | --- |
| 3.1 | Market/PriceChart：关注持仓、14日曲线和文字、成本及运费口径、可售余量、临期和已知情报；主浏览器满列表/行情历史与commerce回归 | 通过 |
| 3.2 | transportQuote与actionTiming：重量、固定10分钟、三种费率、货房减时；time/home-trade实成交与闭店回归 | 通过 |
| 3.3 | 推车独立home.cart不占位；采购运费入库存、销售/交付入成本；分单报价及实际账目回归 | 通过 |
| 3.4 | makeWorlds四类结果、持续2—5日；情报逐步调查和事后回看；content-review100日、webmcp隐藏结果回归 | 通过 |
| 3.5 | generateOpportunities每06点2条，supplyRequest分批限量；market-opportunities生成/分批/超额原子回归 | 通过 |
| 3.6 | 最多1日盘2夜盘，折扣与240文夜盘上限，回售/收购套利约束；60种子货盘边界与读档不重刷回归 | 通过 |
| 3.7 | 关系3预告、6单条预留至次日12、10大宗及六客户第四段故事；满级待客封顶10，严格回读；机会/客户/待客回归 | 通过 |
| 3.8 | 六个条件及TRADE_REWARDS；真实货盘首次授予、读档后不重复、五日盈利平账重置回归；四尺寸展开六件纪念物 | 通过 |

## 住宅与内容

| 项 | 实现与证据 | 结论 |
| --- | --- | --- |
| 4.1 | FACILITIES价格/唯一性与usedHomeSlots共享计数，hasFacility有效性；home-trade与save-validation回归 | 通过 |
| 4.2 | remove/install/sell保留资产、60%回款；chilledBatches优先级/临期排序、200内部单位保护、拆分成本守恒；home-trade回归 | 通过 |
| 4.3 | endLease/欠租封存，欠维护暂停，库存原样保留，新增容量检查；engine与settlement-v3同刻停产回归 | 通过 |
| 4.4 | host60分钟20文记social，必须已结识/新剧情，会客间有效且在营业内，含主餐；home-trade回归 | 通过 |
| 4.5 | HOME_STORIES六客户各两段，HOME_EVENTS三条居家三条商人事件；次数/时刻记录防重复；内容源及host/事件触发路径核对 | 通过 |
| 4.6 | settleDawn收费，paidThrough绝对时刻，maintain避免当周期重复；engine欠费及continuous-engine睡眠扣费回归，通关房费日期断言 | 通过 |
| 4.7 | 客栈开睡30文、最多600分钟，外宿仍经过房费；免费床位风险按分钟；settlement-v3短睡分割与continuous-engine外宿回归 | 通过 |

## 结算、存档、公开接口

| 项 | 实现与证据 | 结论 |
| --- | --- | --- |
| 5.1 | clock、lifeCycle、timeline、deadlineAt、remainingMinutes、status及intel冷却绝对分钟；time/status/intel/production/commerce边界回归 | 通过 |
| 5.2 | recipe.duration×1440，设备失效不减remainingMinutes，零时自动入库；production-time及七配方全流程回归 | 通过 |
| 5.3 | 健康→腐坏→住房→生产产蛋→行情→完成→截止；timeline序列、欠租同刻停产、未用餐同刻致死、精确交货回归 | 通过 |
| 5.4 | Phase仅day/ended、工作区独立UI状态，新Action与公开工具对应；旧夜间动作明确拒绝；continuous-engine/webmcp回归 | 通过 |
| 5.5 | Do与WebMCP调用同一actionPreview/dispatch；publicState筛选已知；随机报酬与失窃金额不预告；webmcp及preview-time40随机数对照 | 通过 |
| 5.6 | v3独立键，readSave严格版本/数值/引用/唯一性；旧版本不迁移、不覆盖；settlement/feedback及主浏览器损坏存档和旧键保留 | 通过 |

## 界面与最终验证

| 项 | 实现与证据 | 结论 |
| --- | --- | --- |
| 6.1 | 顶栏常驻时钟/身体/困倦，data-period柔和配色，四尺寸截图及跨21:30→22:00→06:00 | 通过 |
| 6.2 | 单一工作区导航，住宅生活/设施，人物饮食休息治疗，闭店仍可浏览；主浏览器与连续浏览器 | 通过 |
| 6.3 | todayTasks按at排序、17/22/02提示，反馈实际变化及startedAt/finishedAt实际用时，wakeSummary可折叠；today-time、feedback与浏览器期限/睡醒/耗时检查 | 通过 |
| 6.4 | 主浏览器101项、commerce33项、continuous44组；三桌面无整页溢出、390×844无横向溢出，手机顶部两列及小数值已实测；键盘/中文输入/长内容/禁用与错误反馈 | 通过 |
| 7.1 | 最新112项全量规则/接口回归通过，含各专用模块和千日保存/账目，结合以上规则逐项审查 | 通过 |
| 7.2 | v9正式210局六门槛通过；版本、样本、分组和新增费用/等待/动作明细已核对，正式进程退出0 | 通过 |
| 7.3 | 五个真实Chrome脚本完整连跑通过；含36日309步归航、8次便捷输入点击、四尺寸最长内容及异常状态；六客户第四段实际拜访、回读与重复禁用；已查看风险弹窗与手机长图 | 通过 |
| 7.4 | 最新typecheck/lint/test/build/content/browser及正式simulate退出0；TEST_REPORT记录真实最终结果；生成证据受.gitignore忽略 | 通过 |

## 证据位置与解释边界

最新规则/构建/内容/浏览器日志分别为 `/tmp/bianliang-final-record-tests.log`、`/tmp/bianliang-final-record-build.log`、`/tmp/bianliang-final-record-content.log`、`/tmp/bianliang-final-verified-browser.log`。浏览器结构化结果与截图在 `tests/browser-output/`。正式经济保留分版本文件，最新为 `tests/browser-output/economy/continuous-v9.json`。

模拟只证明所列策略及固定样本门槛，不证明所有任意策略等速成长。纪念物是永久叙事奖励，无可兑换货币。推车无出售动作，模拟清算价值为0；可出售设备/设施按60%、产权房按72%，库存按当前卖价，冻结保证金仍计为资产。无贷款系统。旧版兼容要求已按用户本次指示取消。

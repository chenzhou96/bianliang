# 项目文档索引

当前版本：v4连续时间经营，已接入统一牌价与行情干预（存档修订6）。先读根目录 [玩法与开发说明](../README.md)，验证结论以 [最新验收报告](../TEST_REPORT.md) 为准。

## 分发与宣传

- [离线分发构建](distribution/README.md)与[玩家说明](distribution/PLAYER_GUIDE.txt)。
- [宣传海报与原始提示词](../design/promotion/README.md)。

## 当前设计与实现

- [统一牌价与主动影响行情](plans/MARKET_CONTROL_PLAN.md)：合法/违法手段、罚款拘押、茶商分支故事及验证入口。

- [茶馆情报、意外事件与分支任务线](plans/TEAHOUSE_INTELLIGENCE_PLAN.md)：强制现场弹窗、六条分支故事、实际经营效果及验收清单。

- [美术工作台与单层导航](plans/FLAT_WORKBENCH_PLAN.md)：封面铺满、紧凑详情、同页分区与图标说明；保留工作台总体设计，后续菜单、操作分组与账本优化以最新验收报告为准。

- [美术版界面实施](plans/ART_INTERFACE_PLAN.md)：场景、商品、设备、住宅状态与布局验收。
- [美术素材库](../design/art-assets/README.md)：35 张原图、预览、提示词与网页派生清单。

- [时间与日常经营体验更新方案](plans/TIME_EXPERIENCE_UPDATE_PLAN.md)：v4疲劳、营业收尾、收工与目标等待及验收标准。

- [连续时间与商人生活计划](plans/CONTINUOUS_TIME_PLAN.md)：v3设计及当时验收清单；时间规则以v4方案为准。
- [连续时间逐项核对](reports/CONTINUOUS_TIME_AUDIT.md)：v3规则、住宅、贸易与公开接口的历史实现证据。
- [首日沉浸体验更新](reports/IMMERSIVE_UX_UPDATE.md)：街巷招工、时辰表、住宅分组、跨日文案与按钮对齐。

## 历史归档

- [行情更新前验收记录](archive/TEST_REPORT_PRE_MARKET_CONTROL.md)：此前茶馆、账本、界面与项目整理记录。
- [2026-09-09初始审查](archive/initial-audit-2026-09-09/REVIEW.md)：早期版本缺陷快照，附当时的复现脚本，不代表当前状态。

- [细节优化前验收记录](archive/TEST_REPORT_PRE_DETAIL_REFINEMENTS.md)：工作台、初版美术与v4时间系统的原始验收结论。

- [时间体验更新前验收报告](archive/TEST_REPORT_PRE_TIME_EXPERIENCE.md)：v3与首日体验的原始验证记录。

以下保留设计演进和当时的验证结果，其中旧规则、旧测试数量及“待完成”记录不代表当前状态。

- [早期长期经营计划](archive/EXPANSION_PLAN.md)
- [早期可玩性与紧凑布局计划](archive/PLAYABILITY_UX_UPDATE_PLAN.md)
- [早期体验实施记录](archive/UX_UPDATE_PROGRESS.md)
- [连续时间实施过程](archive/CONTINUOUS_TIME_IMPLEMENTATION_LOG.md)
- [连续时间更新前的测试报告](archive/TEST_REPORT_PRE_CONTINUOUS.md)

根目录保留README、开发约定与最新测试报告。新的设计放入 `plans/`，专项核对放入 `reports/`，已被后续版本替代的记录放入 `archive/`。不要把临时日志、截图和模拟输出复制进文档目录；可在报告中记录生成位置与复现方式。

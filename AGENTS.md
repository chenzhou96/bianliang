# Repository Guidelines

## 项目偏好与产品原则

后续会话先遵循本节，再查看 `README.md` 与 `TEST_REPORT.md`。用户新决定优先于本文；历史方案只作背景，不把已删除的功能重新加回。以下是截至2026-09-13确认的约定。

- **整体完成**：已明确的需求直接推进，联动规则、界面、存档、公开接口与必要验证；不要只给建议或反复确认已授权的步骤。
- **宋风纸本与淡彩**：保持清晰、轻快、低饱和的视觉；美术服务于辨识与阅读。商品轮廓应容易区分，不能出现炊饼像鸡蛋的情况。按钮、菜单、选择器和说明入口保持统一风格。
- **信息只留一个主要入口**：时辰表与今日要事保留弹窗，流水明细留在完整记录。腾出的空间用于场景美术或能帮助决策的汇总，不用另一份文字列表填满。
- **经营概览解释经营结果**：每日现金收支与已售商品毛利分开；采购、资产投入、库存耗用、保证金及回收不得混为盈亏。图表基于实际结算记录，不从截断日志推算或编造历史。
- **连续时间与明确取舍**：白天、夜晚保持同一经营界面，不另设夜间页面。删除被其他选择完全替代的操作，例如“等到08:00”；保留有明确用途的等待、休息和睡眠。
- **生活与价格有合理层次**：主餐应体现食材搭配、库存成本、价格和健康收益的区别；蛋类不能简单等同一份主食，外食便利应有代价。具体数值以共享配置为准，不在界面另写一套规则。
- **整齐而紧凑的工作区**：导航连续、等宽，当前页标识明确；输入与所属操作归组，主要按钮和说明按固定网格对齐。桌面资产与记录常驻，长内容在区域内滚动；手机按阅读顺序排列。
- **当前界面约定**：时辰状态行放最底部，删除旧底部快捷按钮。顶部工具区只保留“导出备份”和“重新开始”，不恢复手动减少动态开关或旧版导出入口；继续尊重系统减少动态设置。
- **尚未发布，只支持当前存档**：不做旧存档迁移、修复前备份或旧版导出。改变存档结构时明确格式边界及是否需要重新开始，不静默补造缺失数据。
- **实际结果与真实验证**：操作反馈要显示真实变化，切换页面不丢失最近结果；公开接口只给玩家已知信息。界面改动要检查真实浏览器中的满列表、缺料禁用、展开详情与手机状态，不能只验空白页面或仅凭测试数量宣布完成。
- **可持续交付**：源码、测试、美术原图、网页资源、提示词与素材清单一起维护。旧文档归档并更新索引；截图、模拟输出、缓存与构建产物留本地且加入忽略规则。提交前检查清单与工作区状态；区分本地提交与远端推送，按用户授权执行。

## Project Structure & Module Organization

《汴梁归途》 uses React, TypeScript, and Vinext/Vite.

- `app/`: page composition, layout, and global styles.
- `lib/game/`: shared game logic. `types.ts` defines state/actions; `config.ts` defines rules; `content.ts` holds encounters/intelligence; `engine.ts` handles actions, settlement, and saves; `webmcp.ts` exposes player-facing tools.
- `components/ui/` and `hooks/`: reusable UI components and hooks; `public/`: static assets.
- `tests/`: rule/interface tests, simulations, content review, and browser flows.
- `scripts/`: local serving and build helpers.
- `docs/README.md`: documentation index; `docs/plans/`: current design; `docs/reports/`: feature audits; `docs/archive/`: historical records. `TEST_REPORT.md` holds current validation results.

## Build, Test, and Development Commands

Use Node.js 22.13+ and install dependencies with `npm ci`.

| Command                       | Purpose                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Start development at `http://127.0.0.1:4173`.                                                |
| `npm run build` / `npm start` | Build production assets / serve the built game locally.                                      |
| `npm run typecheck`           | Check TypeScript without emitting code.                                                      |
| `npm run lint`                | Run Oxlint on app, game, tests, and scripts.                                                 |
| `npm run format`              | Apply Oxfmt formatting.                                                                      |
| `npm test`                    | Run Node rule and WebMCP regression tests.                                                   |
| `npm run simulate`            | Compare seeded strategies and long-term stability.                                           |
| `npm run test:content`        | Generate intelligence-content review samples.                                                |
| `npm run test:browser`        | Run desktop layout and gameplay flows; requires installed Chrome and a running local server. |

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, semicolons, single quotes, and an 80-column formatting target. Follow Oxfmt and Oxlint configuration. Use camelCase for functions/variables, PascalCase for types/components, and UPPER_SNAKE_CASE for rule constants. Preserve explicit `.ts` imports in tests.

## Testing Guidelines

Use `node:test` with `node:assert/strict`; name tests `*.test.ts` with behavioral descriptions. Browser scripts use `playwright-core`. No numeric coverage threshold is configured. Add regressions for changed rules, accounting, save compatibility, and public interfaces. Run typecheck, lint, tests, and build; include simulations for economic changes and browser checks for UI changes. Keep generated reports/screenshots out of commits.

## Commit & Pull Request Guidelines

History mixes Chinese summaries and English `feat:` messages; no uniform prefix exists. Write focused, descriptive commits. PRs should explain behavior changes, link relevant issues or plan items, report checks performed, and include screenshots for UI changes.

## Game Architecture & Persistence

Keep rules in the shared engine and update state types, UI, persistence, and WebMCP together. The continuous-time version uses `bianliang-save-v4`. This unpublished project supports only the current save format: do not add legacy migration, repair backups, or old-save export controls. Expose only player-known information through WebMCP.

# Repository Guidelines

## Project Structure & Module Organization

《汴梁归途》 uses React, TypeScript, and Vinext/Vite.

- `app/`: page composition, layout, and global styles.
- `lib/game/`: shared game logic. `types.ts` defines state/actions; `config.ts` defines rules; `content.ts` holds encounters/intelligence; `engine.ts` handles actions, settlement, and saves; `webmcp.ts` exposes player-facing tools.
- `components/ui/` and `hooks/`: reusable UI components and hooks; `public/`: static assets.
- `tests/`: rule/interface tests, simulations, content review, and browser flows.
- `scripts/`: local serving and build helpers.
- `EXPANSION_PLAN.md`: design scope; `TEST_REPORT.md`: validation results.

## Build, Test, and Development Commands

Use Node.js 22.13+ and install dependencies with `npm ci`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development at `http://127.0.0.1:4173`. |
| `npm run build` / `npm start` | Build production assets / serve the built game locally. |
| `npm run typecheck` | Check TypeScript without emitting code. |
| `npm run lint` | Run Oxlint on app, game, tests, and scripts. |
| `npm run format` | Apply Oxfmt formatting. |
| `npm test` | Run Node rule and WebMCP regression tests. |
| `npm run simulate` | Compare seeded strategies and long-term stability. |
| `npm run test:content` | Generate intelligence-content review samples. |
| `npm run test:browser` | Run desktop layout and gameplay flows; requires installed Chrome and a running local server. |

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, semicolons, single quotes, and an 80-column formatting target. Follow Oxfmt and Oxlint configuration. Use camelCase for functions/variables, PascalCase for types/components, and UPPER_SNAKE_CASE for rule constants. Preserve explicit `.ts` imports in tests.

## Testing Guidelines

Use `node:test` with `node:assert/strict`; name tests `*.test.ts` with behavioral descriptions. Browser scripts use `playwright-core`. No numeric coverage threshold is configured. Add regressions for changed rules, accounting, save compatibility, and public interfaces. Run typecheck, lint, tests, and build; include simulations for economic changes and browser checks for UI changes. Keep generated reports/screenshots out of commits.

## Commit & Pull Request Guidelines

History mixes Chinese summaries and English `feat:` messages; no uniform prefix exists. Write focused, descriptive commits. PRs should explain behavior changes, link relevant issues or plan items, report checks performed, and include screenshots for UI changes.

## Game Architecture & Persistence

Keep rules in the shared engine and update state types, UI, persistence, and WebMCP together. Preserve v1 saves and existing v2 progress; never silently overwrite incompatible saves. Expose only player-known information through WebMCP.

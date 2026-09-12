import { formatMoment } from './time.ts';
import { RECIPES } from './config.ts';
import type { GameState, Good, ProductionJob } from './types.ts';

/** Current completion timestamp, assuming equipment remains available. */
export function productionReadyAt(
  s: GameState,
  job: ProductionJob,
): number | null {
  if (job.status !== 'queued') return s.clock.minute;
  const equipment = s.equipment.find((e) => e.id === job.equipmentId);
  if (!equipment?.installed || s.housing.maintenanceSuspended) return null;
  return s.clock.minute + job.remainingMinutes;
}

/** Lower bound only: materials, stamina recovery, capacity and delivery add time. */
export function productionEarliest(s: GameState, good: Good, required = 1) {
  const recipe = RECIPES.find((r) => r.output === good);
  if (!recipe || !Number.isFinite(required) || required <= 0) return null;
  const equipment = s.equipment.find(
    (e) => e.kind === recipe.equipment && e.installed,
  );
  if (
    !equipment ||
    s.skills[recipe.industry] < recipe.minSkill ||
    s.housing.maintenanceSuspended
  )
    return null;
  const busy = s.jobs.find(
    (j) => j.id === equipment.jobId && j.status === 'queued',
  );
  let at = busy ? productionReadyAt(s, busy) : s.clock.minute;
  if (at === null) return null;
  let missing = required;
  if (busy?.recipeId === recipe.id) missing -= busy.outputUnits / 10;
  const multiplier = s.skills[recipe.industry] >= 3 ? 1.2 : 1;
  const batchLimit = Math.min(
    20,
    Math.floor(
      100 / (recipe.stamina * (s.skills[recipe.industry] >= 2 ? 0.85 : 1)),
    ),
  );
  if (batchLimit < 1) return null;
  while (missing > 0) {
    const count = Math.min(
      batchLimit,
      Math.ceil((missing * 10) / (recipe.outputUnits * multiplier)),
    );
    const produced = Math.floor((recipe.outputUnits * count * multiplier) / 10);
    if (!produced) return null;
    at += 10 + count * 2 + recipe.duration * 1440;
    missing -= produced;
  }
  return at;
}

export function productionCompletionLabel(s: GameState, job: ProductionJob) {
  const at = productionReadyAt(s, job);
  return at === null ? '设备停用 · 暂停' : `${formatMoment(at)}预计完成`;
}

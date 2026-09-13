import type { DailyCash, GameState } from './types.ts';

/** Only settled cash changes count; temporary trade reservations do not. */
export function recordCash(s: GameState, value: number) {
  if (!value) return;
  const rows = s.ledger.dailyCash;
  let row = rows.find((r) => r.day === s.day);
  if (!row) {
    row = { day: s.day, income: 0, expense: 0 };
    rows.push(row);
  }
  if (value > 0) row.income += value;
  else row.expense -= value;
  s.ledger.dailyCash = rows.filter((r) => r.day >= s.day - 6);
}

export function recentCash(s: GameState): DailyCash[] {
  const first = Math.max(s.ledger.sinceDay, s.day - 6);
  return Array.from({ length: s.day - first + 1 }, (_, i) => {
    const day = first + i;
    return (
      s.ledger.dailyCash.find((r) => r.day === day) ?? {
        day,
        income: 0,
        expense: 0,
      }
    );
  });
}

export function validCashHistory(s: GameState) {
  const rows = s.ledger.dailyCash;
  return (
    Array.isArray(rows) &&
    rows.length <= 7 &&
    rows.every(
      (r, i) =>
        r &&
        Number.isSafeInteger(r.day) &&
        r.day >= s.ledger.sinceDay &&
        r.day <= s.day &&
        (i === 0 || r.day > rows[i - 1].day) &&
        [r.income, r.expense].every((n) => Number.isSafeInteger(n) && n >= 0),
    )
  );
}

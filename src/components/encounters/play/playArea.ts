/**
 * Damage all (#1125 frame 11): one amount, taken off every creature that is selected, through the runner's own
 * HP change so temp HP, dying and the rest behave as a single hit would. The selection is what the Area tool filled in
 * from the creatures inside, plus whatever the DM added or dropped by hand, so it is the selection that is hit and
 * not the template. Returns how many creatures were hit.
 */
export function damageAll(ids: Iterable<string>, amount: number, adjustHp: (instanceId: string, delta: number) => unknown): number {
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  const once = new Set(ids);
  for (const id of once) adjustHp(id, -amount);
  return once.size;
}

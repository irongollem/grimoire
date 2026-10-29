/**
 * How long a recipe takes, as every crafting surface writes it: "1 day",
 * "5 days", "30 minutes". The unit agrees with the number. This is the one
 * copy; five surfaces once spelled it out inline, and the DM's recipe sheet
 * dropped the singular ("1 days").
 */
export function craftingTimeText(time: number, unit: "minutes" | "hours" | "days"): string {
  return `${time} ${time === 1 ? unit.slice(0, -1) : unit}`;
}

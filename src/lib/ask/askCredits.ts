/**
 * The price at which an action names its cost on its own button (maintainer, 27 Nov 2026: "if its more than just a few
 * credits we mention it if its like 1 we dont"). Below it the flow says the price once and keeps a running total, so a
 * cheap press does not read as spending. The quote, not a constant, decides: a pricier provider multiplies it.
 */
export const NOTABLE_CREDITS = 3;

/** Whether a quoted price is worth naming on the button that spends it; an unknown price is not shown. */
export function showsPrice(credits: number | null): credits is number {
  return credits !== null && credits >= NOTABLE_CREDITS;
}

/** A credit count in words: "1 credit", "3 credits". */
export function creditsText(count: number): string {
  return `${count} ${count === 1 ? "credit" : "credits"}`;
}

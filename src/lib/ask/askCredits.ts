/** A credit count in words: "1 credit", "3 credits". */
export function creditsText(count: number): string {
  return `${count} ${count === 1 ? "credit" : "credits"}`;
}

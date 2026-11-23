/** A count as a sentence opens with it: "Five quest hooks are ready." Past ten the digits read better. */
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function countWord(count: number): string {
  return WORDS[count] ?? String(count);
}

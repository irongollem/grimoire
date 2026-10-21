/**
 * Its own module, with no imports, because type modules and edge-shared code
 * use it: importing it from `utils` would pull clsx and tailwind-merge in
 * behind a spell level's suffix.
 */

/** "1st", "2nd", "3rd", "11th", "22nd", "113th": an English ordinal for a non-negative integer. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

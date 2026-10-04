/**
 * The one term the Atlas match list is computed against.
 *
 * Description/notes matches come back from the database for the *settled*
 * (debounced) term, while name and tag matching is client-side and could use the
 * live one. Mixing the two shows the previous term's text ids under the new
 * term's name matches, so the whole list is computed against one term.
 *
 * While text search applies (live term long enough and an answer has arrived)
 * that term is the one the answer is for, and the text ids may be used. Below
 * the minimum, or before any answer exists, it is the live term and no text ids
 * apply.
 */
export function chooseMatchTerm(
  liveTerm: string,
  matchedTerm: string | null,
  minLength: number,
): { term: string; useTextMatches: boolean } {
  const live = liveTerm.trim();
  if (live.length >= minLength && matchedTerm !== null) {
    return { term: matchedTerm, useTextMatches: true };
  }
  return { term: live, useTextMatches: false };
}

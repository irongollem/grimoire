/**
 * Whether the level-up asks for a subclass. A subclass is a definition on the
 * class row, so the question is due whenever the class level the character is
 * about to have is AT OR PAST the class's subclass level and the row still has
 * none. "At or past" matters: a table with no subclass for the class yet lets
 * the level-up continue without one, and the character must be asked again the
 * next time rather than never.
 */
export function subclassChoiceDue(
  row: { subclass_name?: string | null } | null,
  classLevelAfter: number,
  subclassLevel: number | null | undefined,
): boolean {
  if (row?.subclass_name) return false;
  if (typeof subclassLevel !== "number") return false;
  return classLevelAfter >= subclassLevel;
}

/**
 * The NPC generator's species roll, kept apart from `peoples.ts` so the roll it calls is that module's export (a test
 * can then fix the roll's outcome).
 */
import { rollPeople, type People } from "./peoples";

/**
 * Who a new person is, for the NPC generator (the page and Ask Grimoire alike): the species the DM named, else one
 * rolled from the world's peoples, once per generation so the prompt and the saved NPC agree. `lines` replace the
 * prompt's race line. A roll that lands on "anyone else" names no species and asks for one the list does not hold; a
 * rolled creature is one of the world's peoples, not an opponent, and the prompt says so. With no peoples listed the
 * species is left to the generator. The `race` column stays free text, so a rolled people's name is what is saved.
 */
export function npcSpecies(picked: string, list: readonly People[], random: () => number = Math.random): { race: string; lines: string[] } {
  if (picked) return { race: picked, lines: [`Race: ${picked}`] };
  if (list.length === 0) return { race: "", lines: [] };
  const rolled = rollPeople(list, random);
  if (rolled) {
    const lines = [`Race: ${rolled.name}`];
    if (rolled.kind === "creature") lines.push(`This person is a ${rolled.name}, one of the world's peoples, not a monster to fight.`);
    return { race: rolled.name, lines };
  }
  const named = list.filter((p) => p.readable).map((p) => p.name);
  return { race: "", lines: named.length === 0 ? [] : [`Race: not one of ${named.join(", ")}; a people this world rarely sees`] };
}

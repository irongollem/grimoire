// What a character has on them, for their own call (#1021).
//
// A character decides its own words and deeds from what it knows, and without this it did not know what was in its
// own pockets: asked for something to tend a wound, it could only offer to look. The list is the character's
// `npc_inventory`, by name and count. The note on a row is left out: it is the DM's own (Sugarwell's "Workshop Keys"
// note says at which beat the Guild hands them over), and a character would say it aloud. It is told to
// the character alone, never to the narrator, so nothing here reaches the player unless the character brings it out.

export interface Belonging {
  name: string;
  quantity: number;
}

/** At most this many things are told; a hoard is summed up by its count. */
export const MAX_BELONGINGS = 30;

/** The paragraph added to a character's profile, or null when they carry nothing on record. */
export function belongingsText(things: readonly Belonging[]): string | null {
  const held = things.filter((t) => t.name.trim() !== "" && t.quantity > 0);
  if (held.length === 0) return null;
  const lines = held.slice(0, MAX_BELONGINGS).map((t) => {
    const count = t.quantity > 1 ? ` (${t.quantity})` : "";
    return `- ${t.name.trim()}${count}`;
  });
  const more = held.length > MAX_BELONGINGS ? `\n- and ${held.length - MAX_BELONGINGS} more things` : "";
  return (
    "What you have on you (you may use, show, give or refuse to give any of it; you have nothing else of note " +
    "unless your description says so, so do not offer what is not here):\n" +
    lines.join("\n") +
    more
  );
}

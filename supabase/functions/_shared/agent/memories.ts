// What the characters in the scene remember of the party (#1021, #1019). Pure: no I/O.
//
// An NPC's memories (`npc_memories`) are what they and the party have told each other. The Narrator is the Dungeon
// Master and may see every one, but a few short lines per character is what it can use in a turn; the rest is the
// Voice Coach's business when that character speaks.

export const MEMORIES_PER_CHARACTER = 3;
export const MEMORIES_MAX = 12;
export const MEMORY_LINE_MAX = 160;

export interface SceneMemory {
  /** Whose it is; the per-character cap counts by this, since two characters may be shown under one name. */
  npcId: string;
  /** The name the character is shown under (the disguise while unrevealed). */
  name: string;
  /** Already free of any true name the character is hiding. */
  body: string;
  /** When it was written, ISO. */
  createdAt: string;
}

function oneLine(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= MEMORY_LINE_MAX ? flat : `${flat.slice(0, MEMORY_LINE_MAX - 1).trimEnd()}…`;
}

/** Newest first, at most three per character and twelve in all; empty (the section is absent) with none. */
export function memoriesSection(memories: readonly SceneMemory[]): string {
  const newestFirst = [...memories].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const taken = new Map<string, number>();
  const lines: string[] = [];
  for (const m of newestFirst) {
    if (lines.length >= MEMORIES_MAX) break;
    const body = oneLine(m.body);
    if (body === "") continue;
    const count = taken.get(m.npcId) ?? 0;
    if (count >= MEMORIES_PER_CHARACTER) continue;
    taken.set(m.npcId, count + 1);
    lines.push(`${m.name} remembers: ${body}`);
  }
  return lines.length === 0 ? "" : `## What they remember\n\n${lines.join("\n")}`;
}

// Rules about the characters the table speaks for and makes up (NPCs and party members), apart from the queries.
import { COMPANIONS_MAX, type Companion } from "../_shared/agent/companions.ts";
import { shownNpcName } from "../_shared/npcProfile.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";

type Row = Record<string, unknown>;

/** Characters found by name and by disguise, each once, shown under the name the party knows them by. */
export function foundCharacters(byName: readonly Row[], byDisguise: readonly Row[]): Array<{ id: string; shownName: string }> {
  const seen = new Map<string, { id: string; shownName: string }>();
  for (const n of [...byName, ...byDisguise]) {
    seen.set(n.id as string, {
      id: n.id as string,
      shownName: shownNpcName({
        name: n.name as string,
        disguise_name: n.disguise_name as string | null,
        is_revealed: n.is_revealed === true,
      }),
    });
  }
  return [...seen.values()];
}

/** Whether a record is one the table made and nobody has edited since: the only kind the table may rewrite. */
export function isUntouchedTableCharacter(provenance: unknown): boolean {
  const p = provenance as { generatorType?: unknown; edited?: unknown } | null | undefined;
  return p?.generatorType === "agent_turn_character" && p.edited === false;
}

/** The columns of a rewrite of a character the table made: the backstory always, the occupation only when one was given. */
export function characterRewrite(intro: { about: string; occupation: string | null }, provenance: AiProvenance): Row {
  return { backstory: intro.about, ...(intro.occupation === null ? {} : { occupation: intro.occupation }), ai_provenance: provenance };
}

/** A new character the narrator made up: placed here when it is here, shown to the player's character only when it knows of them. */
export function characterInsert(
  ctx: { userId: string; campaignId: string; locationId: string | null; memberId: string | null },
  intro: { name: string; occupation: string | null; about: string; here: boolean; known: boolean },
  provenance: AiProvenance,
): Row {
  return {
    user_id: ctx.userId,
    campaign_id: ctx.campaignId,
    name: intro.name,
    occupation: intro.occupation,
    backstory: intro.about,
    location_id: intro.here ? ctx.locationId : null,
    player_visible_to: intro.known && ctx.memberId !== null ? [ctx.memberId] : [],
    ai_provenance: provenance,
  };
}

/** The speaker's profile, with what they carry after it when they carry anything. */
export function profileWithBelongings(profile: string, belongings: string | null): string {
  return belongings === null ? profile : `${profile}\n\n${belongings}`;
}

/** One of a thing leaves the belongings: the row goes when it was the last. */
export function afterUse(quantity: number): { kind: "update"; quantity: number } | { kind: "delete" } {
  const left = quantity - 1;
  return left > 0 ? { kind: "update", quantity: left } : { kind: "delete" };
}

/** A party member's own memories as their call reads them, oldest first; "" when there are none. The rows come newest first. */
export function companionMemoriesText(newestFirst: readonly Row[]): string {
  const memories = [...newestFirst].reverse().map((m) => `- ${m.body as string}`);
  return memories.length === 0 ? "" : `What you remember of this story so far:\n${memories.join("\n")}`;
}

/** The party members who join the played one's table: everyone but them, in order, no more than `COMPANIONS_MAX`. */
export function companionRows(rows: readonly Row[], playedId: string | null): Row[] {
  return rows.filter((row) => row.id !== playedId).slice(0, COMPANIONS_MAX);
}

export function asCompanion<T extends object>(member: T, row: Row): T & Pick<Companion, "aiSpeaks"> {
  return { ...member, aiSpeaks: row.ai_speaks === true };
}

/** Whether a character's id is a character, or a party member, of this campaign decides where its memory is filed. */
export function memoryRowsFor(input: {
  memories: ReadonlyArray<{ characterId: string; kind: string; body: string }>;
  npcIds: ReadonlySet<string>;
  memberIds: ReadonlySet<string>;
  campaignId: string;
  userId: string;
  campaignSessionId: string | null;
  provenance: AiProvenance;
}): { npcRows: Row[]; memberRows: Row[] } {
  const common = (m: { kind: string; body: string }) => ({
    campaign_id: input.campaignId,
    user_id: input.userId,
    kind: m.kind,
    body: m.body,
    session_id: input.campaignSessionId,
    ai_provenance: input.provenance,
  });
  return {
    npcRows: input.memories.filter((m) => input.npcIds.has(m.characterId)).map((m) => ({ npc_id: m.characterId, ...common(m) })),
    // What one of the party lived through while their player was away: theirs to read when they are back.
    memberRows: input.memories.filter((m) => input.memberIds.has(m.characterId)).map((m) => ({ party_member_id: m.characterId, ...common(m) })),
  };
}

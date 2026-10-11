/**
 * Rows -> Obsidian vault files, pure and Supabase-free (#932, story 2 of
 * epic #932). `useCampaignMarkdownExport.ts` does the fetching and zipping;
 * this module only turns already-fetched rows into `{ [path]: string }`, so
 * it can be unit-tested without a database.
 *
 * Mirrors the JSON `.grimoire-backup` (`useCampaignBackup.ts`) in spirit —
 * "everything the DM's own campaign holds" — but is a different, *reading*
 * format: one `.md` per entity with YAML frontmatter and a markdown body,
 * meant to be opened as a vault and browsed/linked, not reimported. See the
 * README.md this module writes for the line that tells a DM which format is
 * which.
 *
 * @mentions in rich-text fields become `[[Exact File Name]]` wikilinks,
 * resolved against the file names this module itself assigns (so a renamed
 * or deduped file still links correctly) — see `buildMentionResolver`. A
 * stored mention carries no name of its own (#932 story 3), so the three
 * entity types this vault has no file for get their own rendering: the
 * "whole party" sentinel renders as "the party", a monster renders through
 * a `monsterNames` map the caller fetches and passes in (see
 * `collectMentionedMonsterIds`, since this module stays pure/Supabase-free
 * and cannot fetch them itself), and anything else unresolvable — a stale
 * id, a type this vault doesn't recognize — renders as "???", the app's
 * convention for a withheld name.
 */
import type { Faction } from "@/types/faction.types";
import type { Location } from "@/types/location.types";
import type { Npc } from "@/types/npc.types";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";
import type { PartyMember } from "@/types/party.types";
import type { Quest, QuestObjective } from "@/types/quest.types";
import { tiptapToMarkdown, type TiptapToMarkdownOptions } from "@/lib/tiptap/tiptapToMarkdown";
import { buildFrontmatter, dedupeFileName, joinSections, markdownSection, sanitizeFileName, type VaultFrontmatterValue } from "./vaultText";

export interface MarkdownVaultInput {
  campaignName: string;
  exportedAt: Date;
  npcs: Npc[];
  locations: Location[];
  factions: Faction[];
  quests: Quest[];
  questObjectives: QuestObjective[];
  partyMembers: PartyMember[];
  notes: Note[];
  /** The session log, so a session note can name the session it records. */
  sessions: CampaignSession[];
  /** id -> name, for every monster mentioned anywhere in the rich-text fields
   *  below. Fetched by the caller (`useCampaignMarkdownExport.ts`) via
   *  `collectMentionedMonsterIds`, since this module has no Supabase access
   *  of its own. Omitted/missing ids render as "???". */
  monsterNames?: Record<string, string>;
}

/** One vault file's id -> assigned display name (no folder, no `.md`) — what a `[[wikilink]]` names. */
type EntityFileNames = Map<string, string>;

/** The four entity kinds `EntityMention.ts`'s `EntityType` can resolve to a file in this vault. "monster" and "party" (the whole-party sentinel mention) are deliberately absent — nothing exports a Monsters or Party-group folder, so those two are handled directly in `buildMentionResolver` instead of through this table. */
interface MentionTargets {
  npc: EntityFileNames;
  location: EntityFileNames;
  faction: EntityFileNames;
  player: EntityFileNames;
}

type Folder = (typeof FOLDERS)[keyof typeof FOLDERS];

const FOLDERS = {
  party: "Party",
  npcs: "NPCs",
  locations: "Locations",
  factions: "Factions",
  quests: "Quests",
  notes: "Notes",
} as const;

/** Assigns a sanitized, deduped `<name>.md` to every row of one folder, in input order — ties (two same-named NPCs) resolve by array order, same as everywhere else in the app that dedupes a batch. */
function assignFileNames<T>(rows: T[], nameOf: (row: T) => string | null | undefined): EntityFileNames {
  const used = new Set<string>();
  const names: EntityFileNames = new Map();
  for (const row of rows) {
    const base = sanitizeFileName(nameOf(row));
    names.set((row as { id: string }).id, dedupeFileName(base, used));
  }
  return names;
}

/** Looks up the folder and file-name table for a mention's `entityType` — a switch rather than an index into `MentionTargets` because `EntityMention.ts`'s `EntityType` includes "monster" and "party", which this vault deliberately has no table for. */
function lookupMentionTable(targets: MentionTargets, entityType: string): [Folder, EntityFileNames] | undefined {
  switch (entityType) {
    case "npc": return [FOLDERS.npcs, targets.npc];
    case "location": return [FOLDERS.locations, targets.location];
    case "faction": return [FOLDERS.factions, targets.faction];
    case "player": return [FOLDERS.party, targets.player];
    default: return undefined;
  }
}

/**
 * `[[Folder/Name|Name]]` — path-qualified, because names are only unique
 * within a folder. An NPC and a session note can both be "Elminster", and a
 * bare `[[Elminster]]` would leave Obsidian to pick one of the two.
 */
function wikilink(folder: Folder, name: string | undefined): string | null {
  return name ? `[[${folder}/${name}|${name}]]` : null;
}

/** `options.mention` for `tiptapToMarkdown`: an exported entity (npc/location/
 *  faction/player) becomes a wikilink to its assigned file; the whole-party
 *  sentinel renders as prose ("the party"); a monster renders through the
 *  caller-supplied name map (see `collectMentionedMonsterIds`); anything
 *  else unresolvable — a stale id, an unrecognized type — renders "???". */
function buildMentionResolver(targets: MentionTargets, monsterNames: Map<string, string>): TiptapToMarkdownOptions["mention"] {
  return (attrs) => {
    if (attrs.entityType === "party") return "the party";
    if (attrs.entityType === "monster") return monsterNames.get(attrs.id) ?? "???";
    const hit = lookupMentionTable(targets, attrs.entityType);
    return (hit && wikilink(hit[0], hit[1].get(attrs.id))) || "???";
  };
}

// ── Monster mention ids (no vault file of their own — names come from a caller-fetched map) ──

interface MentionNode {
  type?: unknown;
  attrs?: { id?: unknown; entityType?: unknown };
  content?: unknown;
}

function collectMentionIdsOfType(node: unknown, entityType: string, into: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const n = node as MentionNode;
  if (n.type === "entityMention" && n.attrs?.entityType === entityType && typeof n.attrs.id === "string") {
    into.add(n.attrs.id);
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) collectMentionIdsOfType(child, entityType, into);
  }
}

function parseRichText(json: string | null | undefined): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Every monster-mention id across all the rich-text fields this vault will
 * convert, so the caller (`useCampaignMarkdownExport.ts`) knows exactly which
 * monster names to fetch before calling `buildMarkdownVault` — this module
 * stays pure/Supabase-free, so it cannot fetch them itself, and monsters have
 * no exported file/folder of their own for a wikilink to point at.
 */
export function collectMentionedMonsterIds(
  input: Pick<MarkdownVaultInput, "npcs" | "locations" | "factions" | "partyMembers" | "notes">,
): string[] {
  const ids = new Set<string>();
  const richTextFields: Array<string | null | undefined> = [
    ...input.npcs.flatMap((n) => [n.appearance, n.personality, n.backstory, n.notes]),
    ...input.locations.map((l) => l.description),
    ...input.factions.map((f) => f.description),
    ...input.partyMembers.flatMap((p) => [p.physical_description, p.personality_traits, p.ideals, p.bonds, p.flaws, p.notes]),
    ...input.notes.map((n) => n.content),
  ];
  for (const field of richTextFields) collectMentionIdsOfType(parseRichText(field), "monster", ids);
  return [...ids];
}

// ── Per-entity file bodies ──────────────────────────────────────────────────

function buildNpcFile(npc: Npc, mention: TiptapToMarkdownOptions): string {
  const frontmatter = buildFrontmatter([
    ["type", "npc"],
    ["grimoire_id", npc.id],
    ["race", npc.race],
    ["occupation", npc.occupation],
    ["status", npc.status],
    ["relationship", npc.relationship],
    ["tags", npc.tags],
  ]);
  const body = joinSections([
    markdownSection("Appearance", tiptapToMarkdown(npc.appearance, mention)),
    markdownSection("Personality", tiptapToMarkdown(npc.personality, mention)),
    markdownSection("Backstory", tiptapToMarkdown(npc.backstory, mention)),
    markdownSection("DM Notes", tiptapToMarkdown(npc.notes, mention)),
  ]);
  return `${frontmatter}\n# ${npc.name || "Untitled"}\n\n${body}`.trimEnd() + "\n";
}

function buildLocationFile(location: Location, targets: MentionTargets, mention: TiptapToMarkdownOptions): string {
  const parentName = location.parent_id ? targets.location.get(location.parent_id) : undefined;
  const fields: Array<[string, VaultFrontmatterValue]> = [
    ["type", "location"],
    ["grimoire_id", location.id],
    ["location_type", location.location_type],
  ];
  const parentLink = wikilink(FOLDERS.locations, parentName);
  if (parentLink) fields.push(["parent", parentLink]);
  fields.push(["tags", location.tags]);
  const frontmatter = buildFrontmatter(fields);
  const body = joinSections([markdownSection("Description", tiptapToMarkdown(location.description, mention))]);
  return `${frontmatter}\n# ${location.name || "Untitled"}\n\n${body}`.trimEnd() + "\n";
}

function buildFactionFile(faction: Faction, mention: TiptapToMarkdownOptions): string {
  const frontmatter = buildFrontmatter([
    ["type", "faction"],
    ["grimoire_id", faction.id],
    ["faction_type", faction.faction_type],
    ["alignment", faction.alignment],
    ["tags", faction.tags],
  ]);
  const body = joinSections([markdownSection("Description", tiptapToMarkdown(faction.description, mention))]);
  return `${frontmatter}\n# ${faction.name || "Untitled"}\n\n${body}`.trimEnd() + "\n";
}

const OBJECTIVE_STATUS_LABELS: Record<QuestObjective["status"], string> = {
  dormant: "Dormant",
  pending: "Pending",
  complete: "Complete",
  failed: "Failed",
};

function objectivesList(objectives: QuestObjective[]): string {
  if (!objectives.length) return "";
  return objectives
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => `- **${OBJECTIVE_STATUS_LABELS[o.status]}:** ${o.description}`)
    .join("\n");
}

function buildQuestFile(quest: Quest, objectives: QuestObjective[], targets: { quest: EntityFileNames }): string {
  const parentName = quest.parent_quest_id ? targets.quest.get(quest.parent_quest_id) : undefined;
  const fields: Array<[string, VaultFrontmatterValue]> = [
    ["type", "quest"],
    ["grimoire_id", quest.id],
    ["status", quest.status],
  ];
  const parentLink = wikilink(FOLDERS.quests, parentName);
  if (parentLink) fields.push(["parent", parentLink]);
  fields.push(["tags", quest.tags]);
  const frontmatter = buildFrontmatter(fields);
  const body = joinSections([
    markdownSection("Summary", quest.summary),
    markdownSection("Objectives", objectivesList(objectives)),
  ]);
  return `${frontmatter}\n# ${quest.title || "Untitled"}\n\n${body}`.trimEnd() + "\n";
}

function buildPartyMemberFile(pm: PartyMember, mention: TiptapToMarkdownOptions): string {
  const frontmatter = buildFrontmatter([
    ["type", "party_member"],
    ["grimoire_id", pm.id],
    ["player_name", pm.player_name],
    ["class", pm.class],
    ["subclass", pm.subclass],
    ["level", pm.level],
    ["alignment", pm.alignment],
  ]);
  const body = joinSections([
    markdownSection("Physical Description", tiptapToMarkdown(pm.physical_description, mention)),
    markdownSection("Personality Traits", tiptapToMarkdown(pm.personality_traits, mention)),
    markdownSection("Ideals", tiptapToMarkdown(pm.ideals, mention)),
    markdownSection("Bonds", tiptapToMarkdown(pm.bonds, mention)),
    markdownSection("Flaws", tiptapToMarkdown(pm.flaws, mention)),
    markdownSection("Notes", tiptapToMarkdown(pm.notes, mention)),
  ]);
  return `${frontmatter}\n# ${pm.name || "Untitled"}\n\n${body}`.trimEnd() + "\n";
}

function buildNoteFile(note: Note, sessions: readonly CampaignSession[], mention: TiptapToMarkdownOptions): string {
  const fields: Array<[string, VaultFrontmatterValue]> = [
    ["type", "note"],
    ["grimoire_id", note.id],
    ["category", note.category],
  ];
  const session = sessions.find((s) => s.id === note.session_id);
  if (session?.number != null) fields.push(["session", session.number]);
  if (session?.title) fields.push(["session_title", session.title]);
  fields.push(["tags", note.tags]);
  const frontmatter = buildFrontmatter(fields);
  const body = tiptapToMarkdown(note.content, mention);
  return `${frontmatter}\n# ${note.title || "Untitled"}\n\n${body}`.trimEnd() + "\n";
}

// ── README ───────────────────────────────────────────────────────────────

function folderIndex(folder: Folder, names: EntityFileNames): string {
  if (!names.size) return "";
  const links = [...names.values()].map((n) => `- ${wikilink(folder, n)}`).join("\n");
  return `## ${folder}\n\n${links}`;
}

function buildReadme(input: MarkdownVaultInput, names: {
  party: EntityFileNames;
  npc: EntityFileNames;
  location: EntityFileNames;
  faction: EntityFileNames;
  quest: EntityFileNames;
  note: EntityFileNames;
}): string {
  const dateStr = input.exportedAt.toISOString().slice(0, 10);
  const intro = [
    `# ${input.campaignName || "Campaign"}`,
    "",
    `Exported ${dateStr}.`,
    "",
    "This is a **Markdown / Obsidian vault** export, for reading this campaign and taking " +
      "its data elsewhere. Grimoire cannot restore it: the `.grimoire-backup` file (Campaign " +
      "Settings → Backup) is the format Grimoire can reimport. This one is for opening as a " +
      "vault in Obsidian or another markdown reader.",
  ].join("\n");
  const sections = joinSections([
    folderIndex(FOLDERS.party, names.party),
    folderIndex(FOLDERS.npcs, names.npc),
    folderIndex(FOLDERS.locations, names.location),
    folderIndex(FOLDERS.factions, names.faction),
    folderIndex(FOLDERS.quests, names.quest),
    folderIndex(FOLDERS.notes, names.note),
  ]);
  return `${intro}\n\n${sections}`.trimEnd() + "\n";
}

// ── Entry point ──────────────────────────────────────────────────────────

/** Builds every vault file as `{ [path]: markdown }`, keyed by the path fflate's `zipSync` will write it at (folder-prefixed, `.md`-suffixed; `README.md` at the root). */
export function buildMarkdownVault(input: MarkdownVaultInput): Record<string, string> {
  const npcNames = assignFileNames(input.npcs, (n) => n.name);
  const locationNames = assignFileNames(input.locations, (l) => l.name);
  const factionNames = assignFileNames(input.factions, (f) => f.name);
  const questNames = assignFileNames(input.quests, (q) => q.title);
  const partyNames = assignFileNames(input.partyMembers, (p) => p.name);
  const noteNames = assignFileNames(input.notes, (n) => n.title);

  const mentionTargets: MentionTargets = { npc: npcNames, location: locationNames, faction: factionNames, player: partyNames };
  const monsterNames = new Map(Object.entries(input.monsterNames ?? {}));
  const mention: TiptapToMarkdownOptions = { mention: buildMentionResolver(mentionTargets, monsterNames) };

  const objectivesByQuest = new Map<string, QuestObjective[]>();
  for (const obj of input.questObjectives) {
    const list = objectivesByQuest.get(obj.quest_id) ?? [];
    list.push(obj);
    objectivesByQuest.set(obj.quest_id, list);
  }

  const files: Record<string, string> = {};

  for (const npc of input.npcs) files[`${FOLDERS.npcs}/${npcNames.get(npc.id)}.md`] = buildNpcFile(npc, mention);
  for (const loc of input.locations) files[`${FOLDERS.locations}/${locationNames.get(loc.id)}.md`] = buildLocationFile(loc, mentionTargets, mention);
  for (const f of input.factions) files[`${FOLDERS.factions}/${factionNames.get(f.id)}.md`] = buildFactionFile(f, mention);
  for (const q of input.quests) {
    files[`${FOLDERS.quests}/${questNames.get(q.id)}.md`] = buildQuestFile(q, objectivesByQuest.get(q.id) ?? [], { quest: questNames });
  }
  for (const pm of input.partyMembers) files[`${FOLDERS.party}/${partyNames.get(pm.id)}.md`] = buildPartyMemberFile(pm, mention);
  for (const note of input.notes) files[`${FOLDERS.notes}/${noteNames.get(note.id)}.md`] = buildNoteFile(note, input.sessions, mention);

  files["README.md"] = buildReadme(input, {
    party: partyNames,
    npc: npcNames,
    location: locationNames,
    faction: factionNames,
    quest: questNames,
    note: noteNames,
  });

  return files;
}

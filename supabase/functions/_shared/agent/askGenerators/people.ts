// Ask Grimoire: The NPC generator.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";
import { npcLinks, image, NPC_RELATIONS } from "./shared.ts";

export const PEOPLE_GENERATORS: readonly AskGenerator[] = [
  {
    id: "npc", action: "Create NPC", noun: "NPC", ending: "record",
    describe: "A new non-player character: name, look, voice, personality, secret. It can be tied to people, places and factions the campaign already has: say who it is to them (a sister, a former partner, a rival) with `related_npc_id` or `related_pc_id` and `relation`.",
    inputs: {
      name: { type: "string", description: "A name the DM gave.", label: "Name", placeholder: "Leave blank and one is chosen" },
      race: { type: "string", description: "Species or race, as the DM said it.", label: "Species", list: "species" },
      age: { type: "integer", description: "Age in years, when the DM gave one.", minimum: 0, maximum: 10000, label: "Age", placeholder: "Any" },
      alignment: { type: "string", description: "Alignment.", label: "Alignment", list: "alignment" },
      role: { type: "string", description: "Occupation or role in the world.", label: "Role", placeholder: "Any" },
      location_id: { type: "string", description: "Id of a place in this campaign where they live or work.", label: "Lives in", record: "location", group: "Where they stand" },
      faction_id: { type: "string", description: "Id of a faction in this campaign they belong to.", label: "Faction", record: "faction", group: "Where they stand" },
      faction_role: { type: "string", description: "Their role in that faction, e.g. Leader, Spy, Member. Only with faction_id.", label: "Role in faction", list: "faction_role", group: "Where they stand", when: { key: "faction_id" } },
      related_npc_id: { type: "string", description: "Id of an existing NPC in this campaign this one is tied to (kin, friend, rival, former partner...). Pair it with `relation`.", label: "Tied to (NPC)", record: "npc", group: "Where they stand" },
      related_pc_id: { type: "string", description: "Id of an existing party member (player character) in this campaign this one is kin to. Only for the family words of `relation`.", label: "Tied to (character)", record: "party_member", group: "Where they stand" },
      relation: { type: "string", description: "What the NEW NPC is to the one in related_npc_id or related_pc_id, read from the new NPC: \"sibling\" = the new NPC is their sibling; \"mentor\" = the new NPC mentors them; \"betrayed\" = the new NPC betrayed them; \"betrayed_by\" = they betrayed the new NPC. Without it a related id is ignored.", enum: NPC_RELATIONS, label: "Relation to them", group: "Where they stand", when: { key: ["related_npc_id", "related_pc_id"] } },
      second_parent_id: { type: "string", description: "Id of an existing NPC who is the other parent, when relation is child. Only with related_npc_id or related_pc_id.", label: "Other parent", record: "npc", group: "Where they stand", when: { key: "relation", is: ["child"] } },
      links: { ...npcLinks, label: "Ties", group: "Where they stand" },
      attitude: { type: "string", description: "How they feel about the party.", enum: ["unknown", "hostile", "unfriendly", "indifferent", "friendly", "helpful"], label: "Attitude to the party", group: "At the table" },
      stat_block_template: { type: "string", description: "Starter stat block: a template id, \"auto\" (matched to their occupation) or \"none\". Leave out for auto.", label: "Stat block template", list: "npc_stat_template", group: "At the table" },
      portrait: { ...image, label: "Portrait" },
      alter_ego: { type: "boolean", description: "Give them a disguise or second identity.", label: "Alter ego", hint: "A disguised name and portrait, priced as a second portrait" },
    },
    opened: { portrait: true },
    concept: { label: "What to make", placeholder: "A mysterious tiefling bard who works as a city informant and hides a dark past…", required: true, max: 1000, mentions: "items" },
    ask: ["portrait"],
  },
];

// The database half of "who the player plays" (#1021): reading one party member as the narrator may know them.
// Read with the service role after the handler has checked the caller is the campaign's DM; the campaign filter is in
// the query, so an id from another campaign is simply not found. No test harness here, like `questIo.ts`: the rules
// (what is said of them, when a name ends an exchange) are in `_shared/agent/playerCharacter.ts`.

import { toPlainText } from "../_shared/ai-prompt.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCharacter } from "../_shared/agent/playerCharacter.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `party_members.species_id` is a custom species uuid or a shared library slug; each id goes to the table it lives in. */
async function speciesName(admin: SupabaseClient, speciesId: string): Promise<string | null> {
  const { data, error } = await admin
    .from(UUID_RE.test(speciesId) ? "species" : "library_species")
    .select("name")
    .eq("id", speciesId)
    .maybeSingle();
  if (error) throw error;
  return data && typeof data.name === "string" ? data.name : null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Null when the id is not a party member of THIS campaign. A species that will not read costs only that word. */
// What the player wrote on the sheet, each part under its own word. Rich text is read as plain text.
const ABOUT_FIELDS: Array<[string, string]> = [
  ["physical_description", "Looks"],
  ["player_description", "As others see them"],
  ["personality_traits", "Traits"],
  ["ideals", "Ideals"],
  ["bonds", "Bonds"],
  ["flaws", "Flaws"],
  ["notes", "Notes"],
];

function aboutOf(row: Record<string, unknown>): string | null {
  const parts = ABOUT_FIELDS.flatMap(([field, label]) => {
    const raw = row[field];
    const plain = typeof raw === "string" ? toPlainText(raw).trim() : "";
    return plain === "" ? [] : [`${label}: ${plain}`];
  });
  return parts.length === 0 ? null : parts.join("\n");
}

export async function loadPartyMember(admin: SupabaseClient, campaignId: string, id: string): Promise<PlayerCharacter | null> {
  const { data, error } = await admin
    .from("party_members")
    .select("id, name, pronouns, class, subclass, level, subrace, species_id, max_hp, current_hp, physical_description, personality_traits, ideals, bonds, flaws, player_description, notes")
    .eq("id", id)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const name = text(data.name);
  if (name === null) return null;
  let species: string | null = text(data.subrace);
  if (species === null && typeof data.species_id === "string") {
    try {
      species = await speciesName(admin, data.species_id);
    } catch (err) {
      console.error("agent-turn: reading the character's species failed:", err);
    }
  }
  const { level, max_hp: max, current_hp: current } = data;
  return {
    id: data.id as string,
    name,
    pronouns: text(data.pronouns),
    species,
    className: text(data.class),
    subclass: text(data.subclass),
    level: typeof level === "number" && level > 0 ? level : null,
    hitPoints: typeof max === "number" && typeof current === "number" && max > 0 ? { current, max } : null,
    about: aboutOf(data),
  };
}

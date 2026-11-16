// Where the party is, in a conversation with the AI table (#1021). Pure: no I/O.
//
// The narrator used to find out the place and who was in it by looking it up, one model call at a time (seen live:
// seven calls and 14 seconds for one question, five of them lookups). Now the conversation keeps the place, the
// server reads it and its people at the start of every turn, and the narrator is handed them in the system text.
// `go_to` is how the narrator moves the party.

import type { AgentTool, ToolAnswer } from "./types.ts";

/** What the narrator is told about the place. The caller's loader cuts `description` to plain text. */
export interface SceneView {
  id: string;
  name: string;
  kind: string | null;
  description: string;
  /** The name of the place this one is inside of. */
  within: string | null;
  /** The places inside this one: where the party can go next. */
  places: { id: string; name: string }[];
  /** The people here, by the name the party would know them by (a disguise, not the true name). */
  characters: { id: string; name: string; occupation: string | null }[];
}

/** A scene that fills the system text on every turn costs on every turn, so each part has a ceiling. */
export const DESCRIPTION_MAX = 1200;
export const PLACES_MAX = 20;
export const CHARACTERS_MAX = 20;

/** A scene as the narrator reads it, plus how many of each list were cut so it knows to look the rest up. */
export interface TrimmedScene extends SceneView {
  morePlaces: number;
  moreCharacters: number;
}

export function trimScene(view: SceneView): TrimmedScene {
  const description = view.description.length > DESCRIPTION_MAX
    ? `${view.description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
    : view.description;
  return {
    ...view,
    description,
    places: view.places.slice(0, PLACES_MAX),
    characters: view.characters.slice(0, CHARACTERS_MAX),
    morePlaces: Math.max(0, view.places.length - PLACES_MAX),
    moreCharacters: Math.max(0, view.characters.length - CHARACTERS_MAX),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GO_TO_TOOL: AgentTool = {
  name: "go_to",
  description:
    "Moves the party to a place of this campaign. Call it whenever the party arrives somewhere else, with the id of " +
    "the place (find it with search, or take it from the places listed under \"Where the party is\"). The answer is " +
    "the new place and who is there, so you do not need to look them up.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      location_id: { type: "string", description: "The id of the place the party arrives at." },
      with: {
        type: "array",
        maxItems: 8,
        items: { type: "string" },
        description: "The ids of the characters who come along with the party. Everyone else stays where they were.",
      },
    },
    required: ["location_id"],
  },
};

export function parseGoToInput(
  input: Record<string, unknown>,
): { ok: true; locationId: string; companions: string[] } | { ok: false; error: string } {
  const id = input.location_id;
  if (typeof id !== "string" || id.trim() === "") return { ok: false, error: "location_id is required: the id of the place the party goes to." };
  const trimmed = id.trim();
  if (!UUID.test(trimmed)) return { ok: false, error: "location_id must be the uuid of a place. Search for the place to find its id." };
  const along = input.with;
  if (along !== undefined && (!Array.isArray(along) || along.length > 8 || along.some((id) => typeof id !== "string" || !UUID.test(id.trim())))) {
    return { ok: false, error: "with must be a list of at most 8 character ids: the people who come along." };
  }
  const companions = along === undefined ? [] : [...new Set((along as string[]).map((id) => id.trim().toLowerCase()))];
  return { ok: true, locationId: trimmed, companions };
}

const HEADING = "## Where the party is";

/** The block of the system text that says where the party is. */
export function sceneSection(scene: TrimmedScene | null): string {
  if (!scene) {
    return `${HEADING}\n\nThe party has no place yet. Find where the story starts, then call go_to with that place's id.`;
  }
  const lines: string[] = [HEADING, "", `${scene.name}${scene.kind ? ` (${scene.kind})` : ""}, id ${scene.id}`];
  if (scene.within) lines.push(`Inside: ${scene.within}`);
  if (scene.description) lines.push("", scene.description);

  lines.push("");
  if (scene.characters.length === 0 && scene.moreCharacters === 0) {
    lines.push("Nobody with a record is here.");
  } else {
    lines.push("Characters here (speaker_id is the id):");
    for (const c of scene.characters) lines.push(`- ${c.name}${c.occupation ? `, ${c.occupation}` : ""}, id ${c.id}`);
    if (scene.moreCharacters > 0) lines.push(`- and ${scene.moreCharacters} more: search for them when they matter.`);
  }

  if (scene.places.length > 0 || scene.morePlaces > 0) {
    lines.push("", "Places inside this one:");
    for (const p of scene.places) lines.push(`- ${p.name}, id ${p.id}`);
    if (scene.morePlaces > 0) lines.push(`- and ${scene.morePlaces} more: search for them when they matter.`);
  }

  lines.push(
    "",
    "Everything about this place and these people that an ordinary turn needs is here. Do not look them up again.",
  );
  return lines.join("\n");
}

/** What `go_to` answers: the same information as the section, compact, so the narrator has the new place this turn. */
export function sceneResult(scene: TrimmedScene): string {
  return JSON.stringify({
    moved_to: { id: scene.id, name: scene.name, kind: scene.kind, within: scene.within, description: scene.description },
    characters_here: scene.characters,
    more_characters: scene.moreCharacters > 0 ? scene.moreCharacters : undefined,
    nobody_here: scene.characters.length === 0 && scene.moreCharacters === 0 ? true : undefined,
    places_inside: scene.places,
    more_places: scene.morePlaces > 0 ? scene.morePlaces : undefined,
  });
}

export interface SceneToolDeps {
  campaignId: string;
  sessionId: string;
  /** Stores the move and answers with the new scene; null when the place is not in this campaign or could not be stored. */
  setScene(sessionId: string, campaignId: string, locationId: string): Promise<SceneView | null>;
  /** Told once per successful move, with only what the browser may see. */
  /** The party arrived; `companions` are the characters who came along. */
  onMove(place: { id: string; name: string }, companions: string[]): void;
}

/**
 * The `go_to` tool bound to one conversation. The campaign is the conversation's, never whatever the model writes:
 * a `campaign_id` in the input is not even read.
 */
export function makeSceneTool(deps: SceneToolDeps): { tool: AgentTool; call: (input: Record<string, unknown>) => Promise<ToolAnswer> } {
  return {
    tool: GO_TO_TOOL,
    call: async (input) => {
      const parsed = parseGoToInput(input);
      if (!parsed.ok) return { content: parsed.error, isError: true };
      // The write happens now, not with the turn's save: a move that was made stays made even when the turn fails
      // later, because the party did arrive and the next turn must not start from the old place.
      const scene = await deps.setScene(deps.sessionId, deps.campaignId, parsed.locationId);
      if (!scene) return { content: "That place is not in this campaign, so the party did not move.", isError: true };
      deps.onMove({ id: scene.id, name: scene.name }, parsed.companions);
      return { content: sceneResult(trimScene(scene)), isError: false };
    },
  };
}

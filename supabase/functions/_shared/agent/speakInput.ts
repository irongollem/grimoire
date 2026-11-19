// The two tools a character's turn goes through at the AI-run table (#1021), and the checks on what the narrator
// hands them. Split from speak.ts, which holds what a character hears and the character's own call. Pure.

import type { AgentTool } from "./types.ts";
import type { Parsed } from "./parse.ts";
import { UUID_RE } from "./parse.ts";

const MANNER_MAX = 200;
const HAPPENING_MAX = 600;
const WHAT_MAX = 300;
const PLAYER_SAID_MAX = 400;
const NAME_MAX = 120;
const PRESENT_MAX = 12;
const VIA_MAX = 80;

/** How loud something is said decides who hears it, as at a table. */
export const VOLUMES = ["whisper", "normal", "shout"] as const;
export type Volume = (typeof VOLUMES)[number];

const SPEAKER_PROPERTIES = {
  speaker_id: {
    type: "string",
    description: "The id of a character with a record in this campaign. Use this or speaker_name, never both.",
  },
  speaker_name: {
    type: "string",
    description: "The name of someone with no record, for example \"The sweeper\". Use this or speaker_id, never both.",
  },
  present: {
    type: "array",
    maxItems: PRESENT_MAX,
    items: { type: "string" },
    description:
      "Everyone else in the same room or within normal earshot: their speaker_id when they have a record, " +
      "otherwise their name. Someone in another room is NOT present. A character left out never learns it happened.",
  },
} as const;

export const SPEAK_TOOL: AgentTool = {
  name: "speak",
  description:
    "Gives a character its turn. The character decides for itself what it says AND what it does, knowing only its " +
    "own record and what happened in front of it. Never write a character's words or deeds yourself, and never tell " +
    "it what to say or do. What it does is an attempt: you judge afterwards what comes of it. Put in `happening` only " +
    "what this character can perceive right now, including what was just said to them, and never anything from DM " +
    "notes or another character's secrets.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...SPEAKER_PROPERTIES,
      manner: {
        type: "string",
        maxLength: MANNER_MAX,
        description: "How someone WITHOUT a record talks. Not allowed with speaker_id: a recorded character's voice comes from its record.",
      },
      happening: {
        type: "string",
        maxLength: HAPPENING_MAX,
        description: "What this character sees and hears right now, including what was just said to them.",
      },
      volume: {
        type: "string",
        enum: [...VOLUMES],
        description:
          "How loudly the character answers. normal (the default): everyone present hears. whisper: only those in " +
          "whispered_to hear the words; the others present only see that something was whispered. shout: those in " +
          "also_heard_by hear it too.",
      },
      whispered_to: {
        type: "array",
        maxItems: PRESENT_MAX,
        items: { type: "string" },
        description: "With volume whisper: the characters close enough to hear the words (speaker_id or name).",
      },
      also_heard_by: {
        type: "array",
        maxItems: PRESENT_MAX,
        items: { type: "string" },
        description:
          "Characters who are NOT in the room and hear this anyway: a shout carrying to the next room, or a magical " +
          "device. Allowed only with volume shout, or with `via` naming the device.",
      },
      via: {
        type: "string",
        maxLength: VIA_MAX,
        description: "The device or magic that carries the words to also_heard_by, for example \"a sending stone\".",
      },
      player_volume: {
        type: "string",
        enum: [...VOLUMES],
        description:
          "How loudly the player's character said player_said. whisper: only this character heard the words. " +
          "shout: also_heard_by heard them too.",
      },
      player_said: {
        type: "string",
        maxLength: PLAYER_SAID_MAX,
        description:
          "What the player's character just said aloud, word for word, when they said something. Everyone in " +
          "`present` hears it too, so leave it out when the words were not said in front of this character.",
      },
    },
    required: ["happening"],
  },
};

export const ACT_TOOL: AgentTool = {
  name: "act",
  description:
    "Records something visibly done by someone with NO record (a beast, a monster, a crowd, a sweeper), so the screen " +
    "can show it apart from narration. A character with a record decides its own deeds: call speak for it, never this. " +
    "Only for someone who acts: what a thing does (a lock holds, a door opens, a lamp goes out) is your narration. " +
    "Whoever is in `present` will remember it.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...SPEAKER_PROPERTIES,
      what: {
        type: "string",
        maxLength: WHAT_MAX,
        description: "What someone with no record visibly does, third person without the name, e.g. \"Snaps at your heels.\"",
      },
    },
    required: ["what"],
  },
};

export const SPEECH_TOOL_NAMES: ReadonlySet<string> = new Set([SPEAK_TOOL.name, ACT_TOOL.name]);

// ── Input ─────────────────────────────────────────────────────────────────────


interface SpeakerRef {
  id: string | null;
  name: string | null;
}

export interface SpeakInput extends SpeakerRef {
  manner: string | null;
  happening: string;
  /** The player's own words, said to the speaker; who else heard them follows from `playerVolume`. */
  playerSaid: string | null;
  playerVolume: Volume;
  volume: Volume;
  whisperedTo: string[];
  alsoHeardBy: string[];
  via: string | null;
  present: string[];
}

export interface ActInput extends SpeakerRef {
  what: string;
  present: string[];
}

function fail<T>(error: string): Parsed<T> {
  return { ok: false, error };
}

function text(input: Record<string, unknown>, key: string, max: number): Parsed<string | null> {
  const v = input[key];
  if (v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return fail(`${key} must be a string.`);
  const trimmed = v.trim();
  if (trimmed.length > max) return fail(`${key} is too long: at most ${max} characters.`);
  return { ok: true, value: trimmed };
}

function speakerOf(input: Record<string, unknown>): Parsed<SpeakerRef> {
  const id = text(input, "speaker_id", NAME_MAX);
  if (!id.ok) return id;
  const name = text(input, "speaker_name", NAME_MAX);
  if (!name.ok) return name;
  const hasId = id.value !== null && id.value !== "";
  const hasName = name.value !== null && name.value !== "";
  if (hasId && hasName) return fail("Give speaker_id or speaker_name, not both.");
  if (!hasId && !hasName) return fail("Say who: give speaker_id for a character with a record, or speaker_name.");
  if (hasId && !UUID_RE.test(id.value as string)) {
    return fail("speaker_id must be the uuid of a character record. For someone with no record use speaker_name.");
  }
  return { ok: true, value: { id: hasId ? (id.value as string) : null, name: hasName ? (name.value as string) : null } };
}

function volumeOf(input: Record<string, unknown>, key: string): Parsed<Volume> {
  const v = input[key];
  if (v === undefined) return { ok: true, value: "normal" };
  const found = VOLUMES.find((x) => x === v);
  return found ? { ok: true, value: found } : fail(`${key} must be whisper, normal or shout.`);
}

function presentOf(input: Record<string, unknown>, key = "present"): Parsed<string[]> {
  const v = input[key];
  if (v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v)) return fail(`${key} must be a list of speaker_ids or names.`);
  if (v.length > PRESENT_MAX) return fail(`${key} lists too many characters: at most ${PRESENT_MAX}.`);
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry !== "string") return fail(`${key} must hold only strings.`);
    const t = entry.trim();
    if (t.length > NAME_MAX) return fail(`A ${key} entry is too long: at most ${NAME_MAX} characters.`);
    if (t) out.push(t);
  }
  return { ok: true, value: out };
}

function required(input: Record<string, unknown>, key: string, max: number): Parsed<string> {
  const t = text(input, key, max);
  if (!t.ok) return t;
  if (!t.value) return fail(`${key} is required and cannot be empty.`);
  return { ok: true, value: t.value };
}

export function parseSpeakInput(input: Record<string, unknown>): Parsed<SpeakInput> {
  const who = speakerOf(input);
  if (!who.ok) return who;
  const happening = required(input, "happening", HAPPENING_MAX);
  if (!happening.ok) return happening;
  const manner = text(input, "manner", MANNER_MAX);
  if (!manner.ok) return manner;
  if (who.value.id && manner.value) {
    return fail("manner is only for someone with no record: a recorded character's voice comes from its record.");
  }
  const playerSaid = text(input, "player_said", PLAYER_SAID_MAX);
  if (!playerSaid.ok) return playerSaid;
  const present = presentOf(input);
  if (!present.ok) return present;
  const volume = volumeOf(input, "volume");
  if (!volume.ok) return volume;
  const playerVolume = volumeOf(input, "player_volume");
  if (!playerVolume.ok) return playerVolume;
  const whisperedTo = presentOf(input, "whispered_to");
  if (!whisperedTo.ok) return whisperedTo;
  const alsoHeardBy = presentOf(input, "also_heard_by");
  if (!alsoHeardBy.ok) return alsoHeardBy;
  const via = text(input, "via", VIA_MAX);
  if (!via.ok) return via;
  if (whisperedTo.value.length > 0 && volume.value !== "whisper") {
    return fail("whispered_to is only for volume whisper.");
  }
  // Words do not carry out of a room by themselves: it takes a raised voice or something that carries them.
  if (alsoHeardBy.value.length > 0 && volume.value !== "shout" && playerVolume.value !== "shout" && !via.value) {
    return fail("also_heard_by needs volume shout, or via naming the device that carries the words.");
  }
  return {
    ok: true,
    value: {
      ...who.value,
      manner: manner.value || null,
      happening: happening.value,
      playerSaid: playerSaid.value || null,
      playerVolume: playerVolume.value,
      volume: volume.value,
      whisperedTo: whisperedTo.value,
      alsoHeardBy: alsoHeardBy.value,
      via: via.value || null,
      present: present.value,
    },
  };
}

export function parseActInput(input: Record<string, unknown>): Parsed<ActInput> {
  const who = speakerOf(input);
  if (!who.ok) return who;
  const what = required(input, "what", WHAT_MAX);
  if (!what.ok) return what;
  const present = presentOf(input);
  if (!present.ok) return present;
  return { ok: true, value: { ...who.value, what: what.value, present: present.value } };
}

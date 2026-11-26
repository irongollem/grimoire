import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonSectionId } from "@/lib/canon/canonParts";
import type { CanonClue, CanonEntry, PremiseKind } from "@/types/canon.types";

/**
 * "Design it with me" (#1282): one walk through the whole canon, in the order of the Canon's own chapters, the premise
 * split into the fields it holds. Each step is filled (the canon already holds it), skipped (the DM chose to leave it
 * empty, `canon_walk_skips`) or to do. Nothing here is stored: a step is filled because the canon says so, so finishing
 * a section in its chapter ticks it here, and the walk resumes at the first step still to do.
 *
 * It replaced the way in (four steps for a new canon, #1267), and so did the Familiar's "walk me through it", which was
 * one request with no state that the helper read as a request for truths.
 */

export type WalkStepId =
  | "pitch" | "themes" | "table" | "voice" | "look" | "lines"
  | "truths" | "forces" | "secrets" | "questions" | "lore"
  | "arcs" | "peoples" | "habitats" | "backstories";

export type WalkState = "filled" | "skipped" | "todo";

/** The helpers the walk's Enhance runs: modes of `useCanonSuggestions` (a test holds the two equal). */
export type WalkDraftMode = "premise" | "truths" | "forces" | "secrets" | "questions" | "lore" | "arcs" | "peoples" | "backstory";

/** What "Enhance with AI" runs for a step: the helper, and for the premise which of its kinds (it drafts only those). */
export type WalkDraft = { mode: "premise"; kinds: PremiseKind[] } | { mode: Exclude<WalkDraftMode, "premise"> };

export interface WalkStepDef {
  id: WalkStepId;
  /** The chapter the step writes into: where its entries are, and what "Open the chapter" opens. */
  chapter: CanonSectionId;
  title: string;
  hint: string;
  /** What the Familiar asks, in its own voice. A backstory's question holds `{name}`, the character it is for. */
  question: string;
  /** What the Familiar asks when the answer was thin, to draw out more: once per stop per walk. Holds `{name}` like `question`. */
  followUp: string;
  /** An example answer for the composer. */
  placeholder: string;
  /** What "Enhance with AI" runs, or null where the step has no draft (`noDraft` then says why). */
  draft: WalkDraft | null;
  noDraft?: string;
  /** Whether "Write it myself" can turn the answer into the section (false: the block offers the chapter instead). */
  canWrite: boolean;
}

export const WALK_STEPS: readonly WalkStepDef[] = [
  {
    id: "pitch", chapter: "premise", title: "The pitch", hint: "A paragraph that says what your campaign is about. Every draft after this one is written from it.",
    question: "Tell me about your campaign in your own words: where it happens, what is going wrong, and why the party would care. The more you give me, the more the pitch will sound like yours.",
    followUp: "That is a good start. What does the party want out of it, and what stands in their way? Anything about the place or the people who live there helps too.",
    placeholder: "A drowned kingdom surfaces once a decade, and rival crews race to loot it before the tide comes back.",
    // The DM's own words, written out as the pitch: the premise helper drafts only the pitch from their words.
    draft: { mode: "premise", kinds: ["pitch"] }, canWrite: true,
  },
  {
    id: "themes", chapter: "premise", title: "Themes", hint: "What the campaign keeps coming back to, one line each.",
    question: "What is this campaign really about, underneath the adventure? Tell me all of it: the ideas, the feelings and the questions you want your table to chew on. Say as much as you like and I will pick the themes out of it.",
    followUp: "Can you say more about what you want your players to feel or wrestle with? A scene you picture, a choice you want them to face or a story that inspired this all help.",
    placeholder: "Debts and who pays them\nThe sea taking things back\nKindness when it costs something",
    draft: { mode: "premise", kinds: ["theme"] }, canWrite: true,
  },
  {
    id: "table", chapter: "premise", title: "At the table", hint: "How play feels: talk or fights, fast or slow, light or grim.",
    question: "How do you want an evening at your table to feel? Tell me about the mix of talking, fighting and exploring, the pace, and how grim or light it gets. A session you loved running is a good thing to describe.",
    followUp: "What does a great night look like for your group? Think of a moment you would want them to remember, and how serious or silly the table is allowed to get.",
    placeholder: "Mostly talking and scheming, a few hard fights, grim but with room for jokes.",
    draft: { mode: "premise", kinds: ["table"] }, canWrite: true,
  },
  {
    id: "voice", chapter: "premise", title: "Voice", hint: "How its text reads and its names sound. Players never read this.",
    question: "How should the campaign sound when it is written down? Describe how its text should read and how its names should sound, and give me a name or a sentence you like if you have one.",
    followUp: "Is there a book, a storyteller or a place whose way of speaking is close to what you want? Tell me what it sounds like, and a few names in that spirit.",
    placeholder: "Dry and warm, like a village storyteller. Names are short and earthy: Brin, Tallow, Marrow Lane.",
    draft: { mode: "premise", kinds: ["voice"] }, canWrite: true,
  },
  {
    id: "look", chapter: "premise", title: "Look", hint: "How its pictures are painted. Players never read this.",
    question: "How should the campaign's pictures look? Describe the painting rather than the scene: the colours, the light, the kind of brushwork, any artist or film it brings to mind. The more detail, the closer the pictures will come.",
    followUp: "What mood should a picture carry, and what should it never look like? Colours, time of day and the age of the paint all help.",
    placeholder: "Soft watercolour, muted greens and ochres, lantern light at dusk.",
    draft: { mode: "premise", kinds: ["look"] }, canWrite: true,
  },
  {
    id: "lines", chapter: "premise", title: "Lines and veils", hint: "What must never happen, and what happens only off the page. Talk them over with your players.",
    question: "Is there anything that must never happen at your table, or that happens only off the page? Tell me as much as you are comfortable with, in your own words. One per line works best; start a line with veil: for the second kind.",
    followUp: "Is there a topic you would want to check with your players before it comes up? Say what it is, and whether you would skip it entirely or only fade to black.",
    placeholder: "No harm to children\nveil: Torture happens, but we skip past it",
    draft: { mode: "premise", kinds: ["line", "veil"] }, canWrite: true,
  },
  {
    id: "truths", chapter: "truths", title: "Truths", hint: "Things simply so about your world, one line each.",
    question: "What would a traveller notice is simply so about this world, whatever anyone believes? Tell me what you know: how things work, what everyone takes for granted, what is rare or strange. The more facts you give, the better the draft will fit.",
    followUp: "What else is simply so? Think of the weather, the gods, magic, money and what people fear. Even rough facts help.",
    placeholder: "The sea has been rising for forty years\nNo one alive has seen a dragon",
    draft: { mode: "truths" }, canWrite: true,
  },
  {
    id: "forces", chapter: "moving", title: "Forces", hint: "Someone or something working towards a goal, whether or not the party is there.",
    question: "Who or what is working towards a goal, whether or not the party turns up? Tell me about the factions, schemes or powers you have in mind, what each wants and how far it will go.",
    followUp: "Pick one of them: what do they want, and what are they doing about it this week? Who would they threaten, and who would they pay?",
    placeholder: "The Tidewardens want the old harbour sealed\nA smuggler queen is buying every lamp in town",
    draft: { mode: "forces" }, canWrite: true,
  },
  {
    id: "secrets", chapter: "secrets", title: "Secrets, with clues", hint: "Something the party can find out, and a clue that points to it.",
    question: "What is something the party could find out? Tell me the secret as you know it, who is hiding it and why, and any clue you already picture; I can help with the clues.",
    followUp: "Who knows this secret, and what would change if it came out? A place or an object where a trace of it would turn up helps.",
    placeholder: "The mayor's late wife is alive, and living in the lighthouse",
    draft: { mode: "secrets" }, canWrite: true,
  },
  {
    id: "questions", chapter: "secrets", title: "Open questions", hint: "What you leave open on purpose, to answer at the table.",
    question: "What are you leaving open on purpose, to answer at the table? Tell me what you wonder about your own world and what you would like to be surprised by. One question per line, as many as you like.",
    followUp: "What mystery would you like to decide only when a player guesses something clever? Tell me what you are unsure about, however small.",
    placeholder: "Who sank the first ship?\nWhat does the lamplighter really want?",
    draft: { mode: "questions" }, canWrite: true,
  },
  {
    id: "lore", chapter: "lore", title: "Lore", hint: "History, legends, faiths and ways, told in passages.",
    question: "Is there a piece of history, a legend or a faith the world should remember? Give it a title and tell me what you know: who it concerns, what happened and what people believe about it now.",
    followUp: "Who tells this story, and how do they get it wrong? A detail or two about the people or places involved will make the passage richer.",
    placeholder: "The Drowning: how the old kingdom went under, and who the survivors blame",
    draft: { mode: "lore" }, canWrite: true,
  },
  {
    id: "arcs", chapter: "arcs", title: "Arcs", hint: "The campaign's acts: what each asks and what is at stake.",
    question: "What are the big acts of your campaign? Tell me how you picture it unfolding, from the opening to the end, with what each act asks of the party and what is at stake. Rough is fine; more is better.",
    followUp: "How does the first act turn into the second? Tell me what the party will have learned or lost by then, and how you picture the ending.",
    placeholder: "Arrival in the harbour town\nThe lamps go out\nThe tide comes back",
    draft: { mode: "arcs" }, canWrite: true,
  },
  {
    id: "peoples", chapter: "peoples", title: "Peoples", hint: "Who lives in the world, and in what share.",
    question: "Who lives in your world? Name the peoples you can think of and say how common each is, where they live and how they get on with their neighbours. I can fill in what you leave out.",
    followUp: "Which people would a traveller meet most often, and which would be a surprise? Anything about their homes or customs helps.",
    placeholder: "Mostly humans, a good many halflings on the river, a few tieflings in the old quarter",
    draft: { mode: "peoples" }, canWrite: false,
  },
  {
    id: "habitats", chapter: "life", title: "Habitats", hint: "Kinds of country, and what lives in each.",
    question: "What kinds of country are there, and what lives in each? Tell me about the land, its weather and the creatures you would expect to meet there.",
    followUp: "Which place would you most want the party to cross? Describe it, and what makes it dangerous or beautiful.",
    placeholder: "Salt marsh with herons and eels, chalk downs with sheep and wolves",
    draft: null, noDraft: "Habitats are being reworked, so for now write them in their chapter or skip this one.", canWrite: false,
  },
  {
    id: "backstories", chapter: "backstories", title: "Backstories", hint: "Each character's past, written with their player.",
    question: "What do you want to remember about {name}'s past? Give me your own notes: where they came from, what they lost, who they owe and what they want. Their player writes the rest, and more notes from you make a better draft.",
    followUp: "What does {name} want, and what from their past would they rather nobody asked about? Any person or place from it helps.",
    placeholder: "Left the salt works after a flood. Owes money to someone in the harbour.",
    draft: { mode: "backstory" }, canWrite: true,
  },
];

/** The steps a DM may skip: all but the pitch. Held equal to the `canon_walk_skips_section` check in the database. */
export const WALK_SKIPPABLE: readonly WalkStepId[] = WALK_STEPS.filter((s) => s.id !== "pitch").map((s) => s.id);

export function isWalkStepId(value: unknown): value is WalkStepId {
  return WALK_STEPS.some((s) => s.id === value);
}

/** Everything the walk reads: the canon, and the counts of what is kept beside it. */
export interface WalkInput {
  entries: readonly CanonEntry[];
  clues: readonly CanonClue[];
  arcCount: number;
  peopleCount: number;
  habitatCount: number;
  /** The party: a backstory is one stop per character. */
  party: readonly WalkMember[];
  /** The characters the signed-in DM has written notes for (`membersNoted`). */
  notedIds: ReadonlySet<string>;
  skipped: ReadonlySet<WalkStepId>;
}

export interface WalkMember {
  id: string;
  name: string;
}

export interface WalkStep extends WalkStepDef {
  state: WalkState;
  /** How many entries the step holds, where it holds several (shown as "2 written"). */
  count?: number;
}

/** A passage as the walk reads it: which backstory entry, and who wrote it. */
export interface WalkPassage {
  entry_id: string;
  author_id: string | null;
}

/** The characters with at least one passage in their backstory written by `userId` (the DM's notes, not the player's). */
export function membersNoted(entries: readonly CanonEntry[], passages: readonly WalkPassage[], userId: string | null): Set<string> {
  if (userId === null) return new Set();
  const mine = new Set(passages.filter((p) => p.author_id === userId).map((p) => p.entry_id));
  const noted = new Set<string>();
  for (const e of entries) if (e.part === "backstory" && e.party_member_id !== null && mine.has(e.id)) noted.add(e.party_member_id);
  return noted;
}

/** A premise line or field is written when it has words, in its title or its body. */
function hasWords(e: CanonEntry): boolean {
  return e.title.trim() !== "" || tiptapToPlainText(e.body).trim() !== "";
}

function premiseWritten(entries: readonly CanonEntry[], kinds: readonly PremiseKind[]): number {
  return entries.filter((e) => e.part === "premise" && e.premise_kind !== null && kinds.includes(e.premise_kind) && hasWords(e)).length;
}

/** How many of a step's things the canon holds; a step is filled when it holds one (the backstories: every character's). */
function counted(id: WalkStepId, input: WalkInput): { filled: boolean; count?: number } {
  const { entries } = input;
  const ofPart = (part: CanonEntry["part"]) => entries.filter((e) => e.part === part).length;
  const many = (count: number) => ({ filled: count > 0, count });
  switch (id) {
    // A pitch is its body; one created empty by "Write the pitch" is not yet a pitch.
    case "pitch": return { filled: entries.some((e) => e.part === "premise" && e.premise_kind === "pitch" && tiptapToPlainText(e.body).trim() !== "") };
    case "themes": return many(premiseWritten(entries, ["theme"]));
    case "table": return many(premiseWritten(entries, ["table"]));
    case "voice": return { filled: premiseWritten(entries, ["voice"]) > 0 };
    case "look": return { filled: premiseWritten(entries, ["look"]) > 0 };
    case "lines": return many(premiseWritten(entries, ["line", "veil"]));
    case "truths": return many(ofPart("truth"));
    case "forces": return many(ofPart("force"));
    // The step is "a secret, with a clue": a secret nobody can find out does not fill it.
    case "secrets": {
      const clued = new Set(input.clues.map((c) => c.secret_id));
      return many(entries.filter((e) => e.part === "secret" && clued.has(e.id)).length);
    }
    case "questions": return many(ofPart("question"));
    case "lore": return many(ofPart("lore"));
    case "arcs": return many(input.arcCount);
    case "peoples": return many(input.peopleCount);
    case "habitats": return many(input.habitatCount);
    // A character's backstory is filled by the DM's own notes on it; the step is filled when every character has some.
    case "backstories": {
      const count = input.party.filter((m) => input.notedIds.has(m.id)).length;
      return { filled: input.party.length > 0 && count === input.party.length, count };
    }
  }
}

/** The walk, in order, each step with its state. A step written after it was skipped is filled. */
export function walkSteps(input: WalkInput): WalkStep[] {
  return WALK_STEPS.map((def) => {
    const { filled, count } = counted(def.id, input);
    const state: WalkState = filled ? "filled" : def.id !== "pitch" && input.skipped.has(def.id) ? "skipped" : "todo";
    return count === undefined ? { ...def, state } : { ...def, state, count };
  });
}

/** Where the walk resumes: the first step still to do, or null when every step is filled or skipped. */
export function firstOpenStep(steps: readonly WalkStep[]): WalkStepId | null {
  return steps.find((s) => s.state === "todo")?.id ?? null;
}

/** Why "Enhance with AI" is not offered on a step, or null when it is. A draft before the pitch would be written cold. */
export function draftHeldBecause(step: Pick<WalkStepDef, "draft" | "noDraft">, pitchWritten: boolean): string | null {
  if (step.draft === null) return step.noDraft ?? "The Familiar cannot draft this part yet, so write it yourself or skip it.";
  // The pitch is drafted from the DM's own words, so it is the one draft that never waits for a pitch.
  const draftsThePitch = step.draft.mode === "premise" && step.draft.kinds.includes("pitch");
  if (!pitchWritten && !draftsThePitch) return "Write the pitch first: every draft is written from it.";
  return null;
}

/** A place in the walk: a section, or one character in the backstories (`memberId` set only there). */
export interface WalkStopRef {
  step: WalkStepId;
  memberId: string | null;
  memberName: string | null;
}

export interface WalkStop extends WalkStopRef {
  state: WalkState;
}

export const sameStop = (a: WalkStopRef, b: WalkStopRef): boolean => a.step === b.step && a.memberId === b.memberId;
export const stopKey = (s: WalkStopRef): string => (s.memberId === null ? s.step : `${s.step}:${s.memberId}`);

export function stepOf(id: WalkStepId): WalkStepDef {
  const def = WALK_STEPS.find((s) => s.id === id);
  if (def === undefined) throw new Error(`Unknown walk step ${id}`);
  return def;
}

/** What the Familiar asks at a stop: the step's question, with a character's name where it holds one. */
export function questionOf(stop: WalkStopRef): string {
  return stepOf(stop.step).question.replace("{name}", stop.memberName ?? "this character");
}

/** What the Familiar asks to draw more out of a thin answer at a stop. */
export function followUpOf(stop: WalkStopRef): string {
  return stepOf(stop.step).followUp.replace("{name}", stop.memberName ?? "this character");
}

/** Fewer words than this and an answer is thin: the Familiar asks once more before it drafts (#1282). */
export const THIN_ANSWER_WORDS = 15;

/** Whether an answer gives the helper too little to go on: under fifteen words. */
export function isThin(answer: string): boolean {
  return answer.trim().split(/\s+/).filter((w) => w !== "").length < THIN_ANSWER_WORDS;
}

/**
 * The key a stop's proposals are kept under in `useCanonSuggestions` (and reviewed under, in `CanonReview`): one per
 * stop. Six premise steps share the premise helper, so a key per mode alone showed the Themes draft inside the Pitch's
 * block as well (a live run, 26 Nov 2026).
 */
export const walkScope = (stop: WalkStopRef): string => `walk:${stopKey(stop)}`;

/**
 * Every stop of the walk, in order: each step once, and the backstories once per character. A character is filled when
 * the DM has notes on them; skipping the backstories skips every character who has none.
 */
export function walkStops(steps: readonly WalkStep[], party: readonly WalkMember[], notedIds: ReadonlySet<string>): WalkStop[] {
  return steps.flatMap((s): WalkStop[] => {
    if (s.id !== "backstories") return [{ step: s.id, memberId: null, memberName: null, state: s.state }];
    return party.map((m) => ({
      step: s.id,
      memberId: m.id,
      memberName: m.name,
      state: notedIds.has(m.id) ? "filled" : s.state === "skipped" ? "skipped" : "todo",
    }));
  });
}

/** Entries beyond the premise past which a canon is established. */
export const ESTABLISHED_AT = 8;

/**
 * Whether the Canon invites the DM into the walk unasked: while the pitch is empty, or while the canon is still small
 * and has a step to do. An established canon with no pitch is invited too, because nothing else ever asks for one
 * (a real campaign, 25 Nov 2026, had themes, voice, look, truths and forces and no pitch).
 */
export function invitesWalk(entries: readonly CanonEntry[], steps: readonly WalkStep[]): boolean {
  const pitch = steps.find((s) => s.id === "pitch");
  if (pitch?.state === "todo") return true;
  return entries.filter((e) => e.part !== "premise").length < ESTABLISHED_AT && firstOpenStep(steps) !== null;
}

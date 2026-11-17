// How a character takes its turn at the AI-run table (#1021). The narrator never writes a character's words or
// deeds: it calls `speak`, and the server makes a separate small model call that holds only that one character's own
// record, its own memories and what happened in its presence. What a character must not say or do is never in its
// call, so there is nothing for it to leak. This file is the tool: the exchange that follows one line (who answers
// whom, who is keen enough to interject, what was kept back). The answer format is in `characterTurn.ts`, the
// hearing rules in `hearing.ts`. Pure: every read and the model call are injected.

import {
  characterTurn, heardLines, speakerSystem, type Remembered, type TurnAnswer,
} from "./characterTurn.ts";
import {
  answerEvent, hears, heardFrom, PLAYER_SPEAKER, storedEvents, trimHeard, unsaidBy, type SpeechEvent, type Who,
} from "./hearing.ts";
import { isPlayerName } from "./playerCharacter.ts";
import { ACT_TOOL, parseActInput, parseSpeakInput, SPEAK_TOOL } from "./speakInput.ts";
import type { StoredTurn } from "./transcript.ts";
import type { AgentLine, AgentUsage, AgentWithheld, CallModel } from "./types.ts";

/** How many listeners are asked whether they react to one line. A crowd does not all answer at once. */
export const MAX_REACTIONS = 3;
/** Answers that may follow the first line of one call, whoever gives them: so a call yields four lines at most. */
export const MAX_CHAINED_ANSWERS = 3;
/** One character answers this often in one exchange, the first line included, so two people cannot argue for ever. */
export const MAX_ANSWERS_PER_CHARACTER = 2;
/** A listener speaks only when it wants this much (of 5), and only the keenest does. */
export const WANT_TO_SPEAK = 4;
/** A listener who wanted this much and did not get the floor keeps what it meant to say. */
export const WANT_TO_KEEP = 3;
/** What a listener who answered without saying how much it wants is taken to want. */
export const WANT_UNGIVEN = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Which recorded character a bare name means, if any: the one whose shown name it is, or the only one whose shown
 * name holds every word of it ("Honeycomb" for "Apprentice Honeycomb"). Two candidates that both fit name nobody:
 * guessing between them would put words in the wrong mouth.
 */
export function pickRecorded(
  given: string,
  candidates: Array<{ id: string; shownName: string }>,
): { id: string; shownName: string } | null {
  const want = words(given);
  if (want.length === 0) return null;
  const exact = candidates.filter((c) => words(c.shownName).join(" ") === want.join(" "));
  // Two characters with the very same name fall through to the rule below, which names nobody.
  if (exact.length === 1) return exact[0];
  const holding = candidates.filter((c) => {
    const have = new Set(words(c.shownName));
    return want.every((w) => have.has(w));
  });
  return holding.length === 1 ? holding[0] : null;
}

type Speaker = { id: string; shownName: string; profile: string; memories: string };

export interface SpeechToolsDeps {
  /** The stored conversation before this turn. */
  stored: StoredTurn[];
  /** A character with a record: null when there is none in this campaign. `shownName` is the disguise name while disguised. `memories` is already formatted ("" for none). */
  loadSpeaker(id: string): Promise<Speaker | null>;
  callModel: CallModel;
  signal?: AbortSignal;
  /** Characters of this campaign whose shown name might be this one. The match itself is `pickRecorded`. */
  findRecorded?(name: string): Promise<Array<{ id: string; shownName: string }>>;
  /** A recorded character spoke or acted, so they are where the party is. */
  onSpoke?(characterId: string): void;
  /**
   * Called with what a recorded character chose to remember (maintainer, 16 Nov 2026: a character writes its own
   * memories, so they grow in its own voice). The caller stores it once the turn itself is kept.
   */
  onRemember?(memory: { characterId: string } & Remembered): void;
  /**
   * Answers that may follow the first line. Production leaves it alone (`MAX_CHAINED_ANSWERS`); a test raises it to
   * show the per-character limit holds on its own, which the default total never lets anyone reach.
   */
  maxChainedAnswers?: number;
  /**
   * The name of the character the player plays, when the conversation has one. Characters are told the player's words
   * and deeds under it instead of the fixed "The player's character", and a line addressed TO it is said to the player.
   */
  playerName?: string;
  /** The names of the world's peoples, told to every character as common knowledge. */
  peoples?: readonly string[];
}

export interface SpeechToolResult {
  content: string;
  isError: boolean;
  usage?: AgentUsage[];
  /** What the page shows, in order: a deed, then words, then the answers. */
  lines?: AgentLine[];
  /** What listeners kept back. Stored with the result for a later call; never shown. */
  withheld?: AgentWithheld[];
}

const failure = (content: string, usage?: AgentUsage[]): SpeechToolResult =>
  usage ? { content, isError: true, usage } : { content, isError: true };

/** Who a line was said to, as far as the code can tell. */
type Target =
  | { kind: "player" }
  | { kind: "everyone" }
  | { kind: "character"; id: string; name: string }
  | { kind: "none" };

/** One character's go in the exchange. */
interface Said {
  speaker: { id: string | null; name: string };
  did: string | null;
  said: string | null;
  /** How `said` is delivered; null when plainly. */
  how: string | null;
  target: Target;
}

/** What the page and the narrator are told a line was said to; null when nobody in particular. */
function targetName(t: Target): string | null {
  if (t.kind === "character") return t.name;
  return t.kind === "everyone" ? "everyone" : null;
}

function linesOf(s: Said): AgentLine[] {
  const lines: AgentLine[] = [];
  if (s.did) lines.push({ kind: "acted", speaker: s.speaker, text: s.did });
  if (s.said) {
    const to = targetName(s.target);
    lines.push({ kind: "spoken", speaker: s.speaker, text: s.said, ...(to ? { to } : {}), ...(s.how ? { how: s.how } : {}) });
  }
  return lines;
}

export function makeSpeechTools(deps: SpeechToolsDeps) {
  const playerName = deps.playerName ?? PLAYER_SPEAKER;
  const stored = storedEvents(deps.stored);
  // What this same turn produced so far: its rows are not stored yet, but a later call in the turn must hear them.
  const thisTurn: SpeechEvent[] = [];
  const allEvents = (): SpeechEvent[] => [...stored, ...thisTurn];

  // A name that belongs to a character with a record must not be played as someone with none. Seen live
  // (16 Nov 2026): the narrator guessed an id, was refused, fell back to speaker_name "Honeycomb", and the player
  // met a stand-in who knew nothing of the promise made to her the sitting before. A lookup that fails is treated
  // as "no such record": it must not cost the turn.
  async function recordedBy(name: string): Promise<{ id: string; shownName: string } | null> {
    if (!deps.findRecorded) return null;
    try {
      return pickRecorded(name, await deps.findRecorded(name));
    } catch {
      return null;
    }
  }
  const useTheRecord = (r: { id: string; shownName: string }): string =>
    `${r.shownName} has a record in this campaign. Call again with speaker_id "${r.id}" so they speak and remember as themselves.`;

  // A character is read once a turn however many lines it takes part in; one that cannot be read is simply absent.
  const records = new Map<string, Promise<Speaker | null>>();
  function recordOf(id: string): Promise<Speaker | null> {
    let found = records.get(id);
    if (!found) {
      found = deps.loadSpeaker(id).catch(() => null);
      records.set(id, found);
    }
    return found;
  }

  // Everyone with a record who has had a say this turn, asked or not. Claimed before any model call, so two
  // characters asked in the same round do not each wake the other as a bystander.
  const voices = new Set<string>();
  // Characters the narrator itself is asking right now. Another line's answer never wakes one of them: the two
  // calls would speak for the same person at once.
  const inFlight = new Map<string, number>();

  /** Who a character named after TO, among the recorded characters that heard the line. */
  async function resolveTarget(raw: string | null, event: SpeechEvent, selfId: string | null): Promise<Target> {
    if (raw === null) return { kind: "none" };
    const n = raw.trim().toLowerCase();
    if (n === "player") return { kind: "player" };
    if (n === "everyone") return { kind: "everyone" };
    const ids = [...new Set([...event.present, ...event.alsoHeardBy])].filter(
      (id) => UUID_RE.test(id) && id !== selfId && hears({ id, name: "" }, event, event.volume) === "words",
    );
    const found = (await Promise.all(ids.map(recordOf))).filter((r): r is Speaker => r !== null);
    const picked = pickRecorded(raw, found);
    if (picked) return { kind: "character", id: picked.id, name: picked.shownName };
    // After the recorded people, so a character who shares the player's first name is still reachable by it.
    return deps.playerName !== undefined && isPlayerName(raw, deps.playerName) ? { kind: "player" } : { kind: "none" };
  }

  /**
   * One character's answer to a line it heard: a call of its own, told what it heard through the hearing rules and
   * nothing of the narrator's. `nudge` says why it is being asked. A call that fails costs this voice only.
   */
  async function ask(record: Speaker, parent: SpeechEvent, nudge: string): Promise<{ record: Speaker; turn: TurnAnswer & { usage: AgentUsage } } | null> {
    try {
      const who: Who = { id: record.id, name: record.shownName };
      const heardNow = heardFrom([parent], who, playerName);
      // Someone who only saw that a whisper passed has nothing to answer.
      if (!heardNow.some((h) => h.kind === "spoken" && h.speaker !== playerName)) return null;
      const before = allEvents().filter((e) => e !== parent);
      const system = speakerSystem({
        name: record.shownName, profile: record.profile, manner: null, memories: record.memories,
        heard: trimHeard(heardFrom(before, who, playerName)), unsaid: unsaidBy(before, record.id),
        peoples: deps.peoples,
      });
      const turn = await characterTurn({
        callModel: deps.callModel, system, happening: `${heardLines(heardNow)}\n\n${nudge}`, signal: deps.signal,
      });
      return { record, turn };
    } catch {
      return null;
    }
  }

  /** Puts an answer on the record of the turn: heard by the room, remembered, and the character is where the party is. */
  async function commit(record: Speaker, turn: TurnAnswer, parent: SpeechEvent): Promise<Said> {
    const speaker = { id: record.id, name: record.shownName };
    // Heard by the one they answered and by everyone else who was listening. A whisper stays between those it reached.
    const first = parent.speakerId ?? parent.speakerName;
    const others = [first, ...parent.present].filter((p): p is string => p !== null && p !== record.id);
    const quiet = parent.volume === "whisper";
    const event = answerEvent({
      speakerId: record.id, present: others, lines: [],
      ...(quiet ? { volume: "whisper" as const, whisperedTo: [...parent.whisperedTo, ...(first ? [first] : [])].filter((p) => p !== record.id) } : {}),
    });
    const target = await resolveTarget(turn.to, event, record.id);
    const said: Said = { speaker, did: turn.did, said: turn.said, how: turn.how, target };
    event.lines = linesOf(said);
    thisTurn.push(event);
    voices.add(record.id);
    for (const memory of turn.remembered) deps.onRemember?.({ characterId: record.id, ...memory });
    deps.onSpoke?.(record.id);
    return said;
  }

  const answered = (a: { turn: TurnAnswer } | null): boolean => a !== null && (a.turn.said !== null || a.turn.did !== null);
  const wantOf = (turn: TurnAnswer): number => turn.want ?? WANT_UNGIVEN;

  /**
   * The people listening get a say of their own (maintainer, 17 Nov 2026: conversations should flow naturally,
   * characters "might seek each other even with the player there", and the player should "feel part of a group").
   * Until this, nobody spoke unless the narrator asked them, so a room of three was three interviews. Each
   * recorded character who heard the line is asked, in a call of their own, whether they say or do anything and how
   * much they want to. Only the keenest speaks (and only if they want it a lot); a listener who had something to say
   * and lost the floor keeps it for a later call. A listener is asked once a turn.
   */
  async function reactions(event: SpeechEvent): Promise<{ winner: { record: Speaker; turn: TurnAnswer } | null; withheld: AgentWithheld[]; usage: AgentUsage[] }> {
    const asked = event.present.filter((p) => UUID_RE.test(p) && !voices.has(p)).slice(0, MAX_REACTIONS);
    for (const id of asked) voices.add(id);
    const answers = await Promise.all(asked.map(async (id) => {
      const record = await recordOf(id);
      if (!record) return null;
      return ask(
        record, event,
        `Nobody spoke to you. People who are listening mostly say nothing: then answer DOES: - and SAYS: -. ` +
          `Speak or act only if you truly would: to object, to add what only you know, to tease, to back someone up, ` +
          `to ask the speaker something. Say it to them by name after TO. Also answer WANT: a number from 1 (it can ` +
          `wait) to 5 (you cannot let it pass) for how much you want to say it now.`,
      );
    }));
    const usage = answers.flatMap((a) => (a ? [a.turn.usage] : []));
    const speaking = answers.filter((a): a is NonNullable<typeof a> => answered(a));
    // Strictly greater, so a tie goes to whoever comes first in `present`.
    let winner: (typeof speaking)[number] | null = null;
    for (const a of speaking) {
      if (wantOf(a.turn) >= WANT_TO_SPEAK && (winner === null || wantOf(a.turn) > wantOf(winner.turn))) winner = a;
    }
    const withheld: AgentWithheld[] = [];
    for (const a of speaking) {
      if (a === winner || a.turn.said === null || wantOf(a.turn) < WANT_TO_KEEP) continue;
      const to = targetName(await resolveTarget(a.turn.to, event, a.record.id));
      withheld.push({ speaker: { id: a.record.id, name: a.record.shownName }, text: a.turn.said, to });
    }
    return { winner, withheld, usage };
  }

  async function speak(raw: Record<string, unknown>): Promise<SpeechToolResult> {
    const parsed = parseSpeakInput(raw);
    if (!parsed.ok) return failure(parsed.error);
    const input = parsed.value;
    if (input.id) voices.add(input.id);

    let who: Who;
    let shownName: string;
    let profile: string | null = null;
    let memories = "";
    if (input.id) {
      // Read directly, not through the quiet lookup: a database that is down must fail the call, not read as "no such character".
      const record = await deps.loadSpeaker(input.id);
      if (record) records.set(input.id, Promise.resolve(record));
      if (!record) {
        return failure("No character with that speaker_id exists in this campaign. Use speaker_name for someone with no record, or look the character up first.");
      }
      who = { id: record.id, name: record.shownName };
      shownName = record.shownName;
      profile = record.profile;
      memories = record.memories;
    } else {
      const recorded = await recordedBy(input.name as string);
      if (recorded) return failure(useTheRecord(recorded));
      shownName = input.name as string;
      who = { id: null, name: shownName };
    }

    // Counted for as long as this call runs, so no other line's answer speaks for this character meanwhile.
    if (input.id) inFlight.set(input.id, (inFlight.get(input.id) ?? 0) + 1);
    try {
      const everything = allEvents();
      const system = speakerSystem({
        name: shownName, profile, manner: input.manner, memories,
        heard: trimHeard(heardFrom(everything, who, playerName)),
        unsaid: who.id ? unsaidBy(everything, who.id) : [],
        peoples: deps.peoples,
      });
      const turn = await characterTurn({ callModel: deps.callModel, system, happening: input.happening, signal: deps.signal });
      if (!turn.said && !turn.did) return failure(`${shownName} neither says nor does anything.`, [turn.usage]);

      // Only a character with a record has a ledger to keep it in, and only a turn in which it did or said
      // something is a moment that happened.
      if (who.id) for (const memory of turn.remembered) deps.onRemember?.({ characterId: who.id, ...memory });

      const speaker = { id: who.id, name: shownName };
      const event: SpeechEvent = {
        speakerId: input.id,
        speakerName: input.name ?? (input.id ? null : shownName),
        present: input.present,
        happening: input.happening,
        playerSaid: input.playerSaid,
        playerVolume: input.playerVolume,
        volume: input.volume,
        whisperedTo: input.whisperedTo,
        alsoHeardBy: input.alsoHeardBy,
        carried: input.via !== null,
        lines: [],
        withheld: [],
      };
      const first: Said = { speaker, did: turn.did, said: turn.said, how: turn.how, target: await resolveTarget(turn.to, event, who.id) };
      event.lines = linesOf(first);
      thisTurn.push(event);
      if (who.id) deps.onSpoke?.(who.id);

      const exchange: Said[] = [first];
      const usage: AgentUsage[] = [turn.usage];
      const counts = new Map<string, number>();
      if (who.id) counts.set(who.id, 1);
      let chained = 0;
      let cursor: { said: Said; event: SpeechEvent } = { said: first, event };

      // Said to nobody in particular, or to the player: whoever is keen enough may cut in, once.
      if (first.target.kind !== "character") {
        const r = await reactions(event);
        usage.push(...r.usage);
        event.withheld = r.withheld;
        if (r.winner) {
          const said = await commit(r.winner.record, r.winner.turn, event);
          exchange.push(said);
          counts.set(r.winner.record.id, (counts.get(r.winner.record.id) ?? 0) + 1);
          chained++;
          cursor = { said, event: thisTurn[thisTurn.length - 1] };
        }
      }

      // Said to someone who heard it: they answer now, by code, with no round trip to the narrator. The chain ends
      // when a line is said to anyone else, at the limits, or when the one addressed would rather say nothing.
      while (cursor.said.target.kind === "character" && chained < (deps.maxChainedAnswers ?? MAX_CHAINED_ANSWERS)) {
        const addressee = cursor.said.target;
        if ((counts.get(addressee.id) ?? 0) >= MAX_ANSWERS_PER_CHARACTER) break;
        if ((inFlight.get(addressee.id) ?? 0) > (addressee.id === who.id ? 1 : 0)) break;
        const record = await recordOf(addressee.id);
        if (!record) break;
        chained++;
        counts.set(addressee.id, (counts.get(addressee.id) ?? 0) + 1);
        voices.add(addressee.id);
        const reply = await ask(
          record, cursor.event,
          // Seen live (17 Nov 2026): told simply to answer, characters thanked and agreed with each other in a
          // loop ("Thank you, Master Cantor. I will listen carefully."). Real people let agreement go unsaid.
          `${cursor.said.speaker.name} said this to you. Answer only if you have something to add: an objection, a ` +
            `fact, a question, a decision, a different view. If all you would do is agree, thank them or repeat what ` +
            `was said, say nothing: answer DOES: - and SAYS: -. A nod needs no words. If you answer, put after TO the ` +
            `name of the one you are answering.`,
        );
        if (!reply) break;
        usage.push(reply.turn.usage);
        if (!answered(reply)) break;
        const said = await commit(record, reply.turn, cursor.event);
        exchange.push(said);
        cursor = { said, event: thisTurn[thisTurn.length - 1] };
      }

      const withheld = event.withheld;
      // The narrator reads both parts to judge what comes of the deed. The note sits where the narrator is about to
      // write: told only in its standing rules, it twice repeated a character's line in its own words (live, 16 Nov 2026).
      const shown = "The player has already been shown all of this, word for word. Do not repeat, quote or paraphrase it.";
      const content = JSON.stringify({
        ended: cursor.said.target.kind === "player" ? "to_player" : "open",
        exchange: exchange.map((s) => ({ who: s.speaker.name, to: s.target.kind === "player" ? "player" : targetName(s.target), did: s.did, said: s.said })),
        shown,
      });
      return {
        content,
        isError: false,
        usage,
        lines: exchange.flatMap(linesOf),
        ...(withheld.length > 0 ? { withheld } : {}),
      };
    } finally {
      if (input.id) {
        const left = (inFlight.get(input.id) ?? 1) - 1;
        if (left > 0) inFlight.set(input.id, left);
        else inFlight.delete(input.id);
      }
    }
  }

  async function act(raw: Record<string, unknown>): Promise<SpeechToolResult> {
    const parsed = parseActInput(raw);
    if (!parsed.ok) return failure(parsed.error);
    const input = parsed.value;
    // A character with a record decides its own deeds, and the narrator knows secrets that character does not.
    if (input.id) {
      return failure("A character with a record decides its own deeds. Call speak for this character, and describe what comes of what they try. act is only for someone with no record.");
    }
    const recorded = await recordedBy(input.name as string);
    if (recorded) return failure(useTheRecord(recorded));
    const line: AgentLine = { kind: "acted", speaker: { id: null, name: input.name as string }, text: input.what };
    thisTurn.push(answerEvent({ speakerId: null, speakerName: input.name, present: input.present, lines: [line] }));
    return { content: "Shown.", isError: false, lines: [line] };
  }

  return {
    tools: [SPEAK_TOOL, ACT_TOOL],
    async call(name: string, input: Record<string, unknown>): Promise<SpeechToolResult> {
      if (name === SPEAK_TOOL.name) return speak(input);
      if (name === ACT_TOOL.name) return act(input);
      return failure(`Unknown tool ${name}.`);
    },
  };
}

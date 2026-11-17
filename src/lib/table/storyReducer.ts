import type { BoardLine } from "./fight/boardLines";
import type { PlayMode, StoryItem, TableEvent } from "./soloTypes";

/** What a tool's name becomes on the page: one quiet line naming the kind of thing, never its result. */
const TOOL_NOTE: Record<string, string> = {
  search: "Looked something up",
  get: "Looked something up",
  list: "Looked something up",
  campaign_overview: "Looked something up",
  // No line for `roll`: an open roll arrives as its own `dm_roll`, and a hidden one must not show that it happened.
};

/**
 * Tool use as a margin note (Turn frame, "The quiet lines": they name what was looked up or rolled for, never what it
 * said, because the answer can hold things the character has not found yet). Everything else a tool does (`speak`,
 * `act`, `go_to`, `record`, the quest tools) arrives as its own event, so it gets no line of its own.
 */
export function toolNote(name: string): string | null {
  return TOOL_NOTE[name] ?? null;
}

let counter = 0;
/** An id for a live item. Stored items get theirs from their row, so a reload draws the same keys. */
export function nextItemId(): string {
  counter += 1;
  return `live-${counter}`;
}

/** A line from the board of a fight as a story item. */
export function boardItem(line: BoardLine, byServer: boolean, id: string = nextItemId()): StoryItem {
  if (line.kind === "margin") return { id, kind: "margin", text: line.text, count: 1, ...(line.tone ? { tone: line.tone } : {}) };
  return { id, kind: "board", total: line.die, title: line.label, detail: line.detail, critical: line.critical, byServer };
}

export function playerItem(mode: PlayMode, text: string, id: string = nextItemId()): StoryItem {
  return { id, kind: "player", mode, text };
}

function withMargin(items: StoryItem[], text: string): StoryItem[] {
  const last = items[items.length - 1];
  // Four searches in a row are one quiet line, not four: the page is a manuscript, not a log.
  if (last?.kind === "margin" && last.text === text) {
    return [...items.slice(0, -1), { ...last, count: last.count + 1 }];
  }
  return [...items, { id: nextItemId(), kind: "margin", text, count: 1 }];
}

/**
 * One event applied to the story so far. Pure: the same items and event always give the same result.
 * `session`, `ask_roll`, `done` and `error` carry no story of their own; the turn composable reads them.
 * The roll the turn was sent with goes in at `turnStart`, before the player's own words, as a stored turn draws it.
 */
export function applyTableEvent(items: StoryItem[], event: TableEvent, turnStart: number = items.length): StoryItem[] {
  switch (event.type) {
    case "text": {
      const last = items[items.length - 1];
      // Narration streams as small deltas: they join the paragraph being written. A line, a margin note or the
      // player's move in between ends it, so what comes next starts a new one.
      if (last?.kind === "narration") return [...items.slice(0, -1), { ...last, text: last.text + event.delta }];
      return [...items, { id: nextItemId(), kind: "narration", text: event.delta }];
    }
    case "tool_start": {
      const note = toolNote(event.name);
      return note === null ? items : withMargin(items, note);
    }
    case "line": {
      const { kind, speaker, text, to, how } = event.line;
      const id = nextItemId();
      if (kind !== "spoken") return [...items, { id, kind, speaker, text, ...(event.voice === undefined ? {} : { voice: { key: event.voice } }) }];
      const voice = event.voice === undefined ? {} : { voice: { how: how === undefined ? null : how, key: event.voice } };
      return [...items, { id, kind, speaker, text, ...(to !== undefined ? { to } : {}), ...voice }];
    }
    case "voice": {
      // The key goes on the thing it voices: the narration being written, or the line the player just said.
      const kind = event.role === "narrator" ? "narration" : "player";
      let at = items.length - 1;
      while (at >= 0 && items[at].kind !== kind) at -= 1;
      const target = items[at];
      if (target === undefined) return items;
      if (target.kind === "narration") {
        const voices = [...(target.voices === undefined ? [] : target.voices), { text: event.text, key: event.key }];
        return [...items.slice(0, at), { ...target, voices }, ...items.slice(at + 1)];
      }
      if (target.kind === "player" && target.mode === "say") return [...items.slice(0, at), { ...target, voice: { key: event.key } }, ...items.slice(at + 1)];
      return items;
    }
    case "hands":
      return withMargin(items, event.text);
    case "hit_points": {
      const { heals, why, by, hp, maxHp } = event.change;
      const moved = by === 0 ? "no hit points" : `${heals ? "+" : "−"}${by} hit points`;
      return withMargin(items, `${why}: ${moved} · ${hp} of ${maxHp}`);
    }
    case "introduced":
      return withMargin(items, `${event.name} is now among the people you know`);
    case "fight": {
      if (event.fight !== null) return withMargin(items, `A fight begins: ${event.fight.name}`);
      if (event.calledOff) return withMargin(items, "The fight is called off");
      // The board has already written how the fight ended (a line toned as an end) before the aftermath was
      // told: saying it is over a second time, under the aftermath, adds nothing.
      let at = items.length - 1;
      while (at >= 0) {
        const item = items[at];
        if (item.kind === "margin" && item.text.startsWith("A fight begins")) break;
        if (item.kind === "margin" && item.tone === "end") return items;
        at -= 1;
      }
      return withMargin(items, "The fight is over");
    }
    case "dm_roll":
      return [...items, { id: nextItemId(), kind: "dmRoll", roll: event.roll }];
    case "rolled":
      return [...items.slice(0, turnStart), { id: nextItemId(), kind: "roll", roll: event.roll }, ...items.slice(turnStart)];
    case "scene":
      return withMargin(items, `The party is at ${event.scene.name}`);
    case "fact":
      // Not a line of the story: it is listed under "On record" in the scene column (`SoloScene`).
      return [...items, { id: nextItemId(), kind: "margin", text: event.fact.body, count: 1, record: true }];
    default:
      return items;
  }
}

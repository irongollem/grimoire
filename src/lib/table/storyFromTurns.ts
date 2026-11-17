import { parseDmRoll } from "./dmRoll";
import { parseTableLine } from "./readTableStream";
import { parseRolled } from "./tableRoll";
import { boardItem } from "./storyReducer";
import type { KeptLine } from "./boardKeep";
import type { StoryItem } from "./soloTypes";

/** A stored `agent_turns` row, as far as the page needs it. `blocks` is jsonb, so it is untrusted until read. */
export interface StoredTurn {
  seq: number;
  role: string;
  blocks: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A stored conversation redrawn as the page it was. The rules are narrow on purpose, because a stored row also holds
 * what the model was told and what its tools answered, and some of that is the DM's alone:
 *
 * - a `user` text block WITH a `player` field is the player's move: its `player.text`, said or done. The block's own
 *   `text` is wording written for the model and is never drawn;
 * - a `user` text block's `roll` is the player's roll, drawn before their words;
 * - an `assistant` text block that is not `unshown` is narration (an `unshown` one was judged to only repeat what a
 *   character had just said, and the player never saw it);
 * - a `tool_result` block's `lines` are characters' lines, in order.
 *
 * Nothing else is drawn: not a tool call's input, not a tool result's other content, not the opaque blocks.
 *
 * `kept` is what the board of a fight wrote (`boardKeep`, `agent_board_lines`): each line goes back after the turns that
 * had been kept when it was written, so a fight reads in the order it was fought.
 */
export function storyFromTurns(turns: readonly StoredTurn[], kept: readonly KeptLine[] = []): StoryItem[] {
  const items: StoryItem[] = [];
  const ordered = [...turns].sort((a, b) => a.seq - b.seq);
  let started = 0;
  let next = 0;
  // The board's lines written after `upTo` turns or fewer, in the order they were written.
  const board = (upTo: number): void => {
    for (; next < kept.length && kept[next].after <= upTo; next += 1) items.push(boardItem(kept[next].line, kept[next].byServer, `board-${next}`));
  };
  for (const turn of ordered) {
    if (startsTurn(turn)) {
      board(started);
      started += 1;
    }
    if (!Array.isArray(turn.blocks)) continue;
    turn.blocks.forEach((block: unknown, index: number) => {
      if (!isRecord(block)) return;
      const id = `turn-${turn.seq}-${index}`;
      if (block.type === "text" && turn.role === "user") {
        // A roll sent without words has no `player`: the roll line stands alone. With words it comes first, as played.
        const rolled = parseRolled(block.roll);
        if (rolled !== null) items.push({ id: `${id}-roll`, kind: "roll", roll: rolled });
        const player = block.player;
        if (isRecord(player) && (player.kind === "say" || player.kind === "do" || player.kind === "ask") && typeof player.text === "string" && player.text.trim() !== "") {
          items.push({ id, kind: "player", mode: player.kind, text: player.text });
        }
      } else if (block.type === "text" && turn.role === "assistant") {
        if (block.unshown !== true && typeof block.text === "string" && block.text.trim() !== "") {
          items.push({ id, kind: "narration", text: block.text });
        }
      } else if (block.type === "tool_result") {
        // The Dungeon Master's open roll comes before whatever the same call showed, as it did live.
        const dmRoll = parseDmRoll(block.dmRoll);
        if (dmRoll !== null) items.push({ id: `${id}-dm`, kind: "dmRoll", roll: dmRoll });
        if (!Array.isArray(block.lines)) return;
        block.lines.forEach((raw: unknown, lineIndex: number) => {
          const line = parseTableLine(raw);
          if (line === null) return;
          const lineId = `${id}-${lineIndex}`;
          if (line.kind === "spoken") items.push({ id: lineId, kind: "spoken", speaker: line.speaker, text: line.text, ...(line.to !== undefined ? { to: line.to } : {}) });
          else items.push({ id: lineId, kind: "acted", speaker: line.speaker, text: line.text });
        });
      }
    });
  }
  board(Number.POSITIVE_INFINITY);
  return items;
}

/** A turn of the sitting begins with what was sent to the Dungeon Master: a `user` row that is not a tool's answer. */
function startsTurn(turn: StoredTurn): boolean {
  return turn.role === "user" && Array.isArray(turn.blocks) && turn.blocks.some((block: unknown) => isRecord(block) && block.type === "text");
}

/** How many turns a stored sitting holds: where the board's next line belongs. */
export function turnsStarted(turns: readonly StoredTurn[]): number {
  return turns.filter(startsTurn).length;
}

/** What went on the record in a stored conversation. Kept among the items, listed in the scene column and not in the story. */
export function factItems(facts: readonly { id: string; body: string }[]): StoryItem[] {
  return facts.map((f) => ({ id: `fact-${f.id}`, kind: "margin", text: f.body, count: 1, record: true }));
}

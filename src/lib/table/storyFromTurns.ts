import { parseTableLine } from "./readTableStream";
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
 * - an `assistant` text block that is not `unshown` is narration (an `unshown` one was judged to only repeat what a
 *   character had just said, and the player never saw it);
 * - a `tool_result` block's `lines` are characters' lines, in order.
 *
 * Nothing else is drawn: not a tool call's input, not a tool result's other content, not the opaque blocks.
 */
export function storyFromTurns(turns: readonly StoredTurn[]): StoryItem[] {
  const items: StoryItem[] = [];
  const ordered = [...turns].sort((a, b) => a.seq - b.seq);
  for (const turn of ordered) {
    if (!Array.isArray(turn.blocks)) continue;
    turn.blocks.forEach((block: unknown, index: number) => {
      if (!isRecord(block)) return;
      const id = `turn-${turn.seq}-${index}`;
      if (block.type === "text" && turn.role === "user") {
        const player = block.player;
        if (isRecord(player) && (player.kind === "say" || player.kind === "do") && typeof player.text === "string") {
          items.push({ id, kind: "player", mode: player.kind, text: player.text });
        }
      } else if (block.type === "text" && turn.role === "assistant") {
        if (block.unshown !== true && typeof block.text === "string" && block.text.trim() !== "") {
          items.push({ id, kind: "narration", text: block.text });
        }
      } else if (block.type === "tool_result" && Array.isArray(block.lines)) {
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
  return items;
}

/** What went on the record in a stored conversation, as margin notes. */
export function factItems(facts: readonly { id: string; body: string }[]): StoryItem[] {
  return facts.map((f) => ({ id: `fact-${f.id}`, kind: "margin", text: `On record: ${f.body}`, count: 1 }));
}

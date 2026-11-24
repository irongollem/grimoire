// The Familiar's last conversation, brought back after a reload (maintainer, 25 Nov 2026: "a user should be able to go
// back"). The server keeps every turn (`agent_turns`); this turns them back into what the panel shows: the DM's own
// messages and Ooru's replies. Cards that were mid-way (a quote waiting for a yes, a held preview) are not brought back
// as live buttons: a charge or a generation is never re-run from an old page, so they stay in the record only.
//
// Pure: no I/O.

/** A stored turn as `agent_turns` keeps it. */
export interface StoredTurn {
  role: string;
  blocks: unknown;
}

/** What the panel shows of a past conversation, in order. */
export type RestoredItem = { kind: "user"; text: string } | { kind: "reply"; text: string };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The DM's messages and Ooru's replies, in order. A reply is the join of the assistant's text blocks up to the DM's
 * next message, across tool calls, as the live panel joined them (so Read again finds the clip kept for it). A block
 * marked `unshown` was never on screen and stays out; a user turn of tool results alone is not the DM speaking.
 */
export function restoredItems(turns: readonly StoredTurn[]): RestoredItem[] {
  const out: RestoredItem[] = [];
  let reply: string | null = null;
  const closeReply = () => {
    if (reply !== null && reply.trim() !== "") out.push({ kind: "reply", text: reply });
    reply = null;
  };
  for (const turn of turns) {
    if (!Array.isArray(turn.blocks)) continue;
    for (const block of turn.blocks) {
      if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
      if (turn.role === "user") {
        closeReply();
        if (block.text.trim() !== "") out.push({ kind: "user", text: block.text });
      } else if (turn.role === "assistant" && block.unshown !== true) {
        reply = (reply ?? "") + block.text;
      }
    }
  }
  closeReply();
  return out;
}

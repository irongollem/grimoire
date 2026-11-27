/**
 * What the DM told the Familiar in an interview (#1282, story 8b), as the text the document import reads. One place
 * makes it, so the pane's "Turn this into my canon" button and the model's `import_story` proposal hand over the same
 * words: the DM's messages verbatim, each after the Familiar's question it answered, in order. Handing it to the
 * import's paste step is `offerToldStory` in `composables/ask/useAskInterview.ts` (a store write, which `lib/` may not make).
 */
import type { AskItem } from "@/composables/ask/askItems";

/** The screen the told story is offered to, and where it lives. */
export const IMPORT_SCREEN_ID = "document_import";
export const IMPORT_PATH = "/canon/import";
export const TOLD_STORY_NAME = "Told to the Familiar";

/** Whether the DM has written at least one message in the interview that began at item `from`. */
export function hasTold(items: readonly AskItem[], from: number): boolean {
  return items.some((i) => i.kind === "user" && i.id >= from);
}

/**
 * The interview's thread from item `from` on as plain text: "The Familiar asked: …" then "I said: …" for every message
 * of the DM's. Walk items, results, reads and errors are left out; the Familiar's words since the DM's last message
 * (a reply, a question) are the question the next message answered. Null until the DM has said something.
 */
export function composeStory(items: readonly AskItem[], from: number): string | null {
  const parts: string[] = [];
  let asked: string[] = [];
  for (const item of items) {
    if (item.id < from) continue;
    if (item.kind === "reply" && item.text.trim() !== "") asked.push(item.text.trim());
    else if (item.kind === "ask") asked.push(item.question.trim());
    else if (item.kind === "user") {
      if (asked.length > 0) parts.push(`The Familiar asked: ${asked.join("\n\n")}`);
      parts.push(`I said: ${item.text.trim()}`);
      asked = [];
    }
  }
  return parts.length === 0 ? null : parts.join("\n\n");
}

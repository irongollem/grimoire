// The small markdown subset Ask's replies are drawn in: paragraphs, line breaks, **bold**, *italic*, bullet and numbered
// lists. Parsed into plain data, never into HTML, so the component draws text nodes and a model's `<script>` or
// `<img onerror>` stays visible text. Links, code and headings are deliberately not recognised and show as written.

export interface AskRun {
  text: string;
  bold: boolean;
  italic: boolean;
}
/** One line: its runs. */
export type AskLine = AskRun[];
export type AskBlock =
  | { kind: "paragraph"; lines: AskLine[] }
  | { kind: "ul" | "ol"; items: AskLine[] };

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/;

export function askInline(line: string): AskLine {
  const runs: AskRun[] = [];
  for (const part of line.split(INLINE)) {
    if (part === "") continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) runs.push({ text: part.slice(2, -2), bold: true, italic: false });
    else if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) runs.push({ text: part.slice(1, -1), bold: false, italic: true });
    else runs.push({ text: part, bold: false, italic: false });
  }
  return runs;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseAskMarkdown(text: string): AskBlock[] {
  const blocks: AskBlock[] = [];
  // The block a following line may continue; a blank line closes it.
  let open: AskBlock | null = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (raw.trim() === "") {
      open = null;
      continue;
    }
    const bullet = BULLET.exec(raw);
    const numbered = bullet ? null : NUMBERED.exec(raw);
    const match = bullet ?? numbered;
    if (match) {
      const kind = bullet ? "ul" : "ol";
      if (open !== null && open.kind === kind) open.items.push(askInline(match[1]));
      else {
        open = { kind, items: [askInline(match[1])] };
        blocks.push(open);
      }
    } else if (open !== null && open.kind === "paragraph") {
      open.lines.push(askInline(raw.trim()));
    } else {
      open = { kind: "paragraph", lines: [askInline(raw.trim())] };
      blocks.push(open);
    }
  }
  return blocks;
}

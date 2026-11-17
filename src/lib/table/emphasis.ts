/** A run of narration: plain, or set off the way the writer marked it. */
export interface TextRun {
  text: string;
  strong: boolean;
  em: boolean;
}

/**
 * The narrator's text as runs of plain, strong and emphasised print. A model writes `**The Middle**` or `*softly*`
 * however it is told not to, and printed raw the stars sit in the middle of the page. Only those two marks are read;
 * a lone star, or stars around nothing, are left as they were written. No HTML is produced: the page prints each run
 * as text, so nothing the model writes can become markup.
 */
export function emphasisRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Strong first (two stars), then single stars or underscores around words that do not start or end with a space.
  const pattern = /\*\*([^*\n]+?)\*\*|\*([^*\s][^*\n]*?[^*\s]|[^*\s])\*|\b_([^_\s][^_\n]*?[^_\s]|[^_\s])_\b/g;
  let at = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index;
    if (start > at) runs.push({ text: text.slice(at, start), strong: false, em: false });
    if (m[1] !== undefined) runs.push({ text: m[1], strong: true, em: false });
    else runs.push({ text: (m[2] ?? m[3]) as string, strong: false, em: true });
    at = start + m[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), strong: false, em: false });
  return runs;
}

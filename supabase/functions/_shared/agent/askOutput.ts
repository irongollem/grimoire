// The last guard on what Ask says (#1253): an answer that is code is withheld. The scope judgement (`askScope.ts`)
// and the standing instructions (`askPrompt.ts`) come first; this is the one that does not depend on a model, so an
// instruction attack that got past both still cannot turn a campaign tool into a coding tool. Deterministic and cheap
// on purpose: it looks for the shape of code, never for topics.
//
// What it must not catch: a stat block (numbers, colons, parentheses, "+5"), a markdown list, a table of loot, a line
// of dialogue with an equals sign in a house-rule formula. Prose has long lines of words; code has short lines of
// symbols, so it is the share of code-looking lines in a text with enough lines to judge that decides, and a fenced
// block of real code decides it alone.

import { ASK_OFF_TOPIC_MESSAGE } from "./askContract.ts";

/** A fenced block whose body looks like code (or names a language) is enough alone. */
const FENCE = /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g;
/** Languages that mark a fence as code whatever is in it. A bare fence (a stat block, a table) is judged by its lines. */
const CODE_LANGUAGES = new Set([
  "js", "javascript", "ts", "typescript", "tsx", "jsx", "py", "python", "java", "c", "cpp", "c++", "cs", "csharp", "go", "rust", "rs",
  "ruby", "rb", "php", "swift", "kotlin", "sql", "bash", "sh", "shell", "zsh", "powershell", "html", "css", "json", "yaml", "yml", "xml",
  "vue", "lua", "perl", "r", "scala", "dart",
]);

/** Syntax that appears at the start or end of a code line and almost never in a sentence. */
const CODE_LINE = [
  /^\s*from\s+[\w.]+\s+import\s/,
  /^\s*import\s+[\w.{*,\s"'/@-]+(?:from\s+["'][^"']+["'])?;?\s*$/,
  /^\s*export\s+(?:default|const|function|class|type|interface|async)\b/,
  // Python: a block opener ends in a colon, and starts with a keyword in lower case (prose capitalises or says more).
  /^\s*(?:def|class|if|elif|else|for|while|try|except|finally|with)\b.*:\s*$/,
  /^\s*(?:pass|break|continue)\s*$/,
  /^\s*return(?:\s+[\w([{"'-].*)?$/,
  /^\s*(?:def|class|function|async function|fn|func|public|private|protected|static|const|let|var|using|namespace|package|#include|#define)\s+[\w<(*]/,
  /^\s*(?:if|for|while|switch|foreach)\s*\(.*\)\s*\{?\s*$/,
  /^\s*(?:return|throw|print|console\.log|System\.out\.println|printf|echo)\b.*[;)]\s*$/,
  /=>/,
  /^\s*[\w.\][]+\s*(?:=|\+=|-=)\s*[^=\s].*;\s*$/,
  /^\s*[{}()[\];]+\s*,?\s*$/,
  /;\s*$/,
  /\{\s*$/,
  /^\s*(?:SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE)\b/i,
  /^\s*<\/?[a-z][\w-]*(?:\s[^>]*)?>\s*$/i,
];

/** Fewer lines than this and a share of them says nothing (a one-line answer cannot be "mostly code"). */
const MIN_LINES = 4;
/** More than this share of the non-empty lines looking like code makes the text code. */
const CODE_SHARE = 0.5;

function lineLooksLikeCode(line: string): boolean {
  // A sentence of words is prose even if it ends with a semicolon: code lines are short on words.
  const words = line.trim().split(/\s+/).filter((w) => /^[A-Za-z]{3,}$/.test(w)).length;
  if (words >= 9) return false;
  return CODE_LINE.some((re) => re.test(line));
}

/** The share of non-empty lines that look like code, and how many lines there were. */
function codeShare(text: string): { share: number; lines: number } {
  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { share: 0, lines: 0 };
  return { share: lines.filter(lineLooksLikeCode).length / lines.length, lines: lines.length };
}

/** True when the text is code, or mostly code: the answer is withheld. */
export function looksLikeCode(text: string): boolean {
  for (const match of text.matchAll(FENCE)) {
    const language = match[1].toLowerCase();
    const body = match[2];
    if (CODE_LANGUAGES.has(language)) return true;
    const { share, lines } = codeShare(body);
    if (lines >= 2 && share >= CODE_SHARE) return true;
  }
  const { share, lines } = codeShare(text);
  return lines >= MIN_LINES && share > CODE_SHARE;
}

export interface OutputVerdict {
  /** What is stored and what the browser is told: the answer, or the one sentence that replaces it. */
  text: string;
  withheld: boolean;
}

export function checkOutput(text: string): OutputVerdict {
  return looksLikeCode(text) ? { text: ASK_OFF_TOPIC_MESSAGE, withheld: true } : { text, withheld: false };
}

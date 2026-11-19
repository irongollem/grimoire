// A note read aloud (#1021 row 19): what of a note is spoken, in what pieces, and where the recording is kept.
// Pure: no I/O.
//
// A session note is a page of text, far longer than a line at the table (the maintainer's own run from a few
// hundred words to several thousand), and a speech service takes a limited stretch at a time. So the text is
// spoken in pieces, cut where a reader would breathe (between paragraphs, else between sentences), and the pieces
// are joined into one recording.

import { noteReadingPrefix } from "./agent/voiceClips.ts";

/** The longest stretch handed to a speech service at once. Both services take more; a shorter piece fails cheaper. */
export const READING_PIECE_CHARS = 1400;
/** The longest note read in one go: about a quarter of an hour of speech. A longer one is refused, not cut short. */
export const READING_MAX_CHARS = 16_000;
/** Pieces spoken at the same time. */
export const READING_PARALLEL = 3;

interface Node {
  type?: string;
  text?: string;
  content?: Node[];
}

/** Blocks whose text is one stretch of speech; anything else is walked into. */
const SPOKEN_BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock"]);

function inlineText(node: Node): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map(inlineText).join("");
}

/**
 * A note's stored text as it is spoken: one paragraph a line, in reading order. A heading that ends in no
 * punctuation gets a full stop, so it is read as a line of its own and does not run into what follows. Text that is
 * not the editor's JSON (an old plain-text note) is spoken as it is.
 */
export function noteSpeechText(content: string | null): string {
  if (content === null) return "";
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return trimmed.replace(/[ \t]+/g, " ");
  let doc: Node;
  try {
    doc = JSON.parse(trimmed) as Node;
  } catch {
    return "";
  }
  const lines: string[] = [];
  const walk = (node: Node): void => {
    if (node.type !== undefined && SPOKEN_BLOCKS.has(node.type) && !(node.content ?? []).some((c) => c.type !== undefined && SPOKEN_BLOCKS.has(c.type))) {
      const text = inlineText(node).replace(/\s+/g, " ").trim();
      if (text !== "") lines.push(node.type === "heading" && !/[.!?:…]$/.test(text) ? `${text}.` : text);
      return;
    }
    (node.content ?? []).forEach(walk);
  };
  walk(doc);
  return lines.join("\n");
}

/** The text in pieces a speech service takes, cut between paragraphs, and inside a long paragraph between sentences. */
export function speechPieces(text: string, max: number = READING_PIECE_CHARS): string[] {
  const pieces: string[] = [];
  let current = "";
  const push = (part: string): void => {
    if (current !== "" && current.length + 1 + part.length > max) {
      pieces.push(current);
      current = "";
    }
    current = current === "" ? part : `${current}\n${part}`;
  };
  for (const paragraph of text.split("\n").map((p) => p.trim()).filter((p) => p !== "")) {
    if (paragraph.length <= max) {
      push(paragraph);
      continue;
    }
    // A paragraph longer than a piece: by sentences, and a sentence longer still by words.
    for (const sentence of paragraph.match(/[^.!?…]+[.!?…]*\s*/g) ?? [paragraph]) {
      let rest = sentence.trim();
      while (rest.length > max) {
        const cut = rest.lastIndexOf(" ", max);
        const at = cut > 0 ? cut : max;
        push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest !== "") push(rest);
    }
  }
  if (current !== "") pieces.push(current);
  return pieces;
}

/**
 * How a note is told. The maintainer listened to both services on one recap (19 Nov 2026): plain, both were
 * "ok-ish but not really deep"; with delivery cues ElevenLabs' turbo model was "significantly better", and its full
 * model "not worth twice turbo". So a reading is told with feeling by default, on ElevenLabs with cues, and plainly
 * on the cheaper service for whoever wants the cost down.
 */
export type Telling = "storyteller" | "plain";

export const isTelling = (raw: unknown): raw is Telling => raw === "storyteller" || raw === "plain";

/** The manner every piece is told in, so pieces spoken apart sound like one telling. */
export const STORYTELLER_CUE = "an old storyteller by the fire, warm and unhurried";
/** The manner of the very last paragraph: a telling that ends, instead of one that stops. */
export const CLOSING_CUE = "slower, letting the last words land";

/**
 * The pieces as they are sent for a telling with feeling: a cue in square brackets in front of each piece, and one
 * more in front of the last paragraph of all. Square brackets in the note's own text become round ones first, so
 * nothing the Dungeon Master wrote is taken for a cue and swallowed. The cues are sent, so they are counted and
 * charged like the words.
 */
export function storytellerPieces(pieces: readonly string[]): string[] {
  return pieces.map((piece, i) => {
    const own = piece.replace(/\[/g, "(").replace(/\]/g, ")");
    if (i < pieces.length - 1) return `[${STORYTELLER_CUE}] ${own}`;
    const paragraphs = own.split("\n");
    if (paragraphs.length === 1) return `[${STORYTELLER_CUE}] [${CLOSING_CUE}] ${own}`;
    const last = paragraphs.pop();
    return `[${STORYTELLER_CUE}] ${paragraphs.join("\n")}\n[${CLOSING_CUE}] ${last}`;
  });
}

/** Where a note's recording is kept in the voices' store. Derived, never stored: a row cannot point it elsewhere. */
export const readingKey = (at: { campaignId: string; noteId: string; hash: string }): string => `${noteReadingPrefix(at)}${at.hash}.mp3`;

/** A short stable name for a text and the voice it is spoken in (SHA-256, hex, the first 32 characters). */
export async function readingHash(text: string, voice: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${voice}\n${text}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Several recordings as one: MP3 is a run of frames, so pieces of one voice and format play end to end. */
export function joinAudio(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

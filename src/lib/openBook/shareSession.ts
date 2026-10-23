import type { OpenBookSession } from "@/types/openBook.types";
import { romanNumeral } from "./articleData";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findImageSrc(node: unknown): string | null {
  if (!isRecord(node)) return null;
  if (node.type === "image" && isRecord(node.attrs) && typeof node.attrs.src === "string" && /^https?:\/\//i.test(node.attrs.src)) {
    return node.attrs.src;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = findImageSrc(child);
      if (found !== null) return found;
    }
  }
  return null;
}

/** The first picture in a session's stored text, or null when it has none. */
export function firstImageSrc(content: string | null): string | null {
  if (!content) return null;
  try {
    return findImageSrc(JSON.parse(content));
  } catch {
    return null;
  }
}

/** The newest session: the highest session number, else the latest created. */
export function newestSession(sessions: OpenBookSession[]): OpenBookSession | null {
  let best: OpenBookSession | null = null;
  for (const s of sessions) {
    if (best === null) {
      best = s;
      continue;
    }
    const a = s.session?.number ?? null;
    const b = best.session?.number ?? null;
    if (a !== null && b !== null && a !== b) {
      if (a > b) best = s;
    } else if (a !== null && b === null) {
      best = s;
    } else if ((a === null) === (b === null) && s.created_at > best.created_at) {
      best = s;
    }
  }
  return best;
}

export interface ShareSession {
  kicker: string;
  title: string;
  imageUrl: string | null;
}

/** What the "A shared session" card shows: "SESSION XIV · BOOK", the session's title and its lead picture. */
export function shareSessionOf(sessions: OpenBookSession[], bookTitle: string): ShareSession | null {
  const s = newestSession(sessions);
  if (s === null) return null;
  const n = s.session?.number ?? null;
  const book = bookTitle.toUpperCase();
  return {
    kicker: n === null ? `SESSION · ${book}` : `SESSION ${romanNumeral(n)} · ${book}`,
    title: s.session?.title ?? s.title,
    imageUrl: firstImageSrc(s.content),
  };
}

export function buildCampaignContext(opts: {
  setting?: string | null;
  tone?: string | null;
  threads?: string | null;
}): string {
  const sections: string[] = [];
  const s = opts.setting?.trim();
  const t = opts.tone?.trim();
  const th = opts.threads?.trim();
  if (s) sections.push(`## Setting\n${s}`);
  if (t) sections.push(`## Campaign Tone\n${t}`);
  if (th) sections.push(`## Active Threads\n${th}`);
  if (!sections.length) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n${sections.join("\n\n")}`;
}

export function b64ToBlob(b64: string, mimeType = "image/webp"): Blob {
  const chars = atob(b64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export const AI_PROMPT_LIMIT = 1000;
export const AI_PROMPT_LIMIT_SHORT = 500;
export const AI_PROMPT_LIMIT_LONG = 2000;

export function wrapUserInput(input: string): string {
  return `<user_input>\n${input}\n</user_input>`;
}

interface TiptapNode { text?: string; content?: TiptapNode[] }

/**
 * Flatten content to plain text. Accepts a Tiptap JSON string (extracts all
 * text nodes) or a plain string (returned trimmed). Safe on null/invalid JSON.
 * Used to build AI image-prompt context from entity description fields.
 */
export function toPlainText(content: string | null | undefined): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const parts: string[] = [];
    const walk = (n: TiptapNode) => {
      if (n.text) parts.push(n.text);
      n.content?.forEach(walk);
    };
    walk(JSON.parse(trimmed) as TiptapNode);
    return parts.join(" ").trim();
  } catch {
    return trimmed;
  }
}

/**
 * Join entity facts into a single context string for the AI prompt author,
 * dropping empty parts. e.g. buildEntityContext(["Gnarl", "goblin", "", "sneaky"]).
 */
export function buildEntityContext(parts: (string | null | undefined)[]): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(". ");
}

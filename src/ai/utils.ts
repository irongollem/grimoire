export function b64ToBlob(b64: string, mimeType = "image/webp"): Blob {
  const chars = atob(b64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export const AI_PROMPT_LIMIT = 1000;
export const AI_PROMPT_LIMIT_SHORT = 500;
// Chronicle input is raw session notes — mirror of the edge function's limit.
export const AI_PROMPT_LIMIT_CHRONICLE = 10000;

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

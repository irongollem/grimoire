import { marked } from "marked";
import { sanitizeHtml } from "./sanitizeHtml";

/**
 * Render a chat message's INLINE markdown (bold / italic / code only — no block
 * elements) to SANITIZED HTML for `v-html`.
 *
 * IMPORTANT: `marked` does NOT escape raw HTML — it passes `<script>` /
 * `<img onerror=…>` straight through. Chat messages are user-authored and shown
 * to every other participant, so the marked output MUST go through DOMPurify or
 * a player could land a stored XSS in everyone's browser. This is pinned by
 * chatMarkdown.test.ts — keep the sanitize call.
 */
export function renderChatMessage(text: string): string {
  return sanitizeHtml(marked.parseInline(text, { async: false }) as string);
}

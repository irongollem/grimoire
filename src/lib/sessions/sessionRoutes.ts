import type { RouteLocationRaw } from "vue-router";

/** The note editor, opened to write a session's recap (the editor reads `?category=session&session=<id>`). */
export function sessionNoteRoute(sessionId: string, options: { chronicler?: boolean } = {}): RouteLocationRaw {
  const query: Record<string, string> = { category: "session", session: sessionId };
  if (options.chronicler) query.chronicler = "1";
  return { path: "/notes/new", query };
}

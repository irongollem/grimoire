import type { RouteLocationRaw } from "vue-router";

/** The note editor, opened to write a session's recap (the editor reads `?session=<id>`). */
export function sessionNoteRoute(sessionId: string, options: { chronicler?: boolean } = {}): RouteLocationRaw {
  const query: Record<string, string> = { session: sessionId };
  if (options.chronicler) query.chronicler = "1";
  return { path: "/notes/new", query };
}

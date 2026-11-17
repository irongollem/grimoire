import type { PlayMode } from "./soloTypes";

export interface ComposerKey {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** An input method editor is composing (a Japanese or Chinese keyboard): Enter commits its text, it is not a send. */
  isComposing: boolean;
}

/**
 * What a key press in the composer does. Enter says the line aloud and Alt+Enter does it (Table, 02); Shift+Enter is
 * left to the textarea as a new line, and so is any other chord, so Ctrl+Enter and Cmd+Enter never send by accident.
 */
export function composerKeyAction(e: ComposerKey): PlayMode | null {
  if (e.key !== "Enter" || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey) return null;
  return e.altKey ? "do" : "say";
}

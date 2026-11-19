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
 * What a key press in the composer does. Enter says the line aloud and Alt+Enter does it (Table, 02); Ctrl+Enter
 * (Cmd+Enter on a Mac) asks the Dungeon Master out of character. Shift+Enter is left to the textarea as a new line,
 * and so is any chord of two modifiers, so nothing is sent by a slip of the hand.
 */
export function composerKeyAction(e: ComposerKey): PlayMode | null {
  if (e.key !== "Enter" || e.isComposing || e.shiftKey) return null;
  const asks = e.ctrlKey || e.metaKey;
  if (asks) return e.altKey ? null : "ask";
  return e.altKey ? "do" : "say";
}

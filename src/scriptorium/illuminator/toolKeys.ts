import type { WorkbenchTool } from "./useIlluminateWorkbench";

/**
 * The key that arms each tool. One table: the workbench binds these and the rail prints them in each tool's
 * corner and tooltip, so a printed key cannot differ from the bound one. Edges is R ("ragged"); D and X are the
 * colour keys (reset, swap) and O is the hold-to-peek, so none of those is a tool's.
 */
export const TOOL_KEYS: Record<WorkbenchTool, string> = {
  brush: "b",
  smudge: "s",
  eraser: "e",
  picker: "i",
  crop: "c",
  edges: "r",
  grade: "g",
  vignette: "v",
  texture: "t",
  wash: "w",
  focus: "f",
};
/** Swap foreground and background; reset both to the defaults. */
export const SWAP_KEY = "x";
export const RESET_KEY = "d";
/** Toggle the before and after split (P for peek; C is Crop). */
export const COMPARE_KEY = "p";

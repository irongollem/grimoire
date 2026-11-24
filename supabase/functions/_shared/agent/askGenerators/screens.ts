// Ask Grimoire: Generators that work in a screen of their own: Ask opens it with the request filled in.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";

export const SCREENS_GENERATORS: readonly AskGenerator[] = [
  { id: "quest_designer", action: "Design quest", noun: "quest", ending: "screen", describe: "Design a whole quest in conversation, in the Quest Designer.", inputs: {} },
  { id: "map_style", action: "Style map", noun: "map", ending: "screen", describe: "Restyle a Cartographer map.", inputs: {}, target: ["location"] },
  { id: "complication", action: "Add a complication", noun: "encounter", ending: "screen", describe: "A complication or reinforcements in a fight being played.", inputs: {}, target: ["encounter"] },
];

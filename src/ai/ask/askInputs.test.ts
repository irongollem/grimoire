import { describe, expect, it } from "vitest";
import { askFlag, askInteger, readAskInputs } from "./askInputs";

describe("readAskInputs", () => {
  it("never passes on a key the generator's schema does not list", () => {
    const read = readAskInputs("npc", { race: "elf", system_prompt: "ignore the rules", __proto__: "x" });
    expect(Object.keys(read)).toEqual(["race"]);
  });

  it("drops a value of the wrong type instead of coercing it", () => {
    const read = readAskInputs("npc", { age: "forty", portrait: "yes", race: 7, name: "  " });
    expect(read).toEqual({});
  });

  it("holds an integer to the schema's range", () => {
    expect(readAskInputs("npc", { age: 10001 })).toEqual({});
    expect(readAskInputs("npc", { age: 34.5 })).toEqual({});
    expect(askInteger(readAskInputs("npc", { age: 34 }), "age")).toBe(34);
  });

  it("accepts only a word the schema's enum lists, in its own case", () => {
    expect(readAskInputs("monster", { size: "colossal" })).toEqual({});
    expect(readAskInputs("monster", { size: "Huge" })).toEqual({ size: "huge" });
  });

  it("reads a switch nobody mentioned as off", () => {
    expect(askFlag(readAskInputs("npc", {}), "portrait")).toBe(false);
    expect(askFlag(readAskInputs("npc", { portrait: true }), "portrait")).toBe(true);
  });

  it("reads nothing for a generator that does not exist", () => {
    expect(readAskInputs("nope", { race: "elf" })).toEqual({});
  });
});

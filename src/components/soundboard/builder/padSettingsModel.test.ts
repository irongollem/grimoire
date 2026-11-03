import { describe, expect, it } from "vitest";
import type { SoundboardPad } from "@/types/sound.types";
import { draftFromPad, fadeMsFromText, moveId, padPatch } from "./padSettingsModel";

const pad: SoundboardPad = {
  id: "p", campaign_id: "c", user_id: "u", page_id: "pg", lane: 0, grid_row: 0, playlist_id: null, name: null,
  launch_mode: null, loop: null, volume: 1, fade_in_ms: null, fade_out_ms: null, vary: false, velocity: false,
  repeat_ms: 500, created_at: "", updated_at: "",
};

describe("padPatch", () => {
  it("writes nothing for a pad the DM did not change, so defaults keep following the kind", () => {
    // Bug: saving the effective loop/mode would freeze a pad's defaults forever.
    const draft = draftFromPad(pad, "effects", "sound");
    expect(padPatch(draft, pad, "effects", "sound")).toEqual({});
  });

  it("saves an emptied name as null", () => {
    const named = { ...pad, name: "Slam" };
    const draft = { ...draftFromPad(named, "effects", "sound"), name: "   " };
    expect(padPatch(draft, named, "effects", "sound")).toEqual({ name: null });
  });

  it("stores a loop that differs from the default, as true or false", () => {
    const draft = { ...draftFromPad(pad, "effects", "sound"), loop: true };
    expect(padPatch(draft, pad, "effects", "sound")).toEqual({ loop: true });
  });

  it("writes the chosen launch mode", () => {
    const draft = { ...draftFromPad(pad, "effects", "sound"), mode: "gate" as const };
    expect(padPatch(draft, pad, "effects", "sound")).toEqual({ launch_mode: "gate" });
  });

  it("clamps the repeat beat to what the database allows", () => {
    const draft = { ...draftFromPad(pad, "effects", "sound"), repeatMs: 20 };
    expect(padPatch(draft, pad, "effects", "sound")).toEqual({ repeat_ms: 100 });
  });
});

describe("fadeMsFromText", () => {
  it("turns seconds into milliseconds and empty into null", () => {
    expect(fadeMsFromText("1.5")).toBe(1500);
    expect(fadeMsFromText("")).toBeNull();
    expect(fadeMsFromText("abc")).toBeNull();
  });
});

describe("moveId", () => {
  it("moves one id and ignores a move off the list", () => {
    expect(moveId(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

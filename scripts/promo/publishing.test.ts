import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkReel, postReel, readSchedule, setScheduled } from "./publishing";

let root: string;
const CAPTION = "Combat in Dungeon Grimoire.\n\n#dnd #ttrpg";

/**
 * A recorded Reel `ep` with narrated shots a and b; `takes` names the shots that have a voice take, and
 * `scene` adds a shot with no narration (a painted scene, whose sound is its ambience).
 */
function reel(takes: string[], opts: { built?: boolean; cover?: boolean; scene?: boolean } = {}) {
  const dir = join(root, "ep");
  mkdirSync(join(dir, "vo"), { recursive: true });
  const shots = [{ id: "a", narration: "Line a." }, { id: "b", narration: "Line b." }, ...(opts.scene ? [{ id: "room", narration: "" }] : [])];
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ id: "ep", shots }));
  for (const t of takes) writeFileSync(join(dir, "vo", `${t}.wav`), "x");
  if (opts.built !== false) writeFileSync(join(dir, "ep.mp4"), "x");
  if (opts.cover !== false) writeFileSync(join(dir, "cover.json"), JSON.stringify({ at: 4.5 }));
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "promo-publishing-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("checkReel", () => {
  it("passes a voiced, built Reel with its cover and a good caption", () => {
    reel(["a", "b"]);
    expect(checkReel(root, "ep", CAPTION)).toMatchObject({ problems: [], coverAt: 4.5, posted: null });
  });

  it("refuses a silent draft: a shot with no take", () => {
    reel(["a"]);
    expect(checkReel(root, "ep", CAPTION).problems).toEqual(["no voice take for b: the build is a silent draft"]);
  });

  it("needs no take for a shot with nothing to narrate (a painted scene)", () => {
    reel(["a", "b"], { scene: true });
    expect(checkReel(root, "ep", CAPTION).problems).toEqual([]);
  });

  it("still refuses a narrated shot with no take beside a scene", () => {
    reel(["a"], { scene: true });
    expect(checkReel(root, "ep", CAPTION).problems).toEqual(["no voice take for b: the build is a silent draft"]);
  });

  it("refuses a build older than a take, which would post the old narration", () => {
    const dir = reel(["a", "b"]);
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(dir, "ep.mp4"), past, past);
    expect(checkReel(root, "ep", CAPTION).problems[0]).toMatch(/takes newer than the build \(a\.wav, b\.wav\)/);
  });

  it("refuses a build with no cover time, which would post with Instagram's first frame as the cover", () => {
    reel(["a", "b"], { cover: false });
    expect(checkReel(root, "ep", CAPTION).problems).toEqual(["no cover time (cover.json): assemble it again"]);
  });

  it("refuses a Reel with no caption", () => {
    reel(["a", "b"]);
    expect(checkReel(root, "ep", null).problems[0]).toMatch(/no caption yet/);
  });
});

describe("postReel", () => {
  it("refuses an already-posted Reel before touching the network", async () => {
    const dir = reel(["a", "b"]);
    writeFileSync(join(dir, "posted.json"), JSON.stringify({ id: "ep", permalink: "https://instagram.com/reel/x", postedAt: "2026-11-04T17:00:00Z" }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(postReel("token", root, "ep", () => undefined)).rejects.toThrow(/already posted/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("setScheduled", () => {
  it("adds, moves and removes a Reel, keeping the file in time order", () => {
    const file = join(root, "schedule.json");
    setScheduled("late", "2026-11-06T18:00:00+01:00", file);
    setScheduled("early", "2026-11-04T18:00:00+01:00", file);
    expect(readSchedule(file).map((e) => e.id)).toEqual(["early", "late"]);
    setScheduled("early", "2026-11-08T18:00:00+01:00", file);
    expect(readSchedule(file).map((e) => e.id)).toEqual(["late", "early"]);
    setScheduled("late", null, file);
    expect(readSchedule(file)).toEqual([{ id: "early", at: "2026-11-08T18:00:00+01:00" }]);
  });
});

import { describe, it, expect } from "vitest";
import {
  MAX_SCULPTS,
  STALE_SCULPT_MS,
  canStylize,
  canSculpt,
  canResculpt,
  resolveSculptOutcome,
  meshyParamsForFormat,
  isStale,
  type MiniStatusB,
} from "./simulacrum";

const ALL_STATUSES: MiniStatusB[] = [
  "stylizing",
  "image_ready",
  "sculpting",
  "downloading",
  "ready",
  "failed",
];

describe("MAX_SCULPTS", () => {
  it("is 3 (1 paid + 2 free re-sculpts) — keep in sync with src/types/mini.types.ts", () => {
    expect(MAX_SCULPTS).toBe(3);
  });
});

describe("canStylize", () => {
  it("allows stylizing from stylizing | image_ready | failed | ready", () => {
    expect(canStylize("stylizing")).toBe(true);
    expect(canStylize("image_ready")).toBe(true);
    expect(canStylize("failed")).toBe(true);
    expect(canStylize("ready")).toBe(true);
  });
  it("forbids stylizing while a Meshy task is in flight", () => {
    expect(canStylize("sculpting")).toBe(false);
    expect(canStylize("downloading")).toBe(false);
  });
  it("full matrix — exactly the 4 allowed statuses return true", () => {
    const allowed = ALL_STATUSES.filter(canStylize);
    expect(allowed.sort()).toEqual(["failed", "image_ready", "ready", "stylizing"].sort());
  });
});

describe("canSculpt", () => {
  it("allows the first sculpt from image_ready with sculpt_count 0", () => {
    expect(canSculpt({ status: "image_ready", sculpt_count: 0 })).toBe(true);
  });
  it("allows retrying a failed first sculpt (its hold was released, sculpt_count stayed 0)", () => {
    expect(canSculpt({ status: "failed", sculpt_count: 0 })).toBe(true);
  });
  it("forbids sculpting once a completed sculpt exists (sculpt_count > 0) — that's canResculpt's job", () => {
    expect(canSculpt({ status: "image_ready", sculpt_count: 1 })).toBe(false);
    expect(canSculpt({ status: "failed", sculpt_count: 1 })).toBe(false);
    expect(canSculpt({ status: "ready", sculpt_count: 1 })).toBe(false);
  });
  it("forbids sculpting from every other status regardless of count", () => {
    for (const status of ["stylizing", "sculpting", "downloading", "ready"] as MiniStatusB[]) {
      expect(canSculpt({ status, sculpt_count: 0 })).toBe(false);
    }
  });
  it("full matrix — status × sculpt_count 0..3", () => {
    const expected: Record<MiniStatusB, boolean> = {
      stylizing: false,
      image_ready: true,
      sculpting: false,
      downloading: false,
      ready: false,
      failed: true,
    };
    for (const status of ALL_STATUSES) {
      for (const sculpt_count of [0, 1, 2, 3]) {
        expect(canSculpt({ status, sculpt_count })).toBe(sculpt_count === 0 && expected[status]);
      }
    }
  });
});

describe("canResculpt", () => {
  it("allows a free retry from ready with 1 or 2 completed sculpts", () => {
    expect(canResculpt({ status: "ready", sculpt_count: 1 })).toBe(true);
    expect(canResculpt({ status: "ready", sculpt_count: 2 })).toBe(true);
  });
  it("allows a free retry from image_ready after a post-sculpt re-stylize (no dead end)", () => {
    // canStylize permits paid image tweaks after sculpting, which drops the
    // row to image_ready with sculpt_count >= 1 — sculpting the new image
    // must remain reachable as a free retry (canSculpt requires count 0).
    expect(canResculpt({ status: "image_ready", sculpt_count: 1 })).toBe(true);
    expect(canResculpt({ status: "image_ready", sculpt_count: 2 })).toBe(true);
  });
  it("forbids resculpting once the MAX_SCULPTS cap is hit", () => {
    expect(canResculpt({ status: "ready", sculpt_count: 3 })).toBe(false);
    expect(canResculpt({ status: "ready", sculpt_count: 4 })).toBe(false);
    expect(canResculpt({ status: "image_ready", sculpt_count: 3 })).toBe(false);
  });
  it("forbids resculpting a mini that has never completed a sculpt", () => {
    expect(canResculpt({ status: "ready", sculpt_count: 0 })).toBe(false);
    expect(canResculpt({ status: "image_ready", sculpt_count: 0 })).toBe(false);
  });
  it("forbids resculpting from in-flight or failed statuses", () => {
    for (const status of ["stylizing", "sculpting", "downloading", "failed"] as MiniStatusB[]) {
      expect(canResculpt({ status, sculpt_count: 1 })).toBe(false);
    }
  });
  it("full matrix — status × sculpt_count 0..4", () => {
    for (const status of ALL_STATUSES) {
      for (const sculpt_count of [0, 1, 2, 3, 4]) {
        const expected =
          (status === "ready" || status === "image_ready") &&
          sculpt_count >= 1 &&
          sculpt_count < MAX_SCULPTS;
        expect(canResculpt({ status, sculpt_count })).toBe(expected);
      }
    }
  });
});

describe("resolveSculptOutcome", () => {
  it("SUCCEEDED always completes, regardless of staleness or existing model", () => {
    for (const hasExistingModel of [true, false]) {
      for (const stale of [true, false]) {
        expect(resolveSculptOutcome({ taskStatus: "SUCCEEDED", hasExistingModel, stale })).toEqual({ kind: "complete" });
      }
    }
  });
  it("FAILED with no existing model fails to 'failed' (first sculpt, nothing to fall back to)", () => {
    expect(resolveSculptOutcome({ taskStatus: "FAILED", hasExistingModel: false, stale: false })).toEqual({
      kind: "fail", nextStatus: "failed", releaseHold: true,
    });
  });
  it("FAILED with an existing model fails back to 'ready' (a failed re-sculpt keeps the previous model)", () => {
    expect(resolveSculptOutcome({ taskStatus: "FAILED", hasExistingModel: true, stale: false })).toEqual({
      kind: "fail", nextStatus: "ready", releaseHold: true,
    });
  });
  it("CANCELED behaves exactly like FAILED", () => {
    expect(resolveSculptOutcome({ taskStatus: "CANCELED", hasExistingModel: false, stale: false })).toEqual({
      kind: "fail", nextStatus: "failed", releaseHold: true,
    });
    expect(resolveSculptOutcome({ taskStatus: "CANCELED", hasExistingModel: true, stale: false })).toEqual({
      kind: "fail", nextStatus: "ready", releaseHold: true,
    });
  });
  it("a stale still-pending/in-progress task fails, even without an explicit terminal status", () => {
    expect(resolveSculptOutcome({ taskStatus: "PENDING", hasExistingModel: false, stale: true })).toEqual({
      kind: "fail", nextStatus: "failed", releaseHold: true,
    });
    expect(resolveSculptOutcome({ taskStatus: "IN_PROGRESS", hasExistingModel: true, stale: true })).toEqual({
      kind: "fail", nextStatus: "ready", releaseHold: true,
    });
  });
  it("a non-stale PENDING/IN_PROGRESS task waits", () => {
    expect(resolveSculptOutcome({ taskStatus: "PENDING", hasExistingModel: false, stale: false })).toEqual({ kind: "wait" });
    expect(resolveSculptOutcome({ taskStatus: "IN_PROGRESS", hasExistingModel: true, stale: false })).toEqual({ kind: "wait" });
  });
});

describe("meshyParamsForFormat", () => {
  it("print: untextured, triangle topology, 200k polys, stl+3mf+glb, bottom-origin auto-size", () => {
    expect(meshyParamsForFormat("print")).toEqual({
      should_texture: false,
      topology: "triangle",
      target_polycount: 200_000,
      target_formats: ["stl", "3mf", "glb"],
      ai_model: "latest",
      auto_size: true,
      origin_at: "bottom",
    });
  });
  it("vtt: textured, 20k polys, glb+usdz, no topology key, bottom-origin auto-size", () => {
    const params = meshyParamsForFormat("vtt");
    expect(params).toEqual({
      should_texture: true,
      target_polycount: 20_000,
      target_formats: ["glb", "usdz"],
      ai_model: "latest",
      auto_size: true,
      origin_at: "bottom",
    });
    expect(params).not.toHaveProperty("topology");
  });
  it("both formats seat deterministically: auto_size with origin_at bottom (baseless minis land on OUR bases)", () => {
    for (const format of ["print", "vtt"] as const) {
      const params = meshyParamsForFormat(format);
      expect(params.auto_size).toBe(true);
      expect(params.origin_at).toBe("bottom");
    }
  });
});

describe("STALE_SCULPT_MS", () => {
  it("is 30 minutes", () => {
    expect(STALE_SCULPT_MS).toBe(30 * 60 * 1000);
  });
});

describe("isStale", () => {
  const now = Date.parse("2026-07-18T12:00:00.000Z");

  it("is false for a just-updated row", () => {
    expect(isStale("2026-07-18T12:00:00.000Z", now)).toBe(false);
  });
  it("is false exactly at the boundary (not strictly greater than)", () => {
    const boundary = new Date(now - STALE_SCULPT_MS).toISOString();
    expect(isStale(boundary, now)).toBe(false);
  });
  it("is true just past the boundary", () => {
    const justPast = new Date(now - STALE_SCULPT_MS - 1).toISOString();
    expect(isStale(justPast, now)).toBe(true);
  });
  it("is true for something updated an hour ago", () => {
    const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(isStale(hourAgo, now)).toBe(true);
  });
  it("is false for an unparsable timestamp (fail toward not stale)", () => {
    expect(isStale("not-a-date", now)).toBe(false);
  });
});

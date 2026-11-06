import { describe, expect, it } from "vitest";
import {
  MAX_NOOK_IMAGE_BYTES,
  base64DecodedLength,
  nookPartPrompt,
  validateNookPartRequest,
} from "./validateNookPartRequest";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const NOOK = "22222222-2222-4222-8222-222222222222";

/** A base64 PNG with a real signature and IHDR of the given size, padded with `extra` bytes. */
function png(width: number, height: number, extra = 0): string {
  const bytes = new Uint8Array(24 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const base = { campaign_id: CAMPAIGN, nook_id: NOOK };

describe("validateNookPartRequest", () => {
  it("accepts a paint request, trims the subject and drops extra fields", () => {
    const r = validateNookPartRequest({ ...base, mode: "paint", subject: "  a copper kettle ", image_b64: png(4, 4), url: "https://evil.test/a.png" });
    expect(r).toEqual({ ok: true, request: { ...base, mode: "paint", subject: "a copper kettle" } });
  });

  it.each([null, "x", 4, []])("rejects a non-object body (%p)", (body) => {
    expect(validateNookPartRequest(body)).toEqual({ ok: false, error: "invalid_body" });
  });

  it.each([
    ["not a uuid campaign", { ...base, campaign_id: "c1", mode: "paint", subject: "a kettle" }],
    ["missing nook", { campaign_id: CAMPAIGN, mode: "paint", subject: "a kettle" }],
    ["non-uuid nook", { ...base, nook_id: "../nooks", mode: "paint", subject: "a kettle" }],
  ])("rejects %s", (_l, body) => {
    expect(validateNookPartRequest(body)).toEqual({ ok: false, error: "invalid_body" });
  });

  it.each(["draw", "", undefined, 3])("rejects the unknown mode %p", (mode) => {
    expect(validateNookPartRequest({ ...base, mode })).toEqual({ ok: false, error: "invalid_mode" });
  });

  it.each([
    ["missing", undefined],
    ["too short", "ab"],
    ["blank after trim", "     "],
    ["too long", "x".repeat(301)],
    ["not a string", 12],
  ])("paint refuses a subject that is %s", (_l, subject) => {
    expect(validateNookPartRequest({ ...base, mode: "paint", subject })).toEqual({ ok: false, error: "invalid_subject" });
  });

  it("lift accepts a crop with no hint, and with one", () => {
    expect(validateNookPartRequest({ ...base, mode: "lift", image_b64: png(8, 8) })).toEqual({
      ok: true, request: { ...base, mode: "lift", image_b64: png(8, 8) },
    });
    const withHint = validateNookPartRequest({ ...base, mode: "lift", image_b64: png(8, 8), subject: " the kettle " });
    expect(withHint).toMatchObject({ ok: true, request: { subject: "the kettle" } });
  });

  it("lift refuses an over-long hint", () => {
    expect(validateNookPartRequest({ ...base, mode: "lift", image_b64: png(8, 8), subject: "x".repeat(301) })).toEqual({ ok: false, error: "invalid_subject" });
  });

  it.each(["lift", "fill"])("%s refuses a missing crop", (mode) => {
    expect(validateNookPartRequest({ ...base, mode, mask_b64: png(8, 8) })).toEqual({ ok: false, error: "invalid_image" });
  });

  it.each([
    ["a data URL", `data:image/png;base64,${png(8, 8)}`],
    ["not base64", "!!!not base64!!!"],
    ["base64 of something that is not a PNG", btoa("GIF89a plus some padding bytes here")],
  ])("lift refuses an image that is %s", (_l, image_b64) => {
    expect(validateNookPartRequest({ ...base, mode: "lift", image_b64 })).toEqual({ ok: false, error: "invalid_image" });
  });

  it("lift refuses an image over 6 MB decoded but accepts one just under", () => {
    const over = png(8, 8, MAX_NOOK_IMAGE_BYTES);
    expect(base64DecodedLength(over)).toBeGreaterThan(MAX_NOOK_IMAGE_BYTES);
    expect(validateNookPartRequest({ ...base, mode: "lift", image_b64: over })).toEqual({ ok: false, error: "image_too_large" });
    const under = png(8, 8, MAX_NOOK_IMAGE_BYTES - 24);
    expect(validateNookPartRequest({ ...base, mode: "lift", image_b64: under }).ok).toBe(true);
  });

  it("fill accepts a crop with a mask of the same size", () => {
    const r = validateNookPartRequest({ ...base, mode: "fill", image_b64: png(64, 32), mask_b64: png(64, 32) });
    expect(r).toMatchObject({ ok: true, request: { mode: "fill", image_b64: png(64, 32), mask_b64: png(64, 32) } });
  });

  it.each([undefined, null, ""])("fill refuses a missing mask (%p)", (mask_b64) => {
    expect(validateNookPartRequest({ ...base, mode: "fill", image_b64: png(8, 8), mask_b64 })).toEqual({ ok: false, error: "mask_required" });
  });

  it("fill refuses a mask that is not a PNG, an oversize mask, and a mask of another size", () => {
    expect(validateNookPartRequest({ ...base, mode: "fill", image_b64: png(8, 8), mask_b64: btoa("nope nope nope nope nope nope") })).toEqual({ ok: false, error: "invalid_mask" });
    expect(validateNookPartRequest({ ...base, mode: "fill", image_b64: png(8, 8), mask_b64: png(8, 8, MAX_NOOK_IMAGE_BYTES) })).toEqual({ ok: false, error: "image_too_large" });
    expect(validateNookPartRequest({ ...base, mode: "fill", image_b64: png(8, 8), mask_b64: png(8, 9) })).toEqual({ ok: false, error: "mask_size_mismatch" });
  });

  it("paint does not need or carry an image; lift and fill do not carry a mask they did not ask for", () => {
    const lift = validateNookPartRequest({ ...base, mode: "lift", image_b64: png(8, 8), mask_b64: png(8, 8) });
    expect(lift).toMatchObject({ ok: true });
    expect(lift.ok && lift.request).not.toHaveProperty("mask_b64");
  });
});

describe("nookPartPrompt", () => {
  it("names the subject for paint, and the hint for lift only when given", () => {
    expect(nookPartPrompt("paint", "a copper kettle")).toContain("a copper kettle");
    // Bug: an empty hint left a dangling instruction, or the DM's exclusion never reached the model.
    expect(nookPartPrompt("lift")).not.toContain("DM's words");
    expect(nookPartPrompt("lift", "the music box, not the table")).toContain('"the music box, not the table"');
  });

  it("fill asks for repainting the masked area and adding nothing", () => {
    expect(nookPartPrompt("fill")).toMatch(/only the masked area/);
  });
});

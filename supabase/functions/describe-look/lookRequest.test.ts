import { describe, expect, it, vi } from "vitest";
import type { DocumentExtractionOutcome, DocumentUsage } from "../_shared/documentGen";
import { acceptedImageType, MAX_LOOK_CHARS, preflight, shapeOutcome } from "./lookRequest";

const OWN = "https://p.supabase.co/storage/v1/object/public/b/a.png";
const deps = (over: Partial<Parameters<typeof preflight>[1]> = {}) => ({
  isSafeUrl: (u: string) => u.startsWith("https://p.supabase.co/"),
  likenessAcknowledged: async () => true,
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({ campaign_id: "c1", images: [OWN], ...over });

describe("preflight", () => {
  it("accepts one to four own pictures and trims the current look", async () => {
    const r = await preflight(body({ images: [OWN, OWN, OWN, OWN], current_look: "  warm gouache \n" }), deps());
    expect(r).toEqual({ ok: true, request: { campaignId: "c1", images: [OWN, OWN, OWN, OWN], currentLook: "warm gouache" } });
  });

  it("refuses a fifth picture (each is input tokens on every later painting)", async () => {
    const r = await preflight(body({ images: [OWN, OWN, OWN, OWN, OWN] }), deps());
    expect(r).toMatchObject({ ok: false, refusal: { status: 400, code: "invalid_images" } });
  });

  it("refuses no pictures at all", async () => {
    expect(await preflight(body({ images: [] }), deps())).toMatchObject({ ok: false, refusal: { code: "invalid_images" } });
  });

  it("refuses the whole request when one URL is unsafe, instead of skipping it (SSRF)", async () => {
    const r = await preflight(body({ images: [OWN, "http://169.254.169.254/latest"] }), deps());
    expect(r).toMatchObject({ ok: false, refusal: { status: 400, code: "unsafe_image_url" } });
  });

  it("refuses a non-string entry before asking the guard", async () => {
    const isSafeUrl = vi.fn(() => true);
    const r = await preflight(body({ images: [42] }), deps({ isSafeUrl }));
    expect(r).toMatchObject({ ok: false, refusal: { code: "unsafe_image_url" } });
    expect(isSafeUrl).not.toHaveBeenCalled();
  });

  it("refuses a current look over the prompt limit", async () => {
    const r = await preflight(body({ current_look: "x".repeat(2001) }), deps());
    expect(r).toMatchObject({ ok: false, refusal: { code: "invalid_body" } });
  });

  it("treats a blank current look as none", async () => {
    expect(await preflight(body({ current_look: "   " }), deps())).toMatchObject({ ok: true, request: { currentLook: null } });
  });

  it.each([null, {}, { campaign_id: "c1" }, { campaign_id: "", images: [OWN] }, { campaign_id: "c1", images: "x" }])(
    "refuses a malformed body %j",
    async (b) => {
      expect(await preflight(b, deps())).toMatchObject({ ok: false, refusal: { status: 400, code: "invalid_body" } });
    },
  );

  it("answers 403 when the likeness notice was not confirmed (the pictures may show real people)", async () => {
    const r = await preflight(body(), deps({ likenessAcknowledged: async () => false }));
    expect(r).toMatchObject({ ok: false, refusal: { status: 403, code: "likeness_acknowledgement_required" } });
  });
});

describe("acceptedImageType", () => {
  it.each([["image/png", "image/png"], ["IMAGE/JPEG; charset=x", "image/jpeg"], ["image/webp", "image/webp"]])(
    "accepts %s",
    (input, out) => expect(acceptedImageType(input)).toBe(out),
  );
  it.each(["image/gif", "image/svg+xml", "text/html", "", null])("refuses %p (a page or svg is not a picture to read)", (t) => {
    expect(acceptedImageType(t)).toBeNull();
  });
});

const usage: DocumentUsage = { input_tokens: 10, output_tokens: 5, model: "m", provider: "openai" };
const ok = (content: string): DocumentExtractionOutcome => ({ ok: true, content, usage });

describe("shapeOutcome", () => {
  it("trims and collapses the paragraph", () => {
    expect(shapeOutcome(ok(JSON.stringify({ look: "  Soft\n gouache,  warm light. " })))).toEqual({
      kind: "look", look: "Soft gouache, warm light.", usage,
    });
  });

  it("caps a rambling look so the Look field and every later prompt stay bounded", () => {
    const r = shapeOutcome(ok(JSON.stringify({ look: "word ".repeat(1000) })));
    expect(r.kind === "look" && r.look.length <= MAX_LOOK_CHARS).toBe(true);
  });

  it("a refusal is a failure with nothing to charge", () => {
    expect(shapeOutcome({ ok: false, reason: "refused", usage })).toMatchObject({ kind: "failed", refusal: { status: 502 } });
  });

  it("a cut-off answer is a failure with nothing to charge, even though it has content", () => {
    const r = shapeOutcome({ ok: false, reason: "truncated", content: JSON.stringify({ look: "Half a" }), usage });
    expect(r.kind).toBe("failed");
  });

  it.each(["not json", "{}", JSON.stringify({ look: "   " }), JSON.stringify({ look: 4 }), "null"])(
    "an unusable reply %s is not charged",
    (content) => expect(shapeOutcome(ok(content)).kind).toBe("failed"),
  );
});

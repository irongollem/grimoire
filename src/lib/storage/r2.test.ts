import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The rule these tests pin is what makes flipping every bucket to R2 at once a
// low-risk change: only a genuine authorization refusal is fatal, and every
// infrastructure failure degrades to the Supabase path instead of losing a
// user's upload. Get this backwards and one bad CORS rule breaks every upload
// in the app.

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
  getCurrentUser: () => ({ id: "u1" }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke.mockReset();
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Import fresh with the CDN configured, so `usesR2` is true.
 *
 * The error classes come from the returned module rather than a top-level
 * import: `resetModules` produces a new module instance, so the classes it
 * exports are different objects and `toBeInstanceOf` against the stale import
 * fails even when the code is right.
 */
async function loadR2() {
  vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
  vi.resetModules();
  return import("./r2");
}

const upload = { path: "u1/a.webp", blob: new Blob(["x"], { type: "image/webp" }), contentType: "image/webp" };

const signed = (path: string) => ({
  path,
  url: "https://acct.r2.cloudflarestorage.com/bkt/npc-portraits/u1/a.webp?X-Amz-Signature=x",
  headers: { "Content-Type": "image/webp", "Content-Length": "1" },
});

describe("usesR2", () => {
  it("is false without a CDN, because an R2 object is only readable through the Worker", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "");
    vi.resetModules();
    const { usesR2 } = await import("./r2");
    expect(usesR2("npcPortraits")).toBe(false);
  });

  it("is true for every registry bucket once the CDN is configured", async () => {
    const { usesR2 } = await loadR2();
    expect(usesR2("npcPortraits")).toBe(true);
    expect(usesR2("sounds")).toBe(true);
    expect(usesR2("miniModels")).toBe(true);
  });
});

describe("failure classification", () => {
  it("treats a 403 from the signer as fatal", async () => {
    // The caller may not write this path/type/size. Supabase encodes the same
    // rules and would refuse too, so falling back would only blur the error.
    const { uploadToR2, R2RefusedError } = await loadR2();
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("forbidden"), { context: { status: 403 } }) });

    await expect(uploadToR2("npcPortraits", upload)).rejects.toBeInstanceOf(R2RefusedError);
  });

  it("treats an unconfigured R2 (503) as recoverable", async () => {
    const { uploadToR2, R2UnavailableError } = await loadR2();
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("nope"), { context: { status: 503 } }) });

    await expect(uploadToR2("npcPortraits", upload)).rejects.toBeInstanceOf(R2UnavailableError);
  });

  it("treats an unreachable signer as recoverable", async () => {
    // No status at all — the function could not be reached. That is us failing
    // to ask, not R2 answering no.
    const { uploadToR2, R2UnavailableError } = await loadR2();
    invoke.mockResolvedValue({ data: null, error: new Error("network down") });

    await expect(uploadToR2("npcPortraits", upload)).rejects.toBeInstanceOf(R2UnavailableError);
  });

  it("treats a thrown PUT (the CORS failure mode) as recoverable", async () => {
    // The single most likely R2 misconfiguration, and the browser will not say
    // more than "failed". It must never cost the user their upload.
    const { uploadToR2, R2UnavailableError } = await loadR2();
    invoke.mockResolvedValue({ data: { uploads: [signed(upload.path)] }, error: null });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(uploadToR2("npcPortraits", upload)).rejects.toBeInstanceOf(R2UnavailableError);
  });

  it("treats a 403 on the PUT itself as recoverable, not a refusal", async () => {
    // Authorization already passed to get this URL, so a 403 here is an expired
    // or malformed signature — our bug, not the user's.
    const { uploadToR2, R2UnavailableError } = await loadR2();
    invoke.mockResolvedValue({ data: { uploads: [signed(upload.path)] }, error: null });
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));

    await expect(uploadToR2("npcPortraits", upload)).rejects.toBeInstanceOf(R2UnavailableError);
  });
});

describe("uploadToR2", () => {
  it("signs the whole set in one call and uploads the original first", async () => {
    const { uploadToR2 } = await loadR2();
    const variants = [1, 2].map((n) => ({ ...upload, path: `u1/a_w${n}.webp` }));
    invoke.mockResolvedValue({
      data: { uploads: [signed(upload.path), ...variants.map((v) => signed(v.path))] },
      error: null,
    });

    const order: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      order.push(url);
      return new Response(null, { status: 200 });
    });

    const outcome = await uploadToR2("npcPortraits", upload, variants);

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke.mock.calls[0][1].body.objects).toHaveLength(3);
    expect(order).toHaveLength(3);
    expect(outcome.uploaded).toHaveLength(3);
    expect(outcome.failed).toEqual([]);
  });

  it("reports a failed variant without failing the upload", async () => {
    // FocalImage falls back to the original, so a missing variant is cosmetic.
    const { uploadToR2 } = await loadR2();
    const variant = { ...upload, path: "u1/a_w200.webp" };
    invoke.mockResolvedValue({ data: { uploads: [signed(upload.path), signed(variant.path)] }, error: null });

    let call = 0;
    fetchMock.mockImplementation(async () =>
      ++call === 1 ? new Response(null, { status: 200 }) : new Response(null, { status: 500 }),
    );

    const outcome = await uploadToR2("npcPortraits", upload, [variant]);
    expect(outcome.uploaded).toEqual([upload.path]);
    expect(outcome.failed).toEqual([variant.path]);
  });

  it("does not attempt variants when the original fails", async () => {
    // Ordering is what keeps the Supabase fallback clean: no orphan variants
    // left in R2 for an image that ends up stored in Supabase.
    const { uploadToR2, R2UnavailableError } = await loadR2();
    const variant = { ...upload, path: "u1/a_w200.webp" };
    invoke.mockResolvedValue({ data: { uploads: [signed(upload.path), signed(variant.path)] }, error: null });
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(uploadToR2("npcPortraits", upload, [variant])).rejects.toBeInstanceOf(R2UnavailableError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("deleteFromR2", () => {
  it("chunks to the edge function's batch limit", async () => {
    // r2-delete rejects an oversized batch outright rather than truncating it,
    // and deleteByPublicUrl expands each URL to five keys.
    const { deleteFromR2 } = await loadR2();
    invoke.mockResolvedValue({ data: { deleted: 0 }, error: null });

    await deleteFromR2("npcPortraits", Array.from({ length: 150 }, (_, i) => `u1/${i}.webp`));

    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls[0][1].body.paths).toHaveLength(64);
    expect(invoke.mock.calls[2][1].body.paths).toHaveLength(22);
  });

  it("does nothing for an empty list", async () => {
    const { deleteFromR2 } = await loadR2();
    await deleteFromR2("npcPortraits", []);
    expect(invoke).not.toHaveBeenCalled();
  });
});

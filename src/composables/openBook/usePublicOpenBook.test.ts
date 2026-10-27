import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { fetchOpenBookPreview, fetchPublicOpenBook, publicOpenBookUrl } from "./usePublicOpenBook";

const URL_BASE = "https://x.supabase.co/";

describe("publicOpenBookUrl", () => {
  it("joins without a double slash and encodes the slug", () => {
    expect(publicOpenBookUrl(URL_BASE, "a-b")).toBe("https://x.supabase.co/functions/v1/open-book/a-b");
    expect(publicOpenBookUrl("https://x.supabase.co", "a/b")).toBe(
      "https://x.supabase.co/functions/v1/open-book/a%2Fb",
    );
  });
});

describe("fetchPublicOpenBook", () => {
  it("sends no credentials", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slug: "a" }), { status: 200 }));
    const result = await fetchPublicOpenBook("a", URL_BASE, f);
    expect(result.status).toBe("found");
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });
  it("turns a 404 into a typed result", async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"error":"not_found"}', { status: 404 }));
    expect(await fetchPublicOpenBook("a", URL_BASE, f)).toEqual({ status: "not_found" });
  });
  it("throws on any other failure", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(fetchPublicOpenBook("a", URL_BASE, f)).rejects.toThrow("500");
  });
});

describe("fetchOpenBookPreview", () => {
  beforeEach(() => fake.reset());

  const draft = () => fake.onRpc("preview_open_book", () => ({ v: 1, stats: { places: 1 } }));

  it("reads the draft dressed as the next release, numbered after this campaign's latest", async () => {
    draft();
    fake.seed("open_book_releases", [
      { campaign_id: "c1", number: 3 },
      { campaign_id: "c1", number: 1 },
      { campaign_id: "other", number: 9 },
    ]);
    const result = await fetchOpenBookPreview("salt", "c1");
    expect(result).toMatchObject({ status: "found", book: { indexable: false, release: { number: 4, pdf_url: null } } });
  });

  it("numbers the first release 1", async () => {
    draft();
    expect(await fetchOpenBookPreview("salt", "c1")).toMatchObject({ book: { release: { number: 1 } } });
  });

  it("gives way to the public read when the owner check refuses, and throws any other failure", async () => {
    fake.failNext("preview_open_book", { code: "42501", message: "not the owner" });
    expect(await fetchOpenBookPreview("salt", "c1")).toBeNull();

    fake.failNext("preview_open_book", { code: "XX000", message: "boom" });
    await expect(fetchOpenBookPreview("salt", "c1")).rejects.toMatchObject({ message: "boom" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { fetchPublicOpenBook, publicOpenBookUrl } from "./usePublicOpenBook";

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

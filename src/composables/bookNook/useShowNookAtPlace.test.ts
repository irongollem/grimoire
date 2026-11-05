// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));

import { showNookAtPlace } from "./useShowNookAtPlace";

beforeEach(() => fake.reset());

describe("showNookAtPlace", () => {
  it("takes the nook off the place that held it before the new place gets it", async () => {
    fake.seed("book_nooks", [{ id: "n1", still_url: null }]);
    fake.seed("locations", [
      { id: "old", book_nook_id: "n1" },
      { id: "new", book_nook_id: null },
    ]);
    await showNookAtPlace("new", "n1");
    expect(fake.rows("locations")).toMatchObject([
      { id: "old", book_nook_id: null },
      { id: "new", book_nook_id: "n1" },
    ]);
    // Clear first: the unique index would reject the second holder otherwise.
    const writes = fake.calls.filter((c) => c.op === "update").map((c) => c.payload);
    expect(writes[0]).toEqual({ book_nook_id: null });
  });

  it("writes the still to the place's picture", async () => {
    fake.seed("book_nooks", [{ id: "n1", still_url: "https://cdn.example.invalid/still.webp" }]);
    fake.seed("locations", [{ id: "p", book_nook_id: null, image_url: "https://cdn.example.invalid/old.webp" }]);
    await showNookAtPlace("p", "n1");
    expect(fake.rows("locations")).toMatchObject([{ image_url: "https://cdn.example.invalid/still.webp" }]);
  });

  it("leaves the picture alone when the nook has no still yet", async () => {
    fake.seed("book_nooks", [{ id: "n1", still_url: null }]);
    fake.seed("locations", [{ id: "p", book_nook_id: null, image_url: "https://cdn.example.invalid/old.webp" }]);
    await showNookAtPlace("p", "n1");
    expect(fake.rows("locations")).toMatchObject([{ book_nook_id: "n1", image_url: "https://cdn.example.invalid/old.webp" }]);
  });

  it("showing no nook clears only that place", async () => {
    fake.seed("locations", [{ id: "a", book_nook_id: "n1" }, { id: "b", book_nook_id: "n2" }]);
    await showNookAtPlace("a", null);
    expect(fake.rows("locations")).toMatchObject([{ book_nook_id: null }, { book_nook_id: "n2" }]);
  });
});

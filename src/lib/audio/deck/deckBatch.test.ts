import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the embedded request: records what each call selected.
const remote = vi.hoisted(() => ({
  selects: [] as string[],
  fail: false,
  body: { pads: [{ id: "pad-1" }], pages: [{ id: "page-1" }], playlists: [{ id: "pl-1" }], sounds: [{ id: "s-1" }] } as Record<string, unknown>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      let selected = "";
      const chain = {
        select: (s: string) => {
          selected = s;
          return chain;
        },
        eq: () => chain,
        order: () => chain,
        single: async () => {
          remote.selects.push(selected);
          return remote.fail ? { data: null, error: new Error("offline") } : { data: remote.body, error: null };
        },
      };
      return chain;
    },
  },
}));

import { readDeckSlice } from "./deckBatch";

const own = (rows: unknown[]) => vi.fn(async () => rows as never[]);

beforeEach(() => {
  remote.selects = [];
  remote.fail = false;
});

describe("readDeckSlice", () => {
  // Bug (#1138 budgets): a cold start or a resume read the deck's four tables as four requests.
  it("fetches slices read together in one request", async () => {
    const owns = [own([]), own([]), own([]), own([])];
    const rows = await Promise.all([
      readDeckSlice("c1", "pads", owns[0]!),
      readDeckSlice("c1", "pages", owns[1]!),
      readDeckSlice("c1", "playlists", owns[2]!),
      readDeckSlice("c1", "sounds", owns[3]!),
    ]);
    expect(remote.selects).toHaveLength(1);
    expect(owns.every((f) => f.mock.calls.length === 0)).toBe(true);
    expect(rows).toEqual([[{ id: "pad-1" }], [{ id: "page-1" }], [{ id: "pl-1" }], [{ id: "s-1" }]]);
  });

  // Bug it guards against: two slices refetched together re-downloading all four tables.
  it("asks only for the slices read together", async () => {
    await Promise.all([readDeckSlice("c1", "pads", own([])), readDeckSlice("c1", "sounds", own([]))]);
    expect(remote.selects).toHaveLength(1);
    expect(remote.selects[0]).toContain("soundboard_pads");
    expect(remote.selects[0]).toContain("sounds(*)");
    expect(remote.selects[0]).not.toContain("soundboard_pages");
  });

  // Bug it guards against: a ring for one table going through the embedded read.
  it("reads a slice read alone from its own table", async () => {
    const alone = own([{ id: "s-2" }]);
    expect(await readDeckSlice("c1", "sounds", alone)).toEqual([{ id: "s-2" }]);
    expect(alone).toHaveBeenCalledTimes(1);
    expect(remote.selects).toEqual([]);
  });

  it("keeps each campaign's reads apart", async () => {
    const a = own([]);
    const b = own([]);
    await Promise.all([readDeckSlice("c1", "pads", a), readDeckSlice("c2", "pages", b)]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(remote.selects).toEqual([]);
  });

  it("rejects every slice of a failed shared read, and the next read starts afresh", async () => {
    remote.fail = true;
    const read = Promise.all([readDeckSlice("c1", "pads", own([])), readDeckSlice("c1", "pages", own([]))]);
    await expect(read).rejects.toThrow("offline");
    remote.fail = false;
    expect(await Promise.all([readDeckSlice("c1", "pads", own([])), readDeckSlice("c1", "pages", own([]))])).toEqual([
      [{ id: "pad-1" }],
      [{ id: "page-1" }],
    ]);
    expect(remote.selects).toHaveLength(2);
  });

  // Bug it guards against: an embed the response lacks resolving to undefined and blanking the deck.
  it("gives an empty list for a slice the response leaves out", async () => {
    remote.body = { pads: [{ id: "pad-1" }] };
    const [, pages] = await Promise.all([readDeckSlice("c1", "pads", own([])), readDeckSlice("c1", "pages", own([]))]);
    expect(pages).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { PostgrestError } from "@supabase/supabase-js";
import { fetchAllRows, POSTGREST_PAGE } from "./fetchAllRows";

function pagedSource(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  return vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
}

describe("fetchAllRows", () => {
  it("reads past the row cap until a short page", async () => {
    const page = pagedSource(POSTGREST_PAGE * 2 + 37);
    const all = await fetchAllRows(page);
    expect(all).toHaveLength(POSTGREST_PAGE * 2 + 37);
    expect(all.at(-1)).toBe(POSTGREST_PAGE * 2 + 36);
    expect(page.mock.calls).toEqual([
      [0, POSTGREST_PAGE - 1],
      [POSTGREST_PAGE, POSTGREST_PAGE * 2 - 1],
      [POSTGREST_PAGE * 2, POSTGREST_PAGE * 3 - 1],
    ]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const page = pagedSource(POSTGREST_PAGE);
    expect(await fetchAllRows(page)).toHaveLength(POSTGREST_PAGE);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("throws the query's error", async () => {
    const error = new PostgrestError({ message: "boom", details: "", hint: "", code: "500" });
    await expect(fetchAllRows(async () => ({ data: null, error }))).rejects.toBe(error);
  });
});

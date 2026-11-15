import { describe, expect, it } from "vitest";
import { mergeQuotas } from "./planQuotas";

describe("mergeQuotas", () => {
  it("keeps a key the form does not know, so saving a campaign limit does not lift the storage ceiling", () => {
    expect(mergeQuotas({ campaigns: 1, storage_mb: 500 }, { campaigns: 3 })).toEqual({ campaigns: 3, storage_mb: 500 });
  });
});

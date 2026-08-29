import { describe, it, expect } from "vitest";
import { BUCKETS } from "./buckets";
import { LOCAL_BUCKETS } from "../../../scripts/dev-buckets.data";

/**
 * dev-buckets.ts restates the bucket registry because it cannot import
 * buckets.ts under node (see the comment on LOCAL_BUCKETS). This test is what
 * makes the duplicate safe: add a bucket to the registry and this fails until
 * the script learns about it, so a fresh local stack never quietly misses one.
 */
describe("dev-buckets mirrors the storage registry", () => {
  it("covers exactly the same bucket ids", () => {
    const registry = Object.values(BUCKETS).map((b) => b.id).sort();
    const script = LOCAL_BUCKETS.map((b) => b.id).sort();
    expect(script).toEqual(registry);
  });

  it("matches every bucket's public flag, size cap and MIME allowlist", () => {
    for (const bucket of Object.values(BUCKETS)) {
      const mirrored = LOCAL_BUCKETS.find((b) => b.id === bucket.id);
      expect(mirrored, `${bucket.id} missing from dev-buckets.ts`).toBeDefined();
      expect(mirrored?.public, `${bucket.id} public flag`).toBe(bucket.public);
      expect(mirrored?.maxBytes, `${bucket.id} size cap`).toBe(bucket.maxBytes);
      expect([...(mirrored?.mimeTypes ?? [])], `${bucket.id} MIME list`).toEqual([...bucket.mimeTypes]);
    }
  });
});

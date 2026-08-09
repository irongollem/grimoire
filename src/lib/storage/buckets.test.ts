import { describe, it, expect } from "vitest";
import { BUCKETS, type BucketConfig, type BucketKey } from "./buckets";
import { CDN_BUCKET_IDS } from "@edge-shared/cdn-buckets.ts";
import { R2_BUCKET_IDS, isR2Bucket } from "@edge-shared/r2/config.ts";
import { STORAGE_WRITE_POLICY, bucketWritePolicy } from "@edge-shared/storage-policy.ts";

const bucketEntries = Object.entries(BUCKETS) as [BucketKey, BucketConfig][];

describe("CDN bucket registry", () => {
  // The list is declared twice — once as a per-bucket `cdn` flag carrying the
  // reasoning, once as CDN_BUCKET_IDS in _shared so Deno can read it (it cannot
  // resolve `@/`). These assertions are what make that safe: neither list can
  // drift without a red test.
  it("agrees with CDN_BUCKET_IDS in both directions", () => {
    const fromRegistry = bucketEntries.filter(([, c]) => c.cdn).map(([, c]) => c.id).sort();
    expect(fromRegistry).toEqual([...CDN_BUCKET_IDS].sort());
  });

  it("fronts every bucket, including sounds and mini-models", () => {
    // sounds: shared playback has every client fetch its own copy, so it is the
    // bucket where origin egress scales worst.
    expect(BUCKETS.sounds.cdn).toBe(true);
    // mini-models joined in stage 2 because it moved to R2, and an R2 object is
    // reachable only through the Worker.
    expect(BUCKETS.miniModels.cdn).toBe(true);
    expect(bucketEntries.every(([, c]) => c.cdn)).toBe(true);
  });
});

describe("R2 rollout (#577 stage 2)", () => {
  it("keeps every R2-backed bucket CDN-fronted", () => {
    // Not a style rule. R2 objects have no public origin of their own — the only
    // way to read one is through the Worker on the CDN hostname. An R2 bucket
    // with `cdn: false` would emit Supabase URLs for bytes that are not there.
    for (const id of R2_BUCKET_IDS) {
      const entry = bucketEntries.find(([, c]) => c.id === id);
      expect(entry, `${id} is R2-backed but missing from BUCKETS`).toBeTruthy();
      expect(entry?.[1].cdn, `${id} is R2-backed but not CDN-fronted`).toBe(true);
    }
  });

  it("routes every registered bucket's writes to R2", () => {
    // All of them, not a subset. A registry where some buckets write to one
    // store and some to another is the split-brain #577 exists to avoid, and
    // the flip is safe everywhere because reads are already dual — objects
    // written before it keep resolving through the Worker's Supabase fallback.
    for (const [key, cfg] of bucketEntries) {
      expect(isR2Bucket(cfg.id), `${key} (${cfg.id}) should be R2-backed`).toBe(true);
    }
  });

  it("does not claim buckets outside the registry", () => {
    // downtime-images (src/data/downtimeArt.ts) is written outside BUCKETS
    // entirely, so nothing here manages its bytes. bug-reports was too, until
    // 20260809000002 retired it — it stays asserted so a future createBucket
    // call cannot quietly bring it back inside the registry.
    expect(isR2Bucket("bug-reports")).toBe(false);
    expect(isR2Bucket("downtime-images")).toBe(false);
    expect(isR2Bucket("tile-packs")).toBe(false);
  });
});

describe("server-enforced write policy mirrors the client registry", () => {
  // R2 has no equivalent of `storage.buckets`' MIME/size enforcement, so
  // STORAGE_WRITE_POLICY is the only thing applying these limits once a bucket
  // moves. If it drifts from BUCKETS, the client and the server disagree about
  // what is uploadable — silently, and only for R2-backed buckets.
  it("covers every registered bucket with matching limits", () => {
    for (const [key, cfg] of bucketEntries) {
      const policy = bucketWritePolicy(cfg.id);
      expect(policy, `${key} (${cfg.id}) missing from STORAGE_WRITE_POLICY`).toBeTruthy();
      expect(policy!.maxBytes, `${cfg.id} maxBytes`).toBe(cfg.maxBytes);
      expect([...policy!.mimeTypes].sort(), `${cfg.id} mimeTypes`).toEqual([...cfg.mimeTypes].sort());
    }
  });

  it("adds no bucket the client registry does not know about", () => {
    const known = new Set(bucketEntries.map(([, c]) => c.id));
    for (const policy of STORAGE_WRITE_POLICY) {
      expect(known.has(policy.id), `${policy.id} is in the write policy but not in BUCKETS`).toBe(true);
    }
  });
});

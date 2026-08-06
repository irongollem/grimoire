import { describe, it, expect } from "vitest";
import { R2_BUCKET_IDS, isR2Bucket, r2ObjectKey, r2ConfigFrom, r2Credentials } from "./config.ts";
import { __testing } from "./client.ts";
import { STORAGE_WRITE_POLICY } from "../storage-policy.ts";

const FULL_ENV: Record<string, string> = {
  R2_ACCOUNT_ID: "acct123",
  R2_BUCKET: "grimoire-assets",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: "secret",
};

const getter = (env: Record<string, string | undefined>) => (key: string) => env[key];

describe("r2ConfigFrom", () => {
  it("builds the endpoint from the account id", () => {
    const config = r2ConfigFrom(getter(FULL_ENV));
    expect(config?.endpoint).toBe("https://acct123.r2.cloudflarestorage.com");
    expect(config?.bucket).toBe("grimoire-assets");
  });

  it("returns null when any single variable is missing", () => {
    // Null is the deploy-before-the-infra-exists case: callers fall back to
    // Supabase Storage. A half-set config must never produce a half-working one.
    for (const key of Object.keys(FULL_ENV)) {
      const partial = { ...FULL_ENV, [key]: undefined };
      expect(r2ConfigFrom(getter(partial))).toBeNull();
    }
    expect(r2ConfigFrom(getter({}))).toBeNull();
  });

  it("treats a blank or whitespace value as unset", () => {
    expect(r2ConfigFrom(getter({ ...FULL_ENV, R2_BUCKET: "   " }))).toBeNull();
  });

  it("uses region auto and service s3", () => {
    const creds = r2Credentials(r2ConfigFrom(getter(FULL_ENV))!);
    expect(creds.region).toBe("auto");
    expect(creds.service).toBe("s3");
  });
});

describe("r2ObjectKey", () => {
  it("is the CDN pathname without its leading slash", () => {
    // This equality is the reason the stage-2 cutover rewrites zero rows.
    const key = r2ObjectKey("mini-models", "u1/mini-7/model.stl");
    expect(key).toBe("mini-models/u1/mini-7/model.stl");
    expect(new URL(`https://cdn.dungeongrimoire.com/${key}`).pathname.slice(1)).toBe(key);
  });

  it("tolerates a leading slash on the path", () => {
    expect(r2ObjectKey("chronicle", "/u1/a.webp")).toBe("chronicle/u1/a.webp");
  });
});

describe("R2 bucket rollout list", () => {
  it("only names buckets that exist in the write policy", () => {
    const known = new Set(STORAGE_WRITE_POLICY.map((p) => p.id));
    for (const id of R2_BUCKET_IDS) expect(known.has(id)).toBe(true);
  });

  it("recognises listed buckets and nothing else", () => {
    expect(isR2Bucket("mini-models")).toBe(true);
    expect(isR2Bucket("npc-portraits")).toBe(true);
    expect(isR2Bucket("sounds")).toBe(true);
    // Outside the bucket registry, so no R2 path manages them.
    expect(isR2Bucket("bug-reports")).toBe(false);
    expect(isR2Bucket("downtime-images")).toBe(false);
  });

  it("covers every bucket in the write policy", () => {
    // The two lists moving together is what keeps the store choice uniform: a
    // bucket with a write policy but no R2 entry would silently keep writing to
    // Supabase long after everything else moved.
    expect([...R2_BUCKET_IDS].sort()).toEqual(STORAGE_WRITE_POLICY.map((p) => p.id).sort());
  });
});

describe("object URL construction", () => {
  const config = r2ConfigFrom(getter(FULL_ENV))!;

  it("puts the R2 bucket first and the storage key after it", () => {
    const url = __testing.objectUrl(config, r2ObjectKey("mini-models", "u1/model.stl"));
    expect(url.href).toBe(
      "https://acct123.r2.cloudflarestorage.com/grimoire-assets/mini-models/u1/model.stl",
    );
  });

  it("encodes an awkward key once and survives the URL parser unchanged", () => {
    const url = __testing.objectUrl(config, r2ObjectKey("chronicle", "u1/a b(1).webp"));
    expect(url.pathname).toBe("/grimoire-assets/chronicle/u1/a%20b%281%29.webp");
  });
});

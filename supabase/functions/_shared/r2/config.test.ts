import { describe, it, expect } from "vitest";
import { isR2Bucket, r2ObjectKey, r2ConfigFrom, r2WritesEnabled } from "./config.ts";
import { __testing } from "./client.ts";

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

describe("r2WritesEnabled", () => {
  it("is on only for an R2-backed bucket with an asset CDN origin configured", () => {
    // An R2 object is reachable only through the CDN Worker: without a hostname
    // the bytes would land where no URL can reach them.
    expect(r2WritesEnabled("npc-portraits", "https://cdn.dungeongrimoire.com")).toBe(true);
    expect(r2WritesEnabled("npc-portraits", undefined)).toBe(false);
    expect(r2WritesEnabled("npc-portraits", null)).toBe(false);
    expect(r2WritesEnabled("npc-portraits", "   ")).toBe(false);
  });

  it("is off for a bucket the write policy does not manage, CDN or not", () => {
    expect(isR2Bucket("downtime-images")).toBe(false);
    expect(r2WritesEnabled("downtime-images", "https://cdn.dungeongrimoire.com")).toBe(false);
    expect(r2WritesEnabled("bug-reports", "https://cdn.dungeongrimoire.com")).toBe(false);
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

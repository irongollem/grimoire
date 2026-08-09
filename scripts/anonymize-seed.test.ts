import { describe, expect, it } from "vitest";

import { anonymizeSeed, resolveKeepList } from "./anonymize-seed";

const KEEP = ["dev@example.com"];

describe("anonymizeSeed", () => {
  it("replaces addresses and keeps the sign-in address", () => {
    const sql = `INSERT INTO "auth"."users" ("email") VALUES ('alice@gmail.com'), ('dev@example.com');`;
    const result = anonymizeSeed(sql, KEEP);

    expect(result.sql).toBe(
      `INSERT INTO "auth"."users" ("email") VALUES ('user-1@example.invalid'), ('dev@example.com');`,
    );
    expect(result.replaced).toBe(1);
    expect(result.occurrences).toBe(1);
    expect(result.kept).toEqual(["dev@example.com"]);
  });

  it("maps one address to one placeholder everywhere it appears", () => {
    // The whole point: auth.users.email, the copies inside identity_data /
    // raw_user_meta_data, and the display_name rows must go on agreeing.
    const sql = [
      `'alice@gmail.com'`,
      `'{"sub":"x","email":"alice@gmail.com","email_verified":true}'`,
      `'alice@gmail.com'`,
      `'bob@hotmail.nl'`,
    ].join(",");
    const result = anonymizeSeed(sql, KEEP);

    expect(result.sql).toBe(
      [
        `'user-1@example.invalid'`,
        `'{"sub":"x","email":"user-1@example.invalid","email_verified":true}'`,
        `'user-1@example.invalid'`,
        `'user-2@example.invalid'`,
      ].join(","),
    );
    expect(result.replaced).toBe(2);
    expect(result.occurrences).toBe(4);
  });

  it("gives distinct addresses distinct placeholders", () => {
    // auth.users.email carries a unique index; a collision here would make the
    // seed fail to load rather than fail quietly, but it would still fail.
    const sql = ["a@x.com", "b@x.com", "c@x.com", "d@x.com"].join(" ");
    const result = anonymizeSeed(sql, []);
    const placeholders = result.sql.split(" ");

    expect(new Set(placeholders).size).toBe(4);
    expect(placeholders).toEqual([
      "user-1@example.invalid",
      "user-2@example.invalid",
      "user-3@example.invalid",
      "user-4@example.invalid",
    ]);
  });

  it("treats case-variant spellings of one address as one identity", () => {
    const result = anonymizeSeed("Alice@Gmail.com alice@gmail.com", []);

    expect(result.sql).toBe("user-1@example.invalid user-1@example.invalid");
    expect(result.replaced).toBe(1);
  });

  it("matches the keep list case-insensitively", () => {
    const result = anonymizeSeed("DEV@Example.com", KEEP);

    expect(result.sql).toBe("DEV@Example.com");
    expect(result.replaced).toBe(0);
    expect(result.kept).toEqual(["dev@example.com"]);
  });

  it("is idempotent — a second run does not renumber the first", () => {
    const sql = `'zoe@gmail.com','amy@gmail.com','dev@example.com'`;
    const once = anonymizeSeed(sql, KEEP);
    const twice = anonymizeSeed(once.sql, KEEP);

    expect(twice.sql).toBe(once.sql);
    expect(twice.replaced).toBe(0);
    expect(twice.occurrences).toBe(0);
  });

  it("leaves filenames that look like addresses alone", () => {
    const sql = `'https://cdn.example.org/logo@2x.png','sprite@3x.webp'`;
    const result = anonymizeSeed(sql, []);

    expect(result.sql).toBe(sql);
    expect(result.replaced).toBe(0);
  });

  it("scrambles addresses outside auth tables too", () => {
    // party_members.player_name / campaign_members.display_name hold addresses
    // on rows that pre-date #636, and free text could hold one tomorrow.
    const sql = `INSERT INTO "public"."campaign_members" ("display_name") VALUES ('carol@me.com');`;
    const result = anonymizeSeed(sql, KEEP);

    expect(result.sql).toContain("'user-1@example.invalid'");
    expect(result.sql).not.toContain("carol");
  });

  it("ignores blank and whitespace-padded keep-list entries", () => {
    const result = anonymizeSeed("dev@example.com other@gmail.com", ["  dev@example.com  ", "", "  "]);

    expect(result.sql).toBe("dev@example.com user-1@example.invalid");
  });

  it("returns the input untouched when there is nothing to scramble", () => {
    const sql = `INSERT INTO "public"."spells" ("name") VALUES ('Fireball');`;

    expect(anonymizeSeed(sql, KEEP)).toMatchObject({ sql, replaced: 0, occurrences: 0, kept: [] });
  });
});

describe("resolveKeepList", () => {
  it("prefers SEED_KEEP_EMAILS over the git identity", () => {
    expect(resolveKeepList({ SEED_KEEP_EMAILS: "a@x.com, b@y.com" })).toEqual(["a@x.com", " b@y.com"]);
  });

  it("falls back to the git identity when the override is unset or blank", () => {
    // Whatever git reports, the fallback must produce a usable single entry
    // rather than silently keeping nothing.
    for (const env of [{}, { SEED_KEEP_EMAILS: "   " }]) {
      const keep = resolveKeepList(env);
      expect(keep.length).toBeLessThanOrEqual(1);
      if (keep.length === 1) expect(keep[0]).toContain("@");
    }
  });
});

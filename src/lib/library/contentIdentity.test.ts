import { describe, expect, it } from "vitest";
import { isSharedContent, isUuid } from "@/lib/library/contentIdentity";

describe("isSharedContent", () => {
  it.each([
    ["an owned row with no source key", { user_id: "owner", source_record_key: null }, false],
    ["an owned row that is not flagged shared", { user_id: "owner", is_shared: false }, false],
    ["an owned row flagged shared", { user_id: "owner", is_shared: true }, true],
    ["a row with no owner", { user_id: null }, true],
    ["a row with an empty owner", { user_id: "" }, true],
    ["an owned row carrying a provider record key", { user_id: "owner", source_record_key: "provider:key" }, true],
  ])("%s", (_what, row, shared) => {
    expect(isSharedContent(row)).toBe(shared);
  });
});

describe("isUuid", () => {
  it.each([
    ["8ae92a3c-6d86-4fd6-8ad1-81f584abc772", true],
    ["8AE92A3C-6D86-4FD6-8AD1-81F584ABC772", true],
    // version nibble 1-5 and variant 8, 9, a or b are the RFC 4122 forms the database mints
    ["8ae92a3c-6d86-5fd6-bad1-81f584abc772", true],
    ["8ae92a3c-6d86-6fd6-8ad1-81f584abc772", false],
    ["8ae92a3c-6d86-4fd6-cad1-81f584abc772", false],
    ["srd_fireball", false],
  ])("%s -> %s", (value, expected) => {
    expect(isUuid(value)).toBe(expected);
  });
});

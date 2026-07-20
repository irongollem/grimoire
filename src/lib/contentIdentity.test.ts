import { describe, expect, it } from "vitest";
import { isSharedContent, isUuid } from "./contentIdentity";

describe("content identity", () => {
  it("does not infer shared content from an ID prefix", () => {
    expect(isSharedContent({ user_id: "owner", source_record_key: null })).toBe(false);
    expect(isSharedContent({ user_id: "", source_record_key: "provider:key" })).toBe(true);
  });

  it("recognizes only database UUID keys as custom-table candidates", () => {
    expect(isUuid("8ae92a3c-6d86-4fd6-8ad1-81f584abc772")).toBe(true);
    expect(isUuid("srd_fireball")).toBe(false);
  });
});

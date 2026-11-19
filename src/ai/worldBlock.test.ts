import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { requireWorld } from "./worldBlock";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("requireWorld", () => {
  it("refuses a missing block loudly instead of reading it as an empty world", () => {
    expect(() => requireWorld(null)).toThrow(/world block was not loaded/);
  });
});

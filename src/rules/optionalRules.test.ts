import { describe, expect, it } from "vitest";
import { getOptionalRule } from "./optionalRules";

describe("crafting_ai_invention", () => {
  const rule = getOptionalRule("crafting_ai_invention");

  it("is a DM rule that is on by default", () => {
    expect(rule?.dmOnly).toBe(true);
    expect(rule?.defaultEnabled).toBe(true);
  });

  it("exposes the value multiple the server reads, defaulting to 2", () => {
    const field = rule?.config?.find((f) => f.key === "value_multiple");
    expect(field).toMatchObject({ type: "number", default: 2, min: 1, max: 5 });
  });
});

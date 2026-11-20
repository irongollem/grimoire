import { describe, expect, it } from "vitest";
import { parseUsageLog } from "./usageLog";

const beacon = { reason: "quest_generation", is_byok: true, amount: 0, model: "gpt-x", provider: "openai", input_tokens: 120, output_tokens: 40 };

describe("parseUsageLog", () => {
  it("#1234 refuses a body that asks to spend credits rather than log BYOK usage", () => {
    expect(parseUsageLog({ ...beacon, is_byok: false, amount: 5 })).toBeNull();
    expect(parseUsageLog({ reason: "quest_generation", amount: 5 })).toBeNull();
  });

  it("refuses a reason the cost reports could not group", () => {
    expect(parseUsageLog({ ...beacon, reason: "Free credits!" })).toBeNull();
    expect(parseUsageLog({ ...beacon, reason: "" })).toBeNull();
  });

  it("keeps the counts a provider reported and drops ones that are not counts", () => {
    expect(parseUsageLog({ ...beacon, input_tokens: Number.NaN, output_tokens: -3, image_count: 1.5 })).toMatchObject({
      input_tokens: undefined,
      output_tokens: undefined,
      image_count: undefined,
    });
    expect(parseUsageLog(beacon)).toMatchObject({ reason: "quest_generation", model: "gpt-x", input_tokens: 120, output_tokens: 40 });
  });

  it("logs a generation whose provider reported no token counts (#609)", () => {
    expect(parseUsageLog({ reason: "entity_image", is_byok: true })).toEqual(expect.objectContaining({ reason: "entity_image" }));
  });
});

import { describe, expect, it } from "vitest";
import { aggregateModelStats, type AiGenerationCostRow } from "./useAiUsageStats";

function row(over: Partial<AiGenerationCostRow>): AiGenerationCostRow {
  return {
    id: crypto.randomUUID(), user_id: "u", delta: -12, reason: "tile_pack_generation",
    model: "gpt-image-2", provider: "openai", quality: "low", size: "1024x1024",
    input_tokens: 262, input_image_tokens: 250, output_tokens: 196, image_count: 1,
    is_byok: false, created_at: "2026-08-26T00:00:00.000Z", estimated_cost_usd_cents: 0.919,
    ...over,
  };
}

describe("aggregateModelStats", () => {
  // The reason this is keyed on the variant and not the model: these two rows
  // share every rate and differ 26x on cost, and a tile pack emits twenty of the
  // cheap one per single expensive one — so a model-keyed mean tracks traffic
  // mix rather than cost, and collapses toward the tile as packs ship.
  it("keeps the quality tiers of one model apart", () => {
    const stats = aggregateModelStats([
      ...Array.from({ length: 20 }, () => row({})),
      row({ reason: "entity_image", quality: "high", size: "1024x1536", delta: -75, estimated_cost_usd_cents: 23.8154 }),
    ]);

    expect(stats).toHaveLength(2);
    const low = stats.find((s) => s.quality === "low")!;
    const high = stats.find((s) => s.quality === "high")!;
    expect(low.label).toBe("gpt-image-2 (low 1024x1024)");
    expect(high.label).toBe("gpt-image-2 (high 1024x1536)");
    expect(low.avg_cost_usd).toBeCloseTo(0.00919, 5);
    expect(high.avg_cost_usd).toBeCloseTo(0.238154, 5);
    // What a model-keyed average would have reported for all 21 together.
    const blended = (20 * 0.919 + 23.8154) / 21 / 100;
    expect(blended).toBeCloseTo(0.0201, 4);
    expect(high.avg_cost_usd / blended).toBeGreaterThan(11);
  });

  it("separates the same tier at different sizes, since tokens scale with area", () => {
    const stats = aggregateModelStats([
      row({ quality: "high", size: "1024x1024" }),
      row({ quality: "high", size: "1024x1536" }),
    ]);
    expect(stats.map((s) => s.size).sort()).toEqual(["1024x1024", "1024x1536"]);
  });

  // Rows written before the columns existed must not each become their own
  // bucket, nor vanish.
  it("still reports a model whose rows predate quality and size", () => {
    const stats = aggregateModelStats([
      row({ model: "gpt-image-1.5", quality: null, size: null }),
      row({ model: "gpt-image-1.5", quality: null, size: null }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]!.label).toBe("gpt-image-1.5");
    expect(stats[0]!.count).toBe(2);
  });
});

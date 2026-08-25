import { describe, expect, it } from "vitest";
import { createDraftManifest, createGenerationPlan, slotMechanics, upsertManifestSlot, type PackArtBible } from "./authoringPlan";

const bible: PackArtBible = {
  visual_medium: "painterly fantasy game art",
  rendering_conventions: ["orthographic top-down", "even lighting"],
  world_motifs: ["brass constellations"],
  tone_palette: ["midnight blue", "cold starlight"],
  environment_defaults: ["wintry mountains"],
  hard_canon: [],
  exclusions: ["snow"],
  pack_local_theme: "A sunny tropical celestial shrine.",
  campaign_consistency: "adaptive",
  source_campaign_context: "A wintry horror campaign in icy mountains.",
};

function manifest() {
  return createDraftManifest({
    packId: "celestial-observatory",
    name: "Celestial Observatory",
    description: bible.pack_local_theme,
    packVersion: 1,
  });
}

describe("createGenerationPlan", () => {
  it("derives exactly the 20 minimum required jobs from the live schema", () => {
    const plan = createGenerationPlan({ manifest: manifest(), artBible: bible, now: "2026-08-25T00:00:00.000Z" });

    expect(plan.jobs).toHaveLength(20);
    expect(plan.jobs.filter((job) => job.slot.category === "floor")).toHaveLength(8);
    expect(plan.jobs.filter((job) => job.slot.category === "solidBlock")).toHaveLength(4);
    expect(plan.schema_version).toBe(2);
    expect(plan.authoring).toEqual({
      default_mode: "interactive-imagegen",
      requires_openai_api_key: false,
      performs_metered_api_calls: false,
    });
    expect(plan.jobs[0]?.execution).toEqual({
      operation: "generate",
      default_mode: "interactive-imagegen",
      production_model_hint: "gpt-image-2",
      production_quality_hint: "low",
      requested_size: "1024x1024",
      acceptance_policy: "qa-passed-is-final",
      quality_escalation: "manual-only",
    });
  });

  it("keeps raw campaign context as provenance and out of adaptive slot prompts", () => {
    const plan = createGenerationPlan({ manifest: manifest(), artBible: bible });

    expect(plan.art_bible.source_campaign_context).toContain("wintry horror");
    expect(plan.jobs[0]?.prompt.final_prompt).not.toContain("wintry horror");
    expect(plan.jobs[0]?.prompt.final_prompt).not.toContain("wintry mountains");
    expect(plan.jobs[0]?.prompt.final_prompt).toContain("sunny tropical celestial shrine");
  });

  it("preserves job state when rebuilding a resumable plan", () => {
    const first = createGenerationPlan({ manifest: manifest(), artBible: bible, now: "2026-08-25T00:00:00.000Z" });
    const floor = first.jobs[0]!;
    floor.status = "rejected";
    floor.attempts.push({
      at: "2026-08-25T00:01:00.000Z",
      action: "rejected",
      note: "visible seam",
      execution: {
        provider: "openai",
        model: "gpt-image-2",
        quality: "low",
        request_id: "image-request-1",
        input_text_tokens: 252,
        output_image_tokens: 196,
        estimated_cost_usd: 0.00714,
      },
    });

    const rebuilt = createGenerationPlan({
      manifest: manifest(), artBible: bible, existingPlan: first, now: "2026-08-25T00:02:00.000Z",
    });

    expect(rebuilt.jobs[0]).toEqual(floor);
    expect(rebuilt.created_at).toBe(first.created_at);
    expect(rebuilt.updated_at).toBe("2026-08-25T00:02:00.000Z");
  });

  it("refreshes prompts from an edited art bible without losing retry history", () => {
    const first = createGenerationPlan({ manifest: manifest(), artBible: bible });
    first.jobs[0]!.status = "rejected";
    first.jobs[0]!.attempts.push({ at: "2026-08-25T00:01:00.000Z", action: "rejected", note: "too dark" });
    const editedBible = { ...bible, pack_local_theme: "A luminous coral observatory." };

    const rebuilt = createGenerationPlan({ manifest: manifest(), artBible: editedBible, existingPlan: first });

    expect(rebuilt.jobs[0]!.prompt.final_prompt).toContain("luminous coral observatory");
    expect(rebuilt.jobs[0]!.status).toBe("rejected");
    expect(rebuilt.jobs[0]!.attempts).toEqual(first.jobs[0]!.attempts);
  });

  it("can target one optional or existing schema slot explicitly", () => {
    const plan = createGenerationPlan({
      manifest: manifest(),
      artBible: bible,
      selectedSlotIds: ["objectChest:0"],
    });

    expect(plan.jobs.map((job) => job.id)).toEqual(["objectChest:0"]);
  });
});

it("encodes runtime wall geometry independently of visual style", () => {
  expect(slotMechanics({ category: "wallSegmentH", variant: 0 })).toMatchObject({
    footprint: "centered-horizontal-edge",
    alpha: "transparent-outside-footprint",
    tileable_edges: ["E", "W"],
  });
});

it("encodes rounded joint orientation in mechanics and prompt", () => {
  const plan = createGenerationPlan({
    manifest: manifest(),
    artBible: bible,
    selectedSlotIds: ["wallRoundJoint:L_NE:0"],
  });

  expect(plan.jobs[0]!.mechanics).toMatchObject({
    footprint: "rounded-junction",
    alpha: "transparent-outside-footprint",
    tileable_edges: ["N", "E"],
  });
  expect(plan.jobs[0]!.prompt.category_request).toContain("L_NE");
  expect(plan.jobs[0]!.prompt.category_request).toContain("N and E");
});

it("adds a normalized slot at its canonical manifest URL", () => {
  const draft = manifest();
  upsertManifestSlot(draft, { category: "wallSegmentH", variant: 0 }, 1234);

  expect(draft.assets.wallSegmentH).toEqual([{ variant: 0, url: "wallSegmentH/0.webp", byteSize: 1234 }]);
});

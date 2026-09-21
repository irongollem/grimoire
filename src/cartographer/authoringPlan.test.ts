import { describe, expect, it } from "vitest";
import { ROTATION_DERIVED, createDraftManifest, createGenerationPlan, enumerateSchemaSlots, rotationFor, rotationsOf, slotId, slotMechanics, upsertManifestSlot, type PackArtBible } from "./authoringPlan";
import { TILE_PACK_SCHEMA } from "./packSchema";

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
  it("plans 16 renders for the schema's 20 required slots, the other 4 being rotations", () => {
    const plan = createGenerationPlan({ manifest: manifest(), artBible: bible, now: "2026-08-25T00:00:00.000Z" });

    // The required floor is 20 slots; four of them — wallSegmentV x2,
    // doorClosedV, doorOpenV — are their horizontal counterparts turned
    // ninety degrees, so they are produced rather than rendered. A pack pays
    // for 16 and receives 20, and the vertical walls cannot drift from the
    // horizontal ones the way `celestial-observatory`'s did (22px against 14px).
    expect(enumerateSchemaSlots(false)).toHaveLength(20);
    expect(plan.jobs).toHaveLength(16);
    expect(plan.jobs.map((job) => job.id).filter((id) => rotationFor(id))).toEqual([]);
    expect(plan.jobs.filter((job) => job.slot.category === "floor")).toHaveLength(8);
    expect(plan.jobs.filter((job) => job.slot.category === "solidBlock")).toHaveLength(4);
    expect(plan.jobs.filter((job) => job.slot.category === "wallSegmentH")).toHaveLength(2);
    expect(plan.jobs.filter((job) => job.slot.category === "wallSegmentV")).toHaveLength(0);
    expect(plan.schema_version).toBe(TILE_PACK_SCHEMA.version);
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

  // The schema allows 8-16 floors and 1-3 doors; bounding the addressable set by
  // `min` made every variant above the minimum impossible to author.
  it("can target any variant the schema allows, not only the required minimum", () => {
    const plan = createGenerationPlan({
      manifest: manifest(),
      artBible: bible,
      selectedSlotIds: ["floor:15", "doorClosedH:2"],
    });

    expect(plan.jobs.map((job) => job.id)).toEqual(["floor:15", "doorClosedH:2"]);
    expect(enumerateSchemaSlots(false).filter((slot) => slot.category === "floor")).toHaveLength(8);
    expect(enumerateSchemaSlots(true).filter((slot) => slot.category === "floor")).toHaveLength(16);
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

// wallJoint is full-cell and opaque, and the renderer draws it as a small square
// on the grid intersection. Asking for arms reaching the declared edges put that
// request in the same prompt as "fill the complete square canvas".
it("asks for a filled canvas on wallJoint, matching its own mechanics", () => {
  const plan = createGenerationPlan({
    manifest: manifest(),
    artBible: bible,
    selectedSlotIds: ["wallJoint:CROSS:0"],
  });
  const job = plan.jobs[0]!;

  expect(job.mechanics).toMatchObject({ footprint: "full-cell", alpha: "opaque" });
  expect(job.prompt.category_request).toContain("fills the entire canvas");
  expect(job.prompt.category_request).not.toContain("only the declared");
  expect(job.prompt.constraints).toContain("fill the complete square canvas and tile continuously on every declared tileable edge");
});

it("adds a normalized slot at its canonical manifest URL", () => {
  const draft = manifest();
  upsertManifestSlot(draft, { category: "wallSegmentH", variant: 0 }, 1234);

  expect(draft.assets.wallSegmentH).toEqual([{ variant: 0, url: "wallSegmentH/0.webp", byteSize: 1234 }]);
});

describe("categoryRequest coverage (#902)", () => {
  /** Every legal slot, one per (category, side), planned in one go. */
  function everyCategoryPlan() {
    const slots = enumerateSchemaSlots(true);
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const slot of slots) {
      const key = `${slot.category}:${slot.side ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(slotId(slot));
    }
    return createGenerationPlan({
      manifest: createDraftManifest({ packId: "t", name: "T", description: "d", packVersion: 1 }),
      artBible: bible,
      selectedSlotIds: ids,
    });
  }

  /**
   * The regression #902 is about. Every optional category used to share one
   * fallback branch, so neighbouring categories differed by a single noun —
   * `rubble` and `debris` generated as the same picture, and 23 glyphs that a
   * DM must tell apart were described identically.
   */
  it("gives every category its own art direction, with none left on the fallback", () => {
    const jobs = everyCategoryPlan().jobs;
    const fallback = jobs.filter((job) => / overlay centred in one tile\./.test(job.prompt.category_request));
    expect(fallback.map((job) => job.id), "categories still sharing the generic fallback branch").toEqual([]);
  });

  it("never describes two different categories the same way", () => {
    const byRequest = new Map<string, string[]>();
    for (const job of everyCategoryPlan().jobs) {
      // Strip the per-variant sentence; it varies by number, not by subject.
      const subject = job.prompt.category_request.replace(/Variant \d+;.*$/, "").trim();
      byRequest.set(subject, [...(byRequest.get(subject) ?? []), job.id]);
    }
    const collisions = [...byRequest.entries()].filter(([, ids]) => new Set(ids.map((i) => i.split(":")[0])).size > 1);
    expect(collisions.map(([, ids]) => ids), "distinct categories sharing one description").toEqual([]);
  });

  it("keeps the pairs that were being confused apart in words", () => {
    const by = new Map(everyCategoryPlan().jobs.map((job) => [job.id.split(":")[0], job.prompt.category_request]));
    // Each pair reads as the same thing unless the prompt says otherwise.
    expect(by.get("rubble")).not.toBe(by.get("debris"));
    expect(by.get("featureRubble")).toMatch(/mound|heap/i);
    expect(by.get("rubble")).toMatch(/scatter|loose/i);
    expect(by.get("objectStatue")).toMatch(/obelisk|plinth/i);
    expect(by.get("featureStatue")).toMatch(/humanoid|robed/i);
    expect(by.get("featureCache")).toMatch(/no lid|no box|buried|mound/i);
    expect(by.get("hazardFlameJet")).toMatch(/no bowl|no housing|bare/i);
  });
});

describe("rotation-derived slots", () => {
  const plan = (ids: string[]) => createGenerationPlan({
    manifest: createDraftManifest({ packId: "t", name: "T", description: "d", packVersion: 1 }),
    artBible: bible,
    selectedSlotIds: ids,
  });

  it("plans the horizontal source when the vertical is asked for", () => {
    expect(plan(["wallSegmentV:0"]).jobs.map((j) => j.id)).toEqual(["wallSegmentH:0"]);
    expect(plan(["doorOpenV:0"]).jobs.map((j) => j.id)).toEqual(["doorOpenH:0"]);
  });

  it("plans one job when both a source and its rotation are selected", () => {
    expect(plan(["wallSegmentH:0", "wallSegmentV:0"]).jobs.map((j) => j.id)).toEqual(["wallSegmentH:0"]);
  });

  it("collapses all four stair directions onto the north original", () => {
    const ids = plan(["stairsUp:N:0", "stairsUp:E:0", "stairsUp:S:0", "stairsUp:W:0"]).jobs.map((j) => j.id);
    expect(ids).toEqual(["stairsUp:N:0"]);
  });

  it("collapses the four rounded corners onto L_NE", () => {
    const ids = plan(["wallRoundJoint:L_SE:0", "wallRoundJoint:L_SW:0", "wallRoundJoint:L_NW:0"]).jobs.map((j) => j.id);
    expect(ids).toEqual(["wallRoundJoint:L_NE:0"]);
  });

  it("never lists a derived slot as its own source", () => {
    for (const [id, spec] of Object.entries(ROTATION_DERIVED)) {
      expect(spec.from, `${id} derives from itself`).not.toBe(id);
      expect(rotationFor(spec.from), `${spec.from} is both a source and derived`).toBeNull();
    }
  });

  it("names only slots the schema actually defines", () => {
    const known = new Set(enumerateSchemaSlots(true).map(slotId));
    for (const [id, spec] of Object.entries(ROTATION_DERIVED)) {
      expect(known.has(id), `${id} is not a schema slot`).toBe(true);
      expect(known.has(spec.from), `${spec.from} is not a schema slot`).toBe(true);
    }
  });

  it("round-trips: every derived slot is listed by its source", () => {
    for (const [id, spec] of Object.entries(ROTATION_DERIVED)) {
      expect(rotationsOf(spec.from).map((r) => r.id)).toContain(id);
    }
  });
});

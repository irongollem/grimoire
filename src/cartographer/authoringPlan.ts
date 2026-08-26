import {
  BASE_TILE_SIZE,
  TILE_PACK_SCHEMA,
  categoryDef,
  type AssetSlot,
  type PackCategory,
  type TilePackManifest,
} from "./packSchema.ts";
import { validatePack } from "./validatePack.ts";

export const GENERATION_PLAN_VERSION = 1;

export type CampaignConsistencyMode = "adaptive" | "match-campaign" | "independent";
export type JobStatus = "pending" | "generated" | "accepted" | "normalized" | "rejected" | "failed";
export type AlphaRequirement = "opaque" | "transparent-outside-footprint";
export type ImageGenerationQuality = "low" | "medium" | "high" | "auto";
export type SlotFootprint =
  | "full-cell"
  | "centered-horizontal-edge"
  | "centered-vertical-edge"
  | "rounded-junction"
  | "centered-overlay";

export interface PackArtBible {
  visual_medium: string;
  rendering_conventions: string[];
  world_motifs: string[];
  tone_palette: string[];
  environment_defaults: string[];
  hard_canon: string[];
  exclusions: string[];
  pack_local_theme: string;
  campaign_consistency: CampaignConsistencyMode;
  /** Provenance only. It is deliberately never interpolated into slot prompts. */
  source_campaign_context?: string;
}

export interface SlotIdentity {
  category: PackCategory;
  side?: string;
  variant: number;
}

export interface SlotMechanics {
  canvas: { width: typeof BASE_TILE_SIZE; height: typeof BASE_TILE_SIZE };
  footprint: SlotFootprint;
  alpha: AlphaRequirement;
  tileable_edges: readonly ("N" | "E" | "S" | "W")[];
  transforms_visually_safe: readonly [];
}

export interface PromptSpec {
  use_case: "stylized-concept";
  asset_type: string;
  shared_theme: string;
  category_request: string;
  constraints: string[];
  final_prompt: string;
}

export interface GenerationAttempt {
  at: string;
  action: "generated" | "accepted" | "normalized" | "rejected" | "failed";
  note?: string;
  source_path?: string;
  execution?: {
    provider?: string;
    model?: string;
    quality?: ImageGenerationQuality;
    request_id?: string;
    input_text_tokens?: number;
    input_image_tokens?: number;
    output_image_tokens?: number;
    estimated_cost_usd?: number;
    duration_ms?: number;
  };
}

export interface GenerationJob {
  id: string;
  slot: SlotIdentity;
  mechanics: SlotMechanics;
  prompt: PromptSpec;
  references: { path: string; role: "geometry-template" | "style-reference" | "user-reference" }[];
  execution: {
    operation: "generate";
    default_mode: "interactive-imagegen";
    production_model_hint: "gpt-image-2";
    production_quality_hint: "low";
    requested_size: "1024x1024";
    acceptance_policy: "qa-passed-is-final";
    quality_escalation: "manual-only";
  };
  paths: {
    prompt: string;
    template: string;
    raw: string;
    accepted: string;
    normalized: string;
  };
  status: JobStatus;
  attempts: GenerationAttempt[];
}

export interface GenerationPlan {
  format: "grimoire-cartographer-generation-plan";
  format_version: typeof GENERATION_PLAN_VERSION;
  schema_version: number;
  created_at: string;
  updated_at: string;
  pack: {
    id: string;
    name: string;
    description: string;
    version: number;
    base_tile_size: typeof BASE_TILE_SIZE;
  };
  authoring: {
    default_mode: "interactive-imagegen";
    requires_openai_api_key: false;
    performs_metered_api_calls: false;
  };
  art_bible: PackArtBible;
  user_reference_images: string[];
  jobs: GenerationJob[];
}

export interface CreatePlanInput {
  manifest: TilePackManifest;
  artBible: PackArtBible;
  userReferenceImages?: string[];
  selectedSlotIds?: string[];
  existingPlan?: GenerationPlan;
  now?: string;
}

const EDGE_CATEGORIES = new Set<PackCategory>([
  "wallSegmentH", "wallSegmentV", "doorClosedH", "doorClosedV", "doorOpenH", "doorOpenV",
]);
const OVERLAY_CATEGORIES = new Set<PackCategory>([
  "rubble", "debris", "objectChest", "objectBarrel", "objectTable",
  "objectStatue", "objectPillar", "objectBrazier",
]);

function jointEdges(side: string | undefined): readonly ("N" | "E" | "S" | "W")[] {
  if (!side) return [];
  if (side === "CROSS") return ["N", "E", "S", "W"];
  if (side.startsWith("L_")) return side.slice(2).split("") as ("N" | "E" | "S" | "W")[];
  if (side.startsWith("T_")) return (["N", "E", "S", "W"] as const).filter((edge) => edge !== side.slice(2));
  return [];
}

export function createDraftManifest(input: {
  packId: string;
  name: string;
  description: string;
  packVersion: number;
  palette?: TilePackManifest["palette"];
}): TilePackManifest {
  return {
    pack_id: input.packId,
    name: input.name,
    description: input.description,
    pack_version: input.packVersion,
    schema_version: TILE_PACK_SCHEMA.version,
    base_tile_size: BASE_TILE_SIZE,
    assets: {},
    ...(input.palette ? { palette: input.palette } : {}),
  };
}

export function slotId(slot: SlotIdentity): string {
  return [slot.category, slot.side, slot.variant].filter((part) => part !== undefined).join(":");
}

export function slotRelativePath(slot: SlotIdentity): string {
  return slot.side
    ? `${slot.category}/${slot.side}/${slot.variant}.webp`
    : `${slot.category}/${slot.variant}.webp`;
}

export function slotMechanics(slot: SlotIdentity): SlotMechanics {
  let footprint: SlotFootprint = "full-cell";
  if (slot.category.endsWith("H") && EDGE_CATEGORIES.has(slot.category)) footprint = "centered-horizontal-edge";
  else if (slot.category.endsWith("V") && EDGE_CATEGORIES.has(slot.category)) footprint = "centered-vertical-edge";
  else if (slot.category === "wallRoundJoint") footprint = "rounded-junction";
  else if (OVERLAY_CATEGORIES.has(slot.category)) footprint = "centered-overlay";

  const alpha = EDGE_CATEGORIES.has(slot.category) || slot.category === "wallRoundJoint" || OVERLAY_CATEGORIES.has(slot.category)
    ? "transparent-outside-footprint"
    : "opaque";
  const tileableEdges = slot.category === "wallJoint" || slot.category === "wallRoundJoint"
    ? jointEdges(slot.side)
    : slot.category === "floor" || slot.category === "solidBlock"
    ? (["N", "E", "S", "W"] as const)
    : footprint === "centered-horizontal-edge"
      ? (["E", "W"] as const)
      : footprint === "centered-vertical-edge"
        ? (["N", "S"] as const)
        : ([] as const);

  return {
    canvas: { width: BASE_TILE_SIZE, height: BASE_TILE_SIZE },
    footprint,
    alpha,
    tileable_edges: tileableEdges,
    transforms_visually_safe: [],
  };
}

export function enumerateSchemaSlots(includeOptional = false): SlotIdentity[] {
  const slots: SlotIdentity[] = [];
  for (const category of Object.keys(TILE_PACK_SCHEMA.categories) as PackCategory[]) {
    const def = categoryDef(category);
    if (def.kind === "optional") {
      if (includeOptional) {
        for (let variant = 0; variant < def.max; variant++) slots.push({ category, variant });
      }
      continue;
    }
    if (def.kind === "directional") {
      if (def.optional && !includeOptional) continue;
      const variants = def.variantsPerSide ?? 1;
      for (const side of def.sides) {
        for (let variant = 0; variant < variants; variant++) slots.push({ category, side, variant });
      }
      continue;
    }
    for (let variant = 0; variant < def.min; variant++) slots.push({ category, variant });
  }
  return slots;
}

function missingSlots(manifest: TilePackManifest): SlotIdentity[] {
  return validatePack(manifest).missing.map(({ category, side, variant }) => ({
    category,
    ...(side ? { side } : {}),
    variant: variant ?? 0,
  }));
}

function categoryRequest(slot: SlotIdentity, mechanics: SlotMechanics): string {
  const variation = `Variant ${slot.variant}; make its motif layout genuinely distinct from sibling variants while preserving one coherent family.`;
  switch (slot.category) {
    case "floor":
      return `A seamless walkable floor tile viewed directly from above. ${variation}`;
    case "solidBlock":
      return `A seamless full-cell mass of substantial architecture, visibly heavier than the walkable floor. ${variation}`;
    case "wallSegmentH":
    case "wallSegmentV":
      return `A straight wall running through the exact canvas centre on the ${mechanics.footprint === "centered-horizontal-edge" ? "horizontal" : "vertical"} axis. ${variation}`;
    case "doorClosedH":
    case "doorClosedV":
      return `An unmistakably closed door integrated into a centred ${mechanics.footprint === "centered-horizontal-edge" ? "horizontal" : "vertical"} wall threshold.`;
    case "doorOpenH":
    case "doorOpenV":
      return `An unmistakably open doorway integrated into a centred ${mechanics.footprint === "centered-horizontal-edge" ? "horizontal" : "vertical"} wall threshold, keeping the crossing visibly clear.`;
    case "stairsUp":
    case "stairsDown":
      return `A top-down ${slot.category === "stairsUp" ? "ascending" : "descending"} stair tile oriented toward ${slot.side}.`;
    case "wallRoundJoint":
      return `A broad, smooth 90-degree wall corner for the exact ${slot.side} connection: wall mass reaches the ${jointEdges(slot.side).join(" and ")} canvas edges, with the opposite interior quadrant carved into one clean quarter-circle.`;
    case "wallJoint":
      return `A wall junction for the exact ${slot.side} connection, with wall mass reaching only the declared ${jointEdges(slot.side).join(", ")} canvas edges from the centre.`;
    default:
      return `A top-down ${slot.category} overlay centred in one tile. ${variation}`;
  }
}

function mechanicalConstraints(mechanics: SlotMechanics): string[] {
  const constraints = [
    "exact orthographic top-down view",
    "one tile asset only; no sprite sheet, grid, text, characters, or watermark",
    "even readable lighting with no cast shadow beyond the tile contract",
    "preserve clear shapes when reduced to 128×128",
  ];
  if (mechanics.footprint === "centered-horizontal-edge") {
    constraints.push("structure runs left-to-right in a narrow band through the exact vertical centre and terminates cleanly at both side edges");
  } else if (mechanics.footprint === "centered-vertical-edge") {
    constraints.push("structure runs top-to-bottom in a narrow band through the exact horizontal centre and terminates cleanly at both end edges");
  } else if (mechanics.footprint === "full-cell") {
    constraints.push("fill the complete square canvas and tile continuously on every declared tileable edge");
  } else if (mechanics.footprint === "rounded-junction") {
    constraints.push("fill the connected wall mass to every declared canvas edge and preserve one clean transparent quarter-circle on the room-interior side");
  }
  if (mechanics.alpha === "transparent-outside-footprint") constraints.push("genuinely transparent background outside the required footprint");
  else constraints.push("fully opaque output");
  return constraints;
}

function sharedTheme(artBible: PackArtBible): string {
  const sections = [
    `Pack-local theme: ${artBible.pack_local_theme}`,
    `Visual medium: ${artBible.visual_medium}`,
    `Rendering conventions: ${artBible.rendering_conventions.join("; ")}`,
    artBible.world_motifs.length ? `Compatible world motifs: ${artBible.world_motifs.join("; ")}` : "",
    artBible.tone_palette.length ? `Tone and palette: ${artBible.tone_palette.join("; ")}` : "",
    artBible.environment_defaults.length && artBible.campaign_consistency === "match-campaign"
      ? `Environment defaults: ${artBible.environment_defaults.join("; ")}`
      : "",
    artBible.hard_canon.length ? `Hard canon: ${artBible.hard_canon.join("; ")}` : "",
    artBible.exclusions.length ? `Exclusions: ${artBible.exclusions.join("; ")}` : "",
  ];
  return sections.filter(Boolean).join("\n");
}

function buildPrompt(slot: SlotIdentity, artBible: PackArtBible, mechanics: SlotMechanics): PromptSpec {
  const theme = sharedTheme(artBible);
  const request = categoryRequest(slot, mechanics);
  const constraints = mechanicalConstraints(mechanics);
  return {
    use_case: "stylized-concept",
    asset_type: `Cartographer VTT tile — ${slot.category}`,
    shared_theme: theme,
    category_request: request,
    constraints,
    final_prompt: [
      "Use case: stylized-concept",
      `Asset type: Cartographer VTT tile — ${slot.category}`,
      `Primary request: ${request}`,
      theme,
      `Constraints: ${constraints.join("; ")}`,
    ].join("\n"),
  };
}

function createJob(
  slot: SlotIdentity,
  artBible: PackArtBible,
  userReferences: string[],
  pack: { id: string; version: number },
): GenerationJob {
  const id = slotId(slot);
  const safeId = id.replaceAll(":", "-");
  const mechanics = slotMechanics(slot);
  const template = `templates/${safeId}.png`;
  return {
    id,
    slot,
    mechanics,
    prompt: buildPrompt(slot, artBible, mechanics),
    references: [
      { path: template, role: "geometry-template" },
      ...userReferences.map((path) => ({ path, role: "user-reference" as const })),
    ],
    execution: {
      operation: "generate",
      default_mode: "interactive-imagegen",
      production_model_hint: "gpt-image-2",
      production_quality_hint: "low",
      requested_size: "1024x1024",
      acceptance_policy: "qa-passed-is-final",
      quality_escalation: "manual-only",
    },
    paths: {
      prompt: `prompts/${safeId}.txt`,
      template,
      raw: `raw/${safeId}.png`,
      accepted: `accepted/${safeId}.source`,
      normalized: `public/cartographer/${pack.id}/v${pack.version}/${slotRelativePath(slot)}`,
    },
    status: "pending",
    attempts: [],
  };
}

export function createGenerationPlan(input: CreatePlanInput): GenerationPlan {
  const now = input.now ?? new Date().toISOString();
  const allSlots = enumerateSchemaSlots(true);
  const byId = new Map(allSlots.map((slot) => [slotId(slot), slot]));
  const selected = input.selectedSlotIds?.length
    ? input.selectedSlotIds.map((id) => {
        const slot = byId.get(id);
        if (!slot) throw new Error(`Unknown schema slot: ${id}`);
        return slot;
      })
    : missingSlots(input.manifest);
  const existing = input.existingPlan?.jobs ?? [];
  const existingJobs = new Map(existing.map((job) => [job.id, job]));
  const references = input.userReferenceImages ?? input.existingPlan?.user_reference_images ?? [];
  const pack = { id: input.manifest.pack_id, version: input.manifest.pack_version };
  const jobs = [...existing];
  const included = new Set(jobs.map((job) => job.id));
  for (const slot of selected) {
    const id = slotId(slot);
    if (!included.has(id)) {
      jobs.push(createJob(slot, input.artBible, references, pack));
      included.add(id);
    }
  }

  const refreshedJobs = jobs.map((job) => {
    const slot = byId.get(job.id);
    if (!slot) return job;
    const fresh = createJob(slot, input.artBible, references, pack);
    const previous = existingJobs.get(job.id);
    if (!previous) return fresh;
    return {
      ...fresh,
      status: previous.status,
      attempts: previous.attempts,
      paths: {
        ...fresh.paths,
        raw: previous.paths.raw,
        accepted: previous.paths.accepted,
      },
    };
  });

  return {
    format: "grimoire-cartographer-generation-plan",
    format_version: GENERATION_PLAN_VERSION,
    schema_version: TILE_PACK_SCHEMA.version,
    created_at: input.existingPlan?.created_at ?? now,
    updated_at: now,
    pack: {
      id: input.manifest.pack_id,
      name: input.manifest.name,
      description: input.manifest.description,
      version: input.manifest.pack_version,
      base_tile_size: BASE_TILE_SIZE,
    },
    authoring: {
      default_mode: "interactive-imagegen",
      requires_openai_api_key: false,
      performs_metered_api_calls: false,
    },
    art_bible: input.artBible,
    user_reference_images: references,
    jobs: refreshedJobs,
  };
}

export function upsertManifestSlot(manifest: TilePackManifest, slot: SlotIdentity, byteSize: number): void {
  const existing = [...(manifest.assets[slot.category] ?? [])] as AssetSlot[];
  const next: AssetSlot = {
    ...(slot.side ? { side: slot.side } : {}),
    variant: slot.variant,
    url: slotRelativePath(slot),
    byteSize,
  };
  const identity = slotId(slot);
  const withoutSlot = existing.filter((candidate) => slotId({
    category: slot.category,
    ...(candidate.side ? { side: candidate.side } : {}),
    variant: candidate.variant,
  }) !== identity);
  manifest.assets[slot.category] = [...withoutSlot, next].sort((a, b) =>
    (a.side ?? "").localeCompare(b.side ?? "") || a.variant - b.variant,
  );
}

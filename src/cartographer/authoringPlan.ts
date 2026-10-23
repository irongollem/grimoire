import {
  BASE_TILE_SIZE,
  TILE_PACK_SCHEMA,
  categoryDef,
  categoryLabel,
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
  "wallSegmentH", "wallSegmentV", "doorwayH", "doorwayV",
  "curbH", "curbV", "edgeGrateH", "edgeGrateV", "edgeSluiceH", "edgeSluiceV",
]);
const OVERLAY_CATEGORIES = new Set<PackCategory>([
  "rubble", "debris", "objectChest", "objectBarrel", "objectTable",
  "objectStatue", "objectPillar", "objectBrazier",
  // #804 — trap/feature glyphs draw the same way: a transparent-background
  // stamp centered in the cell, never an opaque full-cell fill.
  "hazardPit", "hazardPressurePlate", "hazardTripwire", "hazardFallingBlock",
  "hazardDartWall", "hazardBlade", "hazardFlameJet", "hazardGlyph",
  "hazardNet", "hazardAlarm", "hazardCollapsingFloor", "hazardGeneric",
  "featureSecretDoor", "featureHiddenPassage", "featureCache", "featureMovingWall",
  "featureLever", "featureAltar", "featureFountain", "featureStatue",
  "featureRubble", "featureInscription", "featureGeneric",
  // #1065 — a curb post and a wall decal are small centred stamps too.
  "curbPost", "wallDecal",
]);

/**
 * Slots that are a rotation of another slot, and never generated on their own.
 *
 * A vertical wall is a horizontal wall turned ninety degrees. Generating it
 * separately costs a render and — worse — lets it drift: `celestial-observatory`
 * was authored through the CLI with a human choosing every tile, and its
 * horizontal walls measure 22px against its vertical walls' 14px. Careful
 * supervision still produced two different walls. Deriving makes the two
 * identical by construction rather than by diligence.
 *
 * The plan format anticipated this: `GenerationJob.transforms_visually_safe`
 * has been declared since it was written, typed as the empty tuple and set to
 * `[]` everywhere, by someone who saw the idea and did not build it.
 *
 * Safe only because the art bible forbids directional cast shadows and the
 * base references shade symmetrically across the band — a gradient running
 * light-to-dark across a horizontal wall would, once turned, light every
 * vertical wall from the side and disagree with its neighbour at every corner.
 */
export const ROTATION_DERIVED: Readonly<Record<string, { readonly from: string; readonly degrees: 90 | 180 | 270 }>> = {
  "wallSegmentV:0": { from: "wallSegmentH:0", degrees: 90 },
  "wallSegmentV:1": { from: "wallSegmentH:1", degrees: 90 },
  "wallSegmentV:2": { from: "wallSegmentH:2", degrees: 90 },
  "wallSegmentV:3": { from: "wallSegmentH:3", degrees: 90 },
  "wallSegmentV:4": { from: "wallSegmentH:4", degrees: 90 },
  "wallSegmentV:5": { from: "wallSegmentH:5", degrees: 90 },
  "doorwayV:0": { from: "doorwayH:0", degrees: 90 },
  "doorwayV:1": { from: "doorwayH:1", degrees: 90 },
  "doorwayV:2": { from: "doorwayH:2", degrees: 90 },
  "curbV:0": { from: "curbH:0", degrees: 90 },
  "curbV:1": { from: "curbH:1", degrees: 90 },
  "curbV:2": { from: "curbH:2", degrees: 90 },
  "curbV:3": { from: "curbH:3", degrees: 90 },
  "curbV:4": { from: "curbH:4", degrees: 90 },
  "curbV:5": { from: "curbH:5", degrees: 90 },
  "edgeGrateV:0": { from: "edgeGrateH:0", degrees: 90 },
  "edgeGrateV:1": { from: "edgeGrateH:1", degrees: 90 },
  "edgeGrateV:2": { from: "edgeGrateH:2", degrees: 90 },
  "edgeSluiceV:0": { from: "edgeSluiceH:0", degrees: 90 },
  "edgeSluiceV:1": { from: "edgeSluiceH:1", degrees: 90 },
  "edgeSluiceV:2": { from: "edgeSluiceH:2", degrees: 90 },
  // Stairs rotate about the cell centre from their N original.
  "stairsUp:E:0": { from: "stairsUp:N:0", degrees: 90 },
  "stairsUp:S:0": { from: "stairsUp:N:0", degrees: 180 },
  "stairsUp:W:0": { from: "stairsUp:N:0", degrees: 270 },
  "stairsDown:E:0": { from: "stairsDown:N:0", degrees: 90 },
  "stairsDown:S:0": { from: "stairsDown:N:0", degrees: 180 },
  "stairsDown:W:0": { from: "stairsDown:N:0", degrees: 270 },
};

/** The rotation that produces this slot, or null if it must be generated. */
export function rotationFor(id: string): { from: string; degrees: 90 | 180 | 270 } | null {
  return ROTATION_DERIVED[id] ?? null;
}

/** Slots derived from this one, in the order they should be written. */
export function rotationsOf(sourceId: string): { id: string; degrees: 90 | 180 | 270 }[] {
  return Object.entries(ROTATION_DERIVED)
    .filter(([, spec]) => spec.from === sourceId)
    .map(([id, spec]) => ({ id, degrees: spec.degrees }));
}

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
  // The door leaf is not named like an edge category (no H/V) but is one: it is
  // the closed leaf lying along the band exactly where it sits in a doorwayH.
  if (slot.category === "doorLeaf") footprint = "centered-horizontal-edge";
  else if (slot.category.endsWith("H") && EDGE_CATEGORIES.has(slot.category)) footprint = "centered-horizontal-edge";
  else if (slot.category.endsWith("V") && EDGE_CATEGORIES.has(slot.category)) footprint = "centered-vertical-edge";
  else if (OVERLAY_CATEGORIES.has(slot.category)) footprint = "centered-overlay";

  const alpha = EDGE_CATEGORIES.has(slot.category) || slot.category === "doorLeaf" || OVERLAY_CATEGORIES.has(slot.category)
    ? "transparent-outside-footprint"
    : "opaque";
  const tileableEdges = slot.category === "doorLeaf"
    ? ([] as const) // a leaf spans only the opening; it joins nothing
    : slot.category === "wallJoint"
    ? jointEdges(slot.side)
    : slot.category === "floor" || slot.category === "solidBlock" || slot.category === "terrainWater"
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

/**
 * @param everyAllowedSlot false — the minimum complete pack (`min` variants, no
 *   optional categories). true — every slot the schema permits (`max` variants,
 *   optional included). `createGenerationPlan` resolves `--slot` against the
 *   latter, so bounding random categories by `min` there made every legal
 *   variant above the minimum unauthorable.
 */
export function enumerateSchemaSlots(everyAllowedSlot = false): SlotIdentity[] {
  const slots: SlotIdentity[] = [];
  for (const category of Object.keys(TILE_PACK_SCHEMA.categories) as PackCategory[]) {
    const def = categoryDef(category);
    if (def.kind === "optional") {
      if (everyAllowedSlot) {
        for (let variant = 0; variant < def.max; variant++) slots.push({ category, variant });
      }
      continue;
    }
    if (def.kind === "directional") {
      if (def.optional && !everyAllowedSlot) continue;
      const variants = def.variantsPerSide ?? 1;
      for (const side of def.sides) {
        for (let variant = 0; variant < variants; variant++) slots.push({ category, side, variant });
      }
      continue;
    }
    const count = everyAllowedSlot ? def.max : def.min;
    for (let variant = 0; variant < count; variant++) slots.push({ category, variant });
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
      // "Substantial architecture" invited the model to draw ARCHITECTURE: the
      // first run returned a miniature dungeon floor plan, complete with four
      // doors and corridors, for a tile that is supposed to be the inside of a
      // wall. A pack's brief names its doors and walls, and that brief is
      // appended to every slot's prompt, so a category that does not say what
      // it excludes inherits the whole pack's vocabulary.
      return `A single unbroken mass of solid stone filling the entire cell — the INSIDE of a wall, quarried rock seen from above, visibly denser and heavier than the walkable floor. It is not a room and not a plan: no doors, no corridors, no chambers, no floor, no openings, nothing a creature could stand on or pass through. ${variation}`;
    case "wallSegmentH":
    case "wallSegmentV":
      // Explicitly wall ONLY. The first run put a heavy oak door in the middle
      // of the plain wall segment — reasonably, since the pack brief mentions
      // its doors and every slot prompt carries that brief. A wall segment is
      // the most repeated tile on a map, so a door baked into it appears in
      // every wall run in the dungeon.
      return `A straight unbroken wall running through the exact canvas centre on the ${mechanics.footprint === "centered-horizontal-edge" ? "horizontal" : "vertical"} axis. Wall only, along its whole length: no door, no gate, no archway, no window, no opening or break of any kind — those are separate tiles. ${variation}`;
    case "doorwayH":
    case "doorwayV":
      // The opening alone. The old door prompts asked for a door and the model
      // drew one; the leaf is now its own tile drawn over this, so a door here
      // would show twice (and never swing).
      return `Seen from DIRECTLY ABOVE, looking down on the opening in a wall and its door frame and threshold. The opening is EMPTY: no door, no gate, no leaf, nothing drawn across it. The frame posts sit at each side of an opening half the cell wide, with the wall band continuing on either side. ${variation}`;
    case "doorLeaf":
      // Every earlier door prompt failed the same way: an unqualified "door"
      // means a front-facing elevation to an image model, so the viewpoint and
      // the end-grain are spelled out. This tile is composited over a doorwayH
      // and turned on its hinge, so it must be ONLY the leaf, at the exact
      // position it occupies when shut.
      return `Seen from DIRECTLY ABOVE, looking down on ONE closed door leaf, a narrow slab lying exactly in the opening of a wall, spanning it from hinge to latch. Its face is not visible from this angle: only its end grain, with the hinges at its left end. ONE leaf, never a pair. Nothing else: no wall, no frame, no floor. ${variation}`;
    case "curbH":
    case "curbV":
      return `A low continuous ledge seen from DIRECTLY ABOVE: the edge of a walkway where it drops to water or a lower level. Thinner than a wall, running the full length of the tile with its ends matching so it repeats without a seam. ${variation}`;
    case "curbPost":
      return `A squat stone post seen from DIRECTLY ABOVE, the kind set where a curb meets a wall or turns a corner. One post only, centred, nothing around it. ${variation}`;
    case "terrainWater":
      return `A continuous seamless liquid surface seen from DIRECTLY ABOVE, the pack's own water: no banks, no edges, no shoreline, no grid, no borders. It tiles on all four edges. ${variation}`;
    case "edgeGrateH":
    case "edgeGrateV":
      return `Seen from DIRECTLY ABOVE, a set of iron bars across an opening in the wall band, where water or a passage runs through. The wall continues on both sides of the bars. ${variation}`;
    case "edgeSluiceH":
    case "edgeSluiceV":
      return `Seen from DIRECTLY ABOVE, a gate set in the wall band, with its frame and winch. The wall continues on both sides of the gate. ${variation}`;
    case "wallDecal":
      return `A small detail set INTO a wall, seen from DIRECTLY ABOVE: a pipe mouth, a hole or a carving. No wall around it, centred in the tile. ${variation}`;
    case "stairsUp":
    case "stairsDown":
      return `A top-down ${slot.category === "stairsUp" ? "ascending" : "descending"} stair tile oriented toward ${slot.side}.`;
    case "wallJoint":
      // Full-cell and opaque per slotMechanics, and the renderer draws a joint as
      // one small square on the intersection — so the request must ask for a
      // filled canvas. Asking for arms reaching declared edges contradicted the
      // "fill the complete square canvas" constraint in the same prompt.
      return `A solid wall junction block for the exact ${slot.side} connection: wall mass fills the entire canvas edge to edge, reading as the same material as the ${jointEdges(slot.side).join(", ")} walls that meet here, with no floor, gap or background anywhere in frame.`;
    // ── Scatter (#902) ───────────────────────────────────────────────────
    // These two shared the fallback branch and so differed by a single noun,
    // which is why they generated as the same picture. What separates them is
    // the SIZE and ORIGIN of the pieces, not the material — material is what a
    // restyle replaces, so it can never be the distinguishing feature.
    case "rubble":
      return `A loose scatter of broken masonry chunks — fist-sized to head-sized fragments of the surrounding architecture, fallen and settled. Occupies roughly half the cell with clear floor showing between and around the pieces. ${variation}`;
    case "debris":
      return `A litter of small light refuse — splinters, shards, grit and fragments, none larger than a hand, the leavings of use rather than collapse. Finer and more thinly spread than a rubble pile, covering more of the cell but obscuring less of it. ${variation}`;

    // ── Objects (#902) ───────────────────────────────────────────────────
    // Furniture and fittings a party can see and interact with. Each is
    // described by silhouette first, because at one cell on a battle map the
    // outline is nearly all a DM reads.
    case "objectChest":
      return `A closed lidded chest seen from directly above: a rectangle roughly two-thirds the cell, its lid banded and its lock plate visible on the front edge. ${variation}`;
    case "objectBarrel":
      return `An upright barrel seen from directly above: a circle with concentric hoop rings and a visible lid seam, about half the cell across. ${variation}`;
    case "objectTable":
      return `A table seen from directly above: a broad flat rectangular top filling most of the cell, its legs just visible beyond the corners of the top. ${variation}`;
    case "objectStatue":
      return `A plain standing monument seen from directly above — a tapered obelisk or plinth on a square base, reading as a simple geometric mass with no limbs or face. Deliberately unlike the robed figure of a feature statue. ${variation}`;
    case "objectPillar":
      return `A structural column seen from directly above: a circle within a square base, reading as something that carries the ceiling rather than something placed on the floor. ${variation}`;
    case "objectBrazier":
      return `A standing fire bowl seen from directly above: a ring of metal enclosing glowing coals, on a narrow footed base. The flame is contained by the bowl, unlike a flame jet firing bare from the floor. ${variation}`;

    // ── Trap hazard glyphs (#804, art direction #902) ────────────────────
    // A DM has to tell these apart at a glance on a 128px cell, so each is
    // pinned to a distinct SILHOUETTE rather than a distinct colour — the same
    // rule `hazardPlaceholders.ts` states for the procedural fallbacks, whose
    // shapes these descriptions follow so a pack's art and its placeholder
    // read as the same hazard.
    case "hazardPit":
      return `An open pit seen from directly above: a dark void with a lighter broken rim, reading as an ABSENCE in the floor rather than an object on it. Nothing bridges or covers it.`;
    case "hazardPressurePlate":
      return `A flush floor plate: a square panel set level with the floor, its bevelled edge showing a hairline gap all round and a rivet at each corner. Flat and intact — nothing protrudes, nothing is broken.`;
    case "hazardTripwire":
      return `A single taut wire stretched low across the cell between two small anchor posts at opposite edges. Almost all floor; the wire is a thin line, not a mesh.`;
    case "hazardFallingBlock":
      return `A heavy slab poised overhead: a large squared mass of stone filling most of the cell, its face split by deep cracks, casting a hard shadow onto the floor beneath it.`;
    case "hazardDartWall":
      return `A row of small dart holes bored through a narrow wall strip along one edge of the cell — a line of dark circular mouths in a band of masonry, the rest of the cell clear floor.`;
    case "hazardBlade":
      return `A single scything blade on the diagonal: a long tapered steel edge with a bright honed line down its length, sweeping across the cell.`;
    case "hazardFlameJet":
      return `A tongue of flame firing straight up out of a bare floor nozzle — no bowl, no housing, no fuel. A bright core inside a softer outer flame.`;
    case "hazardGlyph":
      return `An arcane rune inscribed flat into the floor: an angular figure enclosed by a circle, cut or burned into the surface and faintly luminous. Lines only — nothing is raised above the floor.`;
    case "hazardNet":
      return `A cross-hatched rope mesh lying over the floor: two sets of cords crossing at a diagonal, with open gaps between them through which the floor shows.`;
    case "hazardAlarm":
      return `A mounted warning bell: a bell-shaped body with a clapper beneath it on a small bracket, reading unmistakably as something that makes noise rather than something that harms.`;
    case "hazardCollapsingFloor":
      return `Floor about to give way: the surrounding floor material spidered with cracks radiating from a centre point, still whole and unbroken — a fracture, never a hole.`;
    case "hazardGeneric":
      return `A blank hazard marker: a plain warning triangle standing alone on clear floor, the sign for a trap whose nature has not been chosen. Deliberately generic — it must not resemble any specific trap.`;

    // ── Dungeon feature glyphs (#804, art direction #902) ────────────────
    case "featureSecretDoor":
      return `A concealed door in a wall: a wall-thick band of masonry with a fine door-shaped seam cracked into it, hinge line down one side. The wall is unbroken — there is no opening, only the outline of one.`;
    case "featureHiddenPassage":
      return `A dark archway receding into shadow: an opening whose interior fades to black with depth, reading as a way through rather than a recess.`;
    case "featureCache":
      return `A small buried stash: a disturbed mound of earth or flagstones with a glint of coin or metal showing through the top. Deliberately unlike a chest — no lid, no box, nothing squared off.`;
    case "featureMovingWall":
      return `A sliding wall block: a squared mass of wall material with a directional chevron cut into its face and a track groove at its base, showing which way it travels.`;
    case "featureLever":
      return `A pull lever on a wall-mounted plate: a short handle angled out from a small rectangular mounting, clearly a thing a hand grips.`;
    case "featureAltar":
      return `A raised stone altar: a thick rectangular slab lifted on a solid base, its upper surface catching a faint light from within. Raised and solid, never flush with the floor.`;
    case "featureFountain":
      return `A circular basin holding water, with a central jet breaking the surface into ripples that spread to the rim.`;
    case "featureStatue":
      return `A carved humanoid figure on a plinth, seen from above: a robed body with discernible head and shoulders. Deliberately unlike the plain tapered obelisk of an object statue — this one reads as a person.`;
    case "featureRubble":
      return `A heaped mound of overlapping stones piled together into a single solid mass that blocks the cell. Distinct from scattered floor rubble: this is one impassable heap, not loose pieces with floor showing between them.`;
    case "featureInscription":
      return `A carved tablet or inscribed panel set into the floor: a bordered rectangular field of incised lines suggesting text, with no legible letters.`;
    case "featureGeneric":
      return `A blank feature marker: a plain unadorned marker stone standing on clear floor, the sign for a dungeon feature whose nature has not been chosen. Deliberately generic — it must not resemble any specific feature.`;

    default:
      // Reached only if a category is added to the schema without art
      // direction here. `categoryLabel` rather than the raw key, so the model
      // is at least asked for "a hazard pressure plate" and not
      // "hazardPressurePlate" — but a category landing here is a gap to fill,
      // not a resting place: every neighbour sharing this branch is how
      // `rubble` and `debris` came back as the same picture (#902).
      return `A top-down ${categoryLabel(slot.category)} overlay centred in one tile. ${variation}`;
  }
}

function mechanicalConstraints(mechanics: SlotMechanics, slot: SlotIdentity): string[] {
  const constraints = [
    "exact orthographic top-down view",
    "one tile asset only; no sprite sheet, grid, text, characters, or watermark",
    "even readable lighting with no cast shadow beyond the tile contract",
    "preserve clear shapes when reduced to 128×128",
  ];
  if (slot.category === "doorLeaf") {
    constraints.push("the leaf lies on the exact vertical centre line, spanning x 25% to 75% of the canvas, hinged at its left end; everything outside it is transparent");
  } else if (mechanics.footprint === "centered-horizontal-edge") {
    constraints.push("structure runs left-to-right in a narrow band through the exact vertical centre and terminates cleanly at both side edges");
  } else if (mechanics.footprint === "centered-vertical-edge") {
    constraints.push("structure runs top-to-bottom in a narrow band through the exact horizontal centre and terminates cleanly at both end edges");
  } else if (mechanics.footprint === "full-cell") {
    constraints.push("fill the complete square canvas and tile continuously on every declared tileable edge");
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

/**
 * The camera, stated on the line that names the subject.
 *
 * "exact orthographic top-down view" was already in the shared rendering
 * conventions AND repeated in the constraints, and the doors ignored both,
 * because the PRIMARY REQUEST said only "a closed door" — and an unqualified
 * door is a front-facing door to an image model. Measured across the whole
 * schema when that was found: 124 of the slots named no viewpoint in their
 * subject line at all. The doors were simply the category whose prior was
 * strong enough to make the omission visible.
 *
 * Prefixed here rather than written into each of the forty-odd branches, so a
 * category added later cannot be the one that forgets. Branches that state the
 * viewpoint again in their own words are not redundant — being told twice is
 * exactly what stopped the doors coming back as elevations.
 */
const VIEWPOINT = "Seen from directly above, in plan, as on a battle map.";

function buildPrompt(slot: SlotIdentity, artBible: PackArtBible, mechanics: SlotMechanics): PromptSpec {
  const theme = sharedTheme(artBible);
  const request = `${VIEWPOINT} ${categoryRequest(slot, mechanics)}`;
  const constraints = mechanicalConstraints(mechanics, slot);
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
    // A rotation-derived slot never becomes a job. Asking for `wallSegmentV:0`
    // plans `wallSegmentH:0` instead and the vertical is produced by turning
    // the result — so it is identical by construction, and a pack costs one
    // render rather than two for every wall, door and stair direction. Deduplication happens naturally: selecting both H and V adds the
    // source once, because `included` already holds it.
    const rotation = rotationFor(id);
    const generatedId = rotation ? rotation.from : id;
    if (included.has(generatedId)) continue;
    const generatedSlot = byId.get(generatedId);
    if (!generatedSlot) throw new Error(`Unknown schema slot: ${generatedId}`);
    jobs.push(createJob(generatedSlot, input.artBible, references, pack));
    included.add(generatedId);
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

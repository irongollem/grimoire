// Pack validator — reports missing/extra slots against TILE_PACK_SCHEMA.

import {
  TILE_PACK_SCHEMA,
  REQUIRED_CATEGORIES,
  categoryDef,
  type PackCategory,
  type TilePackManifest,
  type AssetSlot,
} from "./packSchema";

export interface MissingSlot {
  category: PackCategory;
  side?: string;
  variant?: number;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: MissingSlot[];
  extras: string[];
  warnings: string[];
}

export function validatePack(manifest: TilePackManifest): ValidationResult {
  const missing: MissingSlot[] = [];
  const extras: string[] = [];
  const warnings: string[] = [];

  if (manifest.schema_version !== TILE_PACK_SCHEMA.version) {
    warnings.push(
      `Pack schema_version ${manifest.schema_version} does not match runtime schema version ${TILE_PACK_SCHEMA.version}. Some categories may not render correctly.`,
    );
  }

  const requiredCategories = new Set<PackCategory>(REQUIRED_CATEGORIES);

  // Walk the entire schema so optional assets receive the same format and
  // identity checks; only required categories contribute missing slots.
  for (const cat of Object.keys(TILE_PACK_SCHEMA.categories) as PackCategory[]) {
    const def = categoryDef(cat);
    const provided = (manifest.assets[cat] ?? []) as AssetSlot[];
    const required = requiredCategories.has(cat);

    if (def.kind === "random") {
      if (required) {
        const variants = new Set(provided.map((slot) => slot.variant));
        for (let v = 0; v < def.min; v++) {
          if (!variants.has(v)) {
            missing.push({ category: cat, variant: v, reason: `random category needs at least ${def.min} variants` });
          }
        }
      }
      if (provided.length > def.max) {
        warnings.push(`${cat}: pack provides ${provided.length} variants, schema max is ${def.max}`);
      }
    } else if (def.kind === "directional") {
      if (required) {
        const perSide = def.variantsPerSide ?? 1;
        for (const side of def.sides) {
          const sideSlots = provided.filter((s) => s.side === side);
          const variants = new Set(sideSlots.map((slot) => slot.variant));
          for (let v = 0; v < perSide; v++) {
            if (!variants.has(v)) {
              missing.push({ category: cat, side, variant: v, reason: `directional category ${cat}/${side} needs ${perSide} variant(s)` });
            }
          }
        }
      }
    } else if (provided.length > def.max) {
      warnings.push(`${cat}: pack provides ${provided.length} variants, schema max is ${def.max}`);
    }

    const seenSlots = new Set<string>();
    for (const slot of provided) {
      const identity = `${slot.side ?? ""}/${slot.variant}`;
      if (seenSlots.has(identity)) {
        warnings.push(`${cat}${slot.side ? `/${slot.side}` : ""}/${slot.variant}: duplicate asset slot`);
      }
      seenSlots.add(identity);
    }

    // WebP-only enforcement on provided URLs.
    for (const slot of provided) {
      if (!slot.url.toLowerCase().endsWith(".webp")) {
        warnings.push(`${cat}${slot.side ? `/${slot.side}` : ""}/${slot.variant}: non-WebP asset (${slot.url}) — pipeline is WebP-only`);
      }
    }
  }

  // Catch categories in the manifest that aren't in the schema.
  for (const cat of Object.keys(manifest.assets)) {
    if (!(cat in TILE_PACK_SCHEMA.categories)) {
      extras.push(cat);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    extras,
    warnings,
  };
}

export function formatMissingForDisplay(missing: MissingSlot[]): string {
  if (!missing.length) return "";
  const lines = missing.slice(0, 10).map((m) => {
    const parts: string[] = [m.category];
    if (m.side) parts.push(m.side);
    if (m.variant !== undefined) parts.push(String(m.variant));
    return `  • ${parts.join("/")}`;
  });
  if (missing.length > 10) lines.push(`  • …and ${missing.length - 10} more`);
  return lines.join("\n");
}

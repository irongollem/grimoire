// Pure grouping/formatting logic for the "Licenses & Attributions" surface
// (issue #567). No Vue, no Supabase — see src/composables/useContentLicenses.ts
// for the data-fetching side and src/components/rules/LicensesTab.vue for the
// rendering side.
import { LICENSES } from "@/data/licenses";
import { OGL_1_0A_BASE_NOTICE } from "@/data/ogl";
import type { ContentLicenseSource, LicenseDescriptor } from "@/types/license.types";

// OGL first, then CC-BY, then ORC, then CC0. Anything not in this list (an
// unknown upstream license key) sorts after all of these, alphabetically by key.
const LICENSE_ORDER: readonly string[] = ["ogl-10a", "cc-by-40", "orc", "cc0"];

/** Looks up a known license by key. Returns null for anything not in the registry. */
export function licenseDescriptor(key: string): LicenseDescriptor | null {
  return LICENSES[key] ?? null;
}

// A new upstream license key must never be silently dropped from the page —
// build a minimal descriptor from the raw key so it still surfaces, with no
// external URL/summary to fabricate.
function unknownLicenseDescriptor(key: string): LicenseDescriptor {
  return {
    key,
    name: key,
    shortName: key,
    url: "",
    summary: "This license key is not yet recognized by Grimoire. Treat the content below as unattributed until it can be classified.",
    reproducesFullText: false,
    requiredNotice: null,
  };
}

function compareSources(a: ContentLicenseSource, b: ContentLicenseSource): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.title.localeCompare(b.title);
}

function licenseOrderIndex(key: string): number {
  const idx = LICENSE_ORDER.indexOf(key);
  return idx === -1 ? LICENSE_ORDER.length : idx;
}

export interface LicenseGroup {
  license: LicenseDescriptor;
  sources: ContentLicenseSource[];
}

/**
 * Groups sources by license key. A source carrying two license keys (e.g. a
 * source under both CC-BY-4.0 and OGL 1.0a) appears under both groups.
 * Groups are ordered OGL first, then CC-BY, then ORC, then CC0, then any
 * unrecognized license key (alphabetically). Sources within a group are
 * ordered by sort_order then title.
 */
export function groupSourcesByLicense(sources: readonly ContentLicenseSource[]): LicenseGroup[] {
  const groups = new Map<string, LicenseGroup>();

  for (const source of sources) {
    for (const key of source.license_keys) {
      let group = groups.get(key);
      if (!group) {
        group = { license: licenseDescriptor(key) ?? unknownLicenseDescriptor(key), sources: [] };
        groups.set(key, group);
      }
      group.sources.push(source);
    }
  }

  for (const group of groups.values()) {
    group.sources.sort(compareSources);
  }

  return Array.from(groups.values()).sort((a, b) => {
    const orderDiff = licenseOrderIndex(a.license.key) - licenseOrderIndex(b.license.key);
    if (orderDiff !== 0) return orderDiff;
    return a.license.key.localeCompare(b.license.key);
  });
}

/**
 * Assembles the OGL 1.0a "15. COPYRIGHT NOTICE" chain we are required to
 * publish (OGL §6): the license's own base notice first, then the
 * copyright_notice of every source carrying the "ogl-10a" license key (that
 * has one), deduplicated, ordered by sort_order then title.
 *
 * Returns [] — not just the base notice — when no source in `sources` carries
 * the OGL license at all: no OGL content means nothing to publish a chain for.
 */
export function oglSection15Chain(sources: readonly ContentLicenseSource[]): string[] {
  const oglSources = sources.filter((s) => s.license_keys.includes("ogl-10a"));
  if (oglSources.length === 0) return [];

  const chain: string[] = [OGL_1_0A_BASE_NOTICE];
  const seen = new Set<string>([OGL_1_0A_BASE_NOTICE]);

  for (const source of [...oglSources].sort(compareSources)) {
    const notice = source.copyright_notice;
    if (notice === null) continue;
    if (seen.has(notice)) continue;
    seen.add(notice);
    chain.push(notice);
  }

  return chain;
}

/**
 * Sources with entries actually present (entry_count > 0) that carry no
 * third-party license at all — Grimoire's own bundled/original content. The
 * UI credits these separately rather than implying a license that isn't
 * there. Ordered by sort_order then title.
 */
export function unlicensedSources(sources: readonly ContentLicenseSource[]): ContentLicenseSource[] {
  return sources
    .filter((s) => s.entry_count > 0 && s.license_keys.length === 0)
    .sort(compareSources);
}

// Types for the "Licenses & Attributions" surface (issue #567).
//
// ContentLicenseSource mirrors one row returned by the `get_content_licenses()`
// RPC — one row per content source document actually present in the shared
// tables (monsters, spells, items, species, rules, classes).
export interface ContentLicenseSource {
  key: string;                     // our internal source_document_key, e.g. "tob3", "srd-2014", "grimoire-bundled"
  open5e_key: string | null;       // the upstream Open5e v2 document key when it differs, e.g. "ccdx" for our "cc"
  title: string;                   // e.g. "Tome of Beasts 3"
  publisher: string;                // e.g. "Kobold Press"
  license_keys: string[];          // e.g. ["ogl-10a"] or ["cc-by-40", "ogl-10a"]; [] means no third-party license
  copyright_notice: string | null; // the verbatim OGL §15 line / CC-BY credit line for this product
  product_url: string | null;      // publisher's own page for the product
  gamesystem: string | null;       // "5e-2014" | "5e-2024" | null
  monster_count: number;
  spell_count: number;
  item_count: number;
  species_count: number;
  rule_count: number;
  class_count: number;
  entry_count: number;             // sum of the six counts above
  sort_order: number;
}

// One row from the `get_audio_licenses()` RPC — the soundboard's shipped
// catalogue, grouped by (license, source).
//
// Audio attribution is shaped differently from the compendium's: the credit is
// per-sound rather than per-document, and each sound already stores a
// ready-to-display credit line. Hence a separate type rather than bending
// ContentLicenseSource around it.
export interface AudioLicenseGroup {
  license: string;               // e.g. "CC-BY 3.0", "CC0"
  license_url: string | null;
  source: string;                // e.g. "OpenGameArt", "Wikimedia Commons"
  sound_count: number;
  author_count: number;
  requires_credit: boolean;      // false for CC0 — no credit is required, which is not the same as none being available
  attributions: string[] | null; // null (never []) when the license requires no credit
}

// A license the app knows about, with the plain-language summary shown on the
// Licenses tab. See src/data/licenses.ts for the concrete registry.
export interface LicenseDescriptor {
  key: string;                     // "ogl-10a"
  name: string;                    // "Open Game License 1.0a"
  shortName: string;               // "OGL 1.0a"
  url: string;                     // canonical license URL
  summary: string;                 // 1-2 sentences, plain language: what it permits and what it obliges us to show
  reproducesFullText: boolean;     // true only for OGL 1.0a
  requiredNotice: string | null;   // a specific statement the license conditions the grant on publishing verbatim, e.g. ORC License III(a); null when the license has no such fixed-text requirement
}

import type { RulesetKey } from "@/types/ruleset.types";

/** Shared identity/provenance contract for every rules-bearing content row. */
export interface VersionedContentMetadata {
  ruleset?: RulesetKey | null;
  conceptual_key?: string | null;
  source_document_key?: string | null;
  source_record_key?: string | null;
  source_revision?: string | null;
  source_license?: string | null;
  provenance?: Record<string, unknown>;
}

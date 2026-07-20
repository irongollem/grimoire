/**
 * Synchronise Open5e class features by provider identity. Equal display names
 * from different documents remain distinct records and can evolve separately.
 */
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Open5eClassFeaturePreview } from "@/lib/open5eClassImport";

export function classFeatureIdentity(feature: Pick<Open5eClassFeaturePreview, "sourceDocumentKey" | "key">): string {
  return `${feature.sourceDocumentKey}::${feature.key}`;
}

export async function ensureClassFeatures(
  neededFeatures: Map<string, Open5eClassFeaturePreview>,
): Promise<Map<string, string>> {
  const identityToId = new Map<string, string>();
  if (neededFeatures.size === 0) return identityToId;

  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing, error: existingError } = await supabase
    .from("class_features")
    .select("id, source_document_key, source_record_key")
    .eq("user_id", user.id)
    .not("source_document_key", "is", null)
    .not("source_record_key", "is", null);
  if (existingError) throw existingError;

  for (const feature of existing ?? []) {
    identityToId.set(`${feature.source_document_key}::${feature.source_record_key}`, feature.id);
  }

  const toCreate = [...neededFeatures.entries()].filter(([identity]) => !identityToId.has(identity));
  const BATCH = 100;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const rows = toCreate.slice(i, i + BATCH).map(([, feature]) => ({
      name: feature.name,
      feature_type: "passive" as const,
      open5e_import: true,
      source: feature.sourceDocumentName,
      description: feature.description ? descToTiptap(feature.description) : null,
      campaign_id: null,
      prerequisite: null,
      tags: [] as string[],
      user_id: user.id,
      ruleset: feature.ruleset,
      conceptual_key: conceptualKey(feature.name),
      source_document_key: feature.sourceDocumentKey,
      source_record_key: feature.key,
      source_revision: feature.sourceDocumentName,
      source_license: feature.sourceLicense,
      provenance: feature.provenance,
    }));
    const { data: inserted, error } = await supabase
      .from("class_features")
      .insert(rows)
      .select("id, source_document_key, source_record_key");
    if (error) throw error;
    for (const feature of inserted ?? []) {
      identityToId.set(`${feature.source_document_key}::${feature.source_record_key}`, feature.id);
    }
  }

  // Refresh provider-controlled fields. User art/tags are intentionally left alone.
  const toUpdate = [...neededFeatures.entries()].filter(([identity]) => identityToId.has(identity));
  for (let i = 0; i < toUpdate.length; i += 25) {
    await Promise.all(toUpdate.slice(i, i + 25).map(async ([identity, feature]) => {
      const { error } = await supabase
        .from("class_features")
        .update({
          name: feature.name,
          source: feature.sourceDocumentName,
          description: feature.description ? descToTiptap(feature.description) : null,
          ruleset: feature.ruleset,
          conceptual_key: conceptualKey(feature.name),
          source_revision: feature.sourceDocumentName,
          source_license: feature.sourceLicense,
          provenance: feature.provenance,
        })
        .eq("id", identityToId.get(identity)!);
      if (error) throw error;
    }));
  }

  return identityToId;
}

export function collectFeatures(
  previews: { featureRecordsByLevel: Record<string, Open5eClassFeaturePreview[]> }[],
): Map<string, Open5eClassFeaturePreview> {
  const needed = new Map<string, Open5eClassFeaturePreview>();
  for (const preview of previews) {
    for (const features of Object.values(preview.featureRecordsByLevel)) {
      for (const feature of features) needed.set(classFeatureIdentity(feature), feature);
    }
  }
  return needed;
}

function conceptualKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function descToTiptap(desc: string): string {
  const content = desc
    .split(/\n\n+/)
    .map(text => text.trim())
    .filter(Boolean)
    .map(text => ({ type: "paragraph", content: [{ type: "text", text }] }));
  return JSON.stringify({ type: "doc", content });
}

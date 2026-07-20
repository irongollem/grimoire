/** Database-backed custom content uses UUID primary keys; provider keys are opaque text. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Shared content is identified by explicit row metadata, never an ID/name convention. */
export function isSharedContent(row: {
  user_id?: string | null;
  is_srd?: boolean;
  source_record_key?: string | null;
}): boolean {
  return row.is_srd === true || !row.user_id || !!row.source_record_key;
}

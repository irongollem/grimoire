/**
 * Server-side resolution of a chronicle `pendingImage` anchor (#614).
 *
 * A chronicle image job started from a saved note records that note as its
 * completion target. When the job goes ready, the worker rewrites the note's
 * Tiptap content, swapping the anchor for a real image node — so every
 * viewer (including players, whose RLS hides the job row) sees the finished
 * image without waiting for the DM's next edit + save.
 *
 * Concurrency: the DM may save the note while this runs. The update is a
 * compare-and-swap on `updated_at` (bumped by trigger on every save) with a
 * few retries; each retry re-reads and re-applies the swap. If the DM is
 * saving faster than we can win the race, their own client resolver has
 * already swapped the anchor in-editor, so losing the race is safe.
 *
 * Everything here is best-effort: the job itself is already `ready` and the
 * image persisted to the gallery, so failures log and return rather than
 * throw — a missing anchor just means the DM deleted it (gallery-only, by
 * design) and a missing note means it was deleted since the job started.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

interface TiptapNode {
  type?: unknown;
  attrs?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

function isNode(value: unknown): value is TiptapNode {
  return typeof value === "object" && value !== null;
}

/**
 * Returns a copy of `doc` with the first `pendingImage` node whose
 * `attrs.jobId` matches replaced by a standard image node (mirroring the
 * client resolver's replaceWithImage, which also replaces the first match).
 * `replaced` is false when no anchor matched — the doc is then unchanged.
 */
export function replacePendingImageNode(
  doc: unknown,
  jobId: string,
  imageUrl: string,
): { doc: unknown; replaced: boolean } {
  let replaced = false;

  function walk(node: unknown): unknown {
    if (!isNode(node)) return node;

    if (!replaced && node.type === "pendingImage" && isNode(node.attrs)
        && (node.attrs as Record<string, unknown>).jobId === jobId) {
      replaced = true;
      return { type: "image", attrs: { src: imageUrl } };
    }

    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(walk) };
    }
    return node;
  }

  const next = walk(doc);
  return { doc: replaced ? next : doc, replaced };
}

const CAS_ATTEMPTS = 3;

/**
 * Swaps the ready job's anchor into the note's persisted content.
 * `userId` is the job's owner — the note filter includes it so a forged
 * target can never rewrite someone else's note, even with the service role.
 */
export async function resolveNotePendingImage(
  admin: SupabaseClient,
  args: { noteId: string; userId: string; jobId: string; imageUrl: string },
): Promise<void> {
  const { noteId, userId, jobId, imageUrl } = args;

  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const { data: note, error: readErr } = await admin
      .from("notes")
      .select("content, updated_at")
      .eq("id", noteId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr || !note) {
      if (readErr) console.warn(`notePendingImage read failed (${noteId}):`, readErr.message);
      return; // note deleted (or never this user's) — image stays gallery-only
    }

    const row = note as { content: string | null; updated_at: string };
    if (!row.content) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.content);
    } catch {
      console.warn(`notePendingImage: note ${noteId} content is not JSON — skipping`);
      return;
    }

    const { doc, replaced } = replacePendingImageNode(parsed, jobId, imageUrl);
    if (!replaced) return; // anchor deleted by the DM — gallery-only, by design

    const { data: updated, error: writeErr } = await admin
      .from("notes")
      .update({ content: JSON.stringify(doc) })
      .eq("id", noteId)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (writeErr) {
      console.warn(`notePendingImage write failed (${noteId}):`, writeErr.message);
      return;
    }
    if (updated) return; // CAS won — anchor persisted as the image
    // CAS lost: the note was saved mid-rewrite. Re-read and try again.
  }
  console.warn(`notePendingImage: gave up after ${CAS_ATTEMPTS} attempts (note ${noteId}, job ${jobId})`);
}

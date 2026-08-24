/**
 * Document importer (#353) — data layer for chunk 3.
 *
 * A DM uploads a PDF or a batch of page photos, an edge function
 * (`import-extract`, chunk 2) reads it with an AI pass and stages the result
 * on a `document_imports` row, and a review wizard (a later chunk) walks the
 * seven entity kinds before anything reaches a content table. This module is
 * the thin Supabase/TanStack layer the wizard and its upload step run on —
 * server state only, per `useFactions.ts`'s conventions. The pure logic it
 * leans on (page counting, the import plan) lives in `src/lib/documentImport/`
 * and is owned and tested elsewhere.
 *
 * ── Why storage is spoken to directly here ───────────────────────────────────
 *
 * `import-documents` is private and transient — never CDN-fronted, never
 * R2-backed — and is deliberately kept out of `src/lib/storage/buckets.ts`'s
 * `BUCKETS` registry: that registry's own tests assert every entry is
 * CDN-fronted, which would be a false statement for this bucket (the same
 * reason `tile-packs` and `downtime-images` sit outside it). So uploads below
 * call `supabase.storage.from("import-documents")` directly rather than going
 * through `uploadToBucket`. Do not "fix" this by registering the bucket.
 *
 * ── The path convention is a security control, not a nicety ─────────────────
 *
 * Every object must live at `${userId}/${uuid}.${ext}`. Migration
 * 20260824214506 enforces this from the database side via
 * `private.paths_under_caller_prefix` on both INSERT and UPDATE, closing a
 * hole where a client-supplied `source_paths` could point at another user's
 * object (read via the service-role `import-extract` function, which bypasses
 * storage RLS). Paths are built from `getCurrentUser()`'s id here — never from
 * anything the caller passes in.
 *
 * ── Orphaned uploads ──────────────────────────────────────────────────────────
 *
 * A rejected `document_imports` insert (bad campaign, revoked DM role, a
 * partial-batch upload failure) must not leave bytes stranded in the bucket
 * with nothing pointing at them — there is no sweep for this yet (#769), only
 * `expires_at`, which only helps rows that *exist*. `useCreateDocumentImport`
 * and `useAbandonDocumentImport` both clean up the objects they touch.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { edgeErrorMessage } from "@/lib/edgeError";
import { useGenerationCreditCosts } from "@/composables/useCreditConfig";
import type {
  DocumentImport,
  DocumentImportInsert,
  DocumentImportSourceKind,
  DocumentImportStatus,
} from "@/types/documentImport.types";

const IMPORT_DOCUMENTS_BUCKET = "import-documents";

// ── Client-side mirror of migration 20260824204224's bucket config ──────────
// Mirrored rather than looked up: this bucket is intentionally not in
// `BUCKETS` (see file header), so there is no shared config object to import.
// The point is the same one `upload.ts`'s `validate()` makes for every other
// bucket — fail fast with a clear message instead of bouncing off storage with
// a generic 400.
const IMPORT_DOCUMENTS_MAX_BYTES = 26_214_400; // 25 MB
const IMPORT_DOCUMENTS_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

function validateImportFile(file: File): void {
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty (0 bytes) — nothing to upload.`);
  }
  if (file.size > IMPORT_DOCUMENTS_MAX_BYTES) {
    throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB per file.`);
  }
  if (!(IMPORT_DOCUMENTS_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(`"${file.name}" is ${file.type || "an unrecognized file type"} — accepts PDF, JPEG, PNG or WebP.`);
  }
}

/**
 * Extension for the auto-generated storage path. Prefers the filename's own
 * extension (so a re-download of the object still looks like what it is);
 * falls back to the MIME type for camera captures and similar sources that
 * carry no dot at all. `import-extract`'s `mimeFromPath` needs *some*
 * recognizable extension to pick the right MIME back up on download, so this
 * never returns an empty string.
 */
function extensionFor(file: File): string {
  const lastDot = file.name.lastIndexOf(".");
  const fromName = lastDot > 0 ? file.name.slice(lastDot + 1).toLowerCase() : "";
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  switch (file.type) {
    case "application/pdf": return "pdf";
    case "image/png": return "png";
    case "image/webp": return "webp";
    default: return "jpg"; // image/jpeg, and anything else validateImportFile already let through
  }
}

function isRlsDeniedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42501"
  );
}

async function removeImportObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  // Best-effort everywhere it's called: the thing that actually matters (the
  // row's existence, or its rejection) has already been decided by the time
  // this runs, and a storage hiccup here shouldn't turn a handled outcome into
  // an unhandled one. Anything left behind is still bounded by `expires_at`.
  await supabase.storage.from(IMPORT_DOCUMENTS_BUCKET).remove(paths).catch(() => { /* see above */ });
}

// ── Query key ─────────────────────────────────────────────────────────────────

/** Statuses that mean "the wizard has something to resume" — mirrors the
 *  partial index `document_imports_user_campaign_idx` (migration 20260824204224). */
const ACTIVE_STATUSES: DocumentImportStatus[] = ["pending", "extracting", "review"];

function activeImportKey(campaignId: string | null) {
  return ["document-imports", "active", campaignId] as const;
}

// ── The active row ───────────────────────────────────────────────────────────

/**
 * The current unfinished import for the active campaign, or null when there
 * isn't one. This is what the import tab renders off: null means "show the
 * upload step", a row means "resume the wizard at whatever its status implies".
 *
 * RLS already scopes this to the caller (`document_imports_select` is plain
 * `auth.uid() = user_id`), so no explicit user filter is needed here — two DMs
 * in the same campaign each see only their own in-flight import.
 *
 * Polls while `extracting`: that status only ever changes server-side (the
 * edge function flips it on settle), so nothing client-side would otherwise
 * tell this query to refetch. `refetchInterval` reads the *previous* fetch's
 * status via `query.state.data`, so polling turns itself off the moment the
 * row lands on `review`/`failed`/`complete`, and never starts at all when
 * there's no active row.
 */
export function useActiveDocumentImport() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => activeImportKey(campaignId.value)),
    queryFn: async (): Promise<DocumentImport | null> => {
      const { data, error } = await supabase
        .from("document_imports")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as DocumentImport | null;
    },
    enabled: () => !!campaignId.value,
    refetchInterval: (query) => (query.state.data?.status === "extracting" ? 3_000 : false),
  });
}

// ── Create (upload + stage) ──────────────────────────────────────────────────

export interface CreateDocumentImportInput {
  /** The file(s) to upload, already in page order — one element for a PDF,
   *  one per photo for a batch. This composable does not reorder them. */
  files: File[];
  sourceKind: DocumentImportSourceKind;
  /** What the DM called it, for the wizard header. */
  displayName: string;
  /** Pages for a PDF, photos for a batch — computed by the caller (the pure
   *  logic for this lives in `src/lib/documentImport/`, not here) and simply
   *  persisted onto the row. */
  pageCount: number;
  /** The DM's ticked rights-attestation checkbox. Required to be `true` —
   *  `document_imports.rights_attested_at` is `NOT NULL` with no default, so
   *  an unattested upload must fail here rather than the mutation silently
   *  stamping "now" on the DM's behalf. */
  rightsAttested: boolean;
}

/**
 * Uploads the file(s) under the caller's own storage prefix and stages a
 * `document_imports` row pointing at them. Returns the created row.
 *
 * If anything after the first successful upload fails — a later file in the
 * batch, or the row insert itself — every object already uploaded in this
 * call is removed before the error propagates. See the file header for why
 * that matters (#769): a rejected insert must not orphan bytes.
 */
export function useCreateDocumentImport() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (input: CreateDocumentImportInput): Promise<DocumentImport> => {
      if (!input.rightsAttested) {
        throw new Error("Confirm you have the rights to this document before it can be imported.");
      }
      if (!input.files.length) {
        throw new Error("Select a PDF or at least one page photo first.");
      }
      if (input.pageCount <= 0) {
        throw new Error("Could not determine a page count for this document.");
      }
      for (const file of input.files) validateImportFile(file);

      const user = getCurrentUser();
      if (!user) throw new Error("You must be signed in to start an import.");
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const uploadedPaths: string[] = [];
      try {
        for (const file of input.files) {
          const path = `${user.id}/${crypto.randomUUID()}.${extensionFor(file)}`;
          // Deliberately not `uploadToBucket` — see file header.
          const { error: uploadError } = await supabase.storage
            .from(IMPORT_DOCUMENTS_BUCKET)
            .upload(path, file, { contentType: file.type });
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);
        }

        const insert: DocumentImportInsert = {
          campaign_id: campaignId,
          source_kind: input.sourceKind,
          source_paths: uploadedPaths,
          display_name: input.displayName,
          page_count: input.pageCount,
          rights_attested_at: new Date().toISOString(),
        };
        const { data: row, error: insertError } = await supabase
          .from("document_imports")
          .insert({ ...insert, user_id: user.id })
          .select()
          .single();
        if (insertError) {
          // `document_imports_insert` (20260824204224, tightened 20260824214506)
          // has two terms that each raise a raw Postgres 42501:
          // `private.is_campaign_dm` and `private.paths_under_caller_prefix`.
          //
          // The message names only the first because the second cannot fail
          // *from here*: the paths a few lines above are built from
          // `user.id` — the same identity `auth.uid()` returns — so they satisfy
          // the prefix check by construction. That is what makes this mapping
          // exact rather than a guess, and it is also what would make it a lie
          // if path construction ever moved or started accepting a caller-
          // supplied prefix. If you change how `path` is built, revisit this.
          if (isRlsDeniedError(insertError)) {
            throw new Error("Only the campaign's DM can start a document import.");
          }
          throw insertError;
        }
        return row as DocumentImport;
      } catch (err) {
        await removeImportObjects(uploadedPaths);
        throw err instanceof Error ? err : new Error("Failed to create the document import.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) }),
  });
}

// ── Start extraction ──────────────────────────────────────────────────────────

export interface StartExtractionOutcome {
  status: Extract<DocumentImportStatus, "review">;
  /**
   * Present only when the extraction was truncated but still produced usable
   * entities — the "truncated" branch in `import-extract/index.ts` settles the
   * row to `review` (status 200) and rides a human-readable warning along on
   * the same response. That is NOT a failure, so — unlike the generic
   * "`if (data?.error) throw`" shape in `useQuestGeneration.ts` — it is
   * surfaced here as `warning` rather than thrown. Every actual failure
   * (refused, invalid JSON, provider error, page-limit, no API key, rate
   * limit, insufficient credits, account suspended, a losing race against
   * another tab) comes back with a non-2xx status instead, which the `error`
   * branch below already converts into a thrown `Error`.
   */
  warning?: string;
}

interface ImportExtractResponse {
  status: "review";
  extracted?: unknown;
  ai_provenance?: unknown;
  error?: string;
}

/**
 * Kicks off extraction for a staged import and invalidates the active-row
 * query so the wizard picks up the new status. Invalidates on *every*
 * settlement, not just success: a 409 "not_pending" reply means another tab's
 * request already moved the row (into `extracting` or past it), so the local
 * cache is stale in the failure case too — that's precisely the race the edge
 * function's atomic claim is built to let happen safely.
 */
export function useStartExtraction() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (documentImportId: string): Promise<StartExtractionOutcome> => {
      const { data, error } = await supabase.functions.invoke<ImportExtractResponse>(
        "import-extract",
        { body: { id: documentImportId } },
      );
      if (error) throw new Error(await edgeErrorMessage(error));
      if (!data) throw new Error("Extraction returned no data.");
      return { status: data.status, warning: data.error };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) }),
  });
}

// ── Cost preview ──────────────────────────────────────────────────────────────

const IMPORT_BASE_TYPE = "document_import_extraction";
const IMPORT_PAGE_TYPE = "document_import_page";

export interface DocumentImportCostEstimate {
  baseCredits: number;
  perPageCredits: number;
  pageCount: number;
  totalCredits: number;
}

/**
 * Credit preview for a not-yet-created import: `document_import_extraction`
 * (flat per-job base) + `document_import_page` × page count, per migration
 * 20260824220715. Reuses `useGenerationCreditCosts` — the same cached read
 * `useAiCredits.costOf` and the admin pricing panel use — rather than issuing
 * a second query against `ai_generation_credit_costs`.
 *
 * `estimate` is null while the cost rows are still loading, and stays null if
 * either `generation_type` is ever missing from the table — both are "don't
 * know yet" states the UI must show as "price unavailable", never silently
 * price the import at 0 by defaulting a missing row to 0 credits.
 */
export function useImportCost(pageCount: MaybeRefOrGetter<number>) {
  const { data: costs, isLoading, isError } = useGenerationCreditCosts();

  const estimate = computed<DocumentImportCostEstimate | null>(() => {
    const rows = costs.value;
    if (!rows) return null;
    const base = rows.find((r) => r.generation_type === IMPORT_BASE_TYPE)?.credit_cost;
    const perPage = rows.find((r) => r.generation_type === IMPORT_PAGE_TYPE)?.credit_cost;
    if (base === undefined || perPage === undefined) return null;
    const pages = toValue(pageCount);
    return {
      baseCredits: base,
      perPageCredits: perPage,
      pageCount: pages,
      totalCredits: base + perPage * pages,
    };
  });

  return { estimate, isLoading, isError };
}

// ── Abandon ───────────────────────────────────────────────────────────────────

/**
 * Deletes a staging row and, best-effort, its source storage objects — for a
 * DM who changes their mind before or during review. The row delete is the
 * part that must not silently fail (it's what makes the import "gone" from
 * the DM's point of view), so it's checked; the storage cleanup that follows
 * is fire-and-forget, matching `removeImportObjects`'s reasoning. In practice
 * the objects are usually already gone by the time this is reachable in the
 * UI — `import-extract` deletes them on every settle path — so this mainly
 * covers abandoning a `pending` import that never started extracting.
 */
export function useAbandonDocumentImport() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (row: Pick<DocumentImport, "id" | "source_paths">): Promise<void> => {
      const { error } = await supabase.from("document_imports").delete().eq("id", row.id);
      if (error) throw error;
      await removeImportObjects(row.source_paths);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) }),
  });
}

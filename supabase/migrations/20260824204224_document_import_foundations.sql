-- Migration: document_import_foundations
-- The staging substrate for the document importer (#353): a DM uploads a PDF or
-- a batch of page photos, an AI pass extracts game entities from it, and a
-- review wizard walks the seven entity types before anything reaches a content
-- table.
--
-- ── Why a table and not just a request/response ──────────────────────────────
--
-- The issue says "no extracted data is persisted until the user clicks Import",
-- and that stays true of the *content* tables — nothing lands in `monsters` or
-- `npcs` until the DM confirms that step. But the review itself is seven steps
-- long over a document that may have taken a minute to extract, and holding
-- that in component state means a refresh, a phone locking, or a switch to
-- another tab throws away work the user has already paid credits for. So the
-- extraction is staged in a row the user owns, RLS-scoped like everything else,
-- and deleted when the import finishes or the DM abandons it.
--
-- ── The private lock is structural, not conventional ─────────────────────────
--
-- Imported content is hard-locked to the importing account and must never reach
-- the shared `library_*` lane (the decision recorded on #353, Aug 2026: that
-- line is what separates a personal-use tool from a distribution platform).
-- Two things enforce it here rather than by convention:
--
--   1. Every target table is a user-owned, RLS-scoped table keyed on
--      `auth.uid() = user_id`. There is no code path from these rows into
--      `library_*`, which is admin-written only.
--   2. `import_documents` objects live under `{userId}/` with per-user storage
--      policies below — no `srd/` prefix, so the canonical-art path that admin
--      uploads use is not reachable from here at all.
--
-- ── Source documents are transient ───────────────────────────────────────────
--
-- The bucket is private (no public URL, ever) and the object is deleted as soon
-- as extraction settles. `expires_at` is the backstop for the case where the
-- edge function dies between upload and cleanup: a sweep can find rows past
-- their expiry and drop both the row and its objects. We hold someone else's
-- document for minutes, not indefinitely — that is a large part of what keeps
-- this a neutral processing pipe rather than a host of other people's books.
--
-- The FK to auth.users is `on delete cascade`, which is what puts this table
-- into the GDPR paths without any wiring: `export_user_data` walks the
-- auth.users FK graph at runtime rather than reading a manifest, precisely so a
-- table added by a later migration inherits Art. 15 export and Art. 17 erasure
-- for free (context/compliance/data-subject-rights.md §4).

-- ── 1. Source-document bucket ────────────────────────────────────────────────
-- Private: `public = false`. Every other bucket in the app is public because it
-- holds art meant to be rendered; this one holds a document the user supplied
-- and nobody but they (and the extractor, via the service role) may read it.
--
-- 25 MB covers a chapter-sized PDF and a batch of phone photos comfortably. The
-- real bound on volume is the page cap enforced by the extractor, not bytes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-documents',
  'import-documents',
  false,
  26214400,  -- 25 MB per file
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Own-folder-only, all four verbs. `(storage.foldername(name))[1] = auth.uid()::text`
-- is the same per-user prefix test the image buckets use (20260510000001).
-- Deliberately no `srd/` admin policy: canonical content is never sourced from
-- a user-supplied document, so that prefix must stay unreachable here.
create policy "import_documents_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'import-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "import_documents_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'import-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "import_documents_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'import-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "import_documents_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'import-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 2. The staging row ───────────────────────────────────────────────────────
create table document_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,

  -- 'pdf' = one PDF object; 'images' = a batch of page photos treated as one
  -- document. The distinction survives into the extractor because the provider
  -- content block differs (document vs image), not because the UX does.
  source_kind text not null check (source_kind in ('pdf', 'images')),

  -- Storage paths under `{userId}/`, in page order. An array for both kinds:
  -- a PDF is a one-element array, which keeps the cleanup path single-shaped.
  source_paths text[] not null check (cardinality(source_paths) > 0),

  -- What the DM called it, for the wizard header. Never derived from the
  -- object path, which carries a uuid.
  display_name text not null,

  -- Pages for a PDF, images for a batch. Recorded at upload so the Pro-gated
  -- cap can be checked before any paid provider call, and kept afterwards so
  -- the credit charge is explicable.
  page_count integer not null check (page_count > 0),

  status text not null default 'pending'
    check (status in ('pending', 'extracting', 'review', 'failed', 'complete')),

  -- The extraction, keyed by entity kind:
  --   { "monsters": [ {...}, ... ], "npcs": [...], ... }
  -- Opaque jsonb rather than a shaped constraint for the same reason
  -- `dashboard_layouts.layout` is: the shape is defined by TypeScript
  -- (src/types/documentImport.types.ts) and a SQL copy of it would drift from
  -- that file the first time an entity kind gained a field. The client parses
  -- defensively and a malformed entry behaves as if it were absent.
  extracted jsonb not null default '{}'::jsonb,

  -- Which kinds the DM has already walked, so re-entering the wizard resumes
  -- instead of restarting: { "monsters": 4, "npcs": 0, ... } — count imported,
  -- 0 meaning "reviewed and skipped everything", absent meaning "not yet seen".
  imported_counts jsonb not null default '{}'::jsonb,

  -- The DM's upload-time attestation that they hold the rights to the material.
  -- Not decorative: it is the record that the person who supplied the document
  -- asserted a right to it, which is what keeps the platform's hands clean when
  -- the tool itself is content-neutral. NOT NULL with no default, so a row
  -- cannot exist without one.
  rights_attested_at timestamptz not null,

  -- Art 50 disclosure for the extraction pass, same shape as every other
  -- generator (see supabase/functions/_shared/provenance/types.ts). Copied onto
  -- each row the wizard creates so the badge survives the staging row's death.
  ai_provenance jsonb,

  error text,

  -- Backstop for a worker that dies between upload and cleanup. A sweep drops
  -- the row and its storage objects past this point; the happy path deletes
  -- both much sooner.
  expires_at timestamptz not null default now() + interval '24 hours',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger document_imports_updated_at
  before update on document_imports
  for each row execute procedure update_updated_at();

alter table document_imports enable row level security;

-- Ownership on all four verbs, plus a DM gate on INSERT specifically.
--
-- Why the asymmetry. Without the DM check, `auth.uid() = user_id` alone would
-- let anyone stage an import against any campaign uuid they can name, including
-- one they do not belong to. Nothing leaks — the row is theirs and the content
-- tables are separately RLS-scoped — but the rows it goes on to create would
-- carry a `campaign_id` for a campaign the importer is not in, which is exactly
-- the kind of quiet data-hygiene break that surfaces months later as "why is
-- this monster in my list". Starting an import is the privileged act, so that
-- is where the gate goes.
--
-- `private.is_campaign_dm` rather than `is_campaign_member`: the importer writes
-- monsters, NPCs, locations, quests and factions, all DM-owned content. A player
-- in the campaign has no business creating them.
--
-- The helper is total — its body is `select exists (...)`, which returns true or
-- false and never NULL — so it is safe in the negated form too, unlike the
-- `is_app_admin` case in CLAUDE.md. No `coalesce` needed here, and adding one
-- would imply a NULL that cannot occur.
--
-- Campaign owners are covered: the `campaigns_create_dm_membership` trigger
-- inserts the owner into `campaign_members` with role 'dm' at creation, so an
-- owner always satisfies the check.
--
-- SELECT/UPDATE/DELETE stay on plain ownership on purpose. A DM whose role is
-- revoked mid-import must still be able to read and delete their own staging
-- row — otherwise a revocation strands a row and its storage objects with
-- nothing able to clean them up but the expiry sweep.
create policy "document_imports_select" on document_imports for select using (auth.uid() = user_id);
create policy "document_imports_insert" on document_imports for insert
  with check (auth.uid() = user_id and private.is_campaign_dm(campaign_id));
create policy "document_imports_update" on document_imports for update using (auth.uid() = user_id);
create policy "document_imports_delete" on document_imports for delete using (auth.uid() = user_id);

-- One index, and it earns its place: the wizard's entry query is "does this
-- user have an unfinished import for the active campaign", which is a lookup on
-- (user_id, campaign_id) filtered by status. Unlike `dashboard_layouts` there is
-- no composite primary key already covering it — the pk here is a surrogate id.
create index document_imports_user_campaign_idx
  on document_imports (user_id, campaign_id)
  where status in ('pending', 'extracting', 'review');

-- ── 3. Credit cost ───────────────────────────────────────────────────────────
-- 5 credits, against 1 for every text-only generator. A generator sends a
-- sentence of prompt; this sends a document — the input token count is one to
-- three orders of magnitude larger, and it runs one pass per entity kind. The
-- number is a starting estimate to be recalibrated from measured spend once
-- real documents have gone through, which is what the admin calibration hints
-- surface exists for.
insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('document_import_extraction', 'Document Import Extraction', 5, 30)
on conflict (generation_type) do nothing;

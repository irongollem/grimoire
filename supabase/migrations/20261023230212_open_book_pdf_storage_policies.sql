-- Storage rules for exported Open Book PDFs (#1085), bucket `open-book-pdfs`.
--
-- Writes go to R2 through r2-sign-upload, which applies the same owner-prefix rule from
-- supabase/functions/_shared/storage-policy.ts. These policies cover the Supabase Storage fallback that
-- src/lib/storage/upload.ts takes when R2 is unavailable, and a local stack (`npm run dev:buckets` makes the
-- bucket there). The bucket itself is deliberately not created here: Supabase buckets are being retired in
-- favour of R2 (#577), and a policy on a bucket that does not exist is inert.
--
-- The owner writes, lists and removes their own folder; reads are public through the CDN. No update policy:
-- an exported PDF is immutable, and a re-export is a new object.

create policy "open_book_pdfs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'open-book-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "open_book_pdfs_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'open-book-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "open_book_pdfs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'open-book-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);

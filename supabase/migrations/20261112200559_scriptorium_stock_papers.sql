-- Books and handouts take their paper from the one shared set of papers (#1181), the same sheets a painting
-- starts from (`src/scriptorium/papers/papers.ts`), instead of four tones of their own. `paper_tone` keeps its
-- name and stays nullable: null is still the look's own paper.
--
-- The two grey tones were the maintainer's own handmade scans, so they join the shared set under the same ids
-- and nothing changes for a book on them. Parchment keeps its id. "White" was an SVG noise drawn by CSS; its
-- nearest sheet is hot-press, so books on it move there.
--
-- A handout may now have a paper too (it used to take its paper from its theme alone); get_player_handout
-- already returns `paper_tone` (20261111210419), so a player sees it unchanged.

update public.scriptorium_documents set paper_tone = 'hot-press' where paper_tone = 'white';

alter table public.scriptorium_documents drop constraint scriptorium_documents_paper_tone_check;
alter table public.scriptorium_documents add constraint scriptorium_documents_paper_tone_check check (paper_tone in (
  'hot-press', 'cold-press', 'rough', 'laid', 'rice-paper', 'parchment', 'treasure-map', 'kraft', 'pastel-grey',
  'linen-canvas', 'grey', 'warm-grey'
));

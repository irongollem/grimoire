-- Move existing campaigns onto the Vellum family (#938). The column default
-- was 'grimoire', so nearly every campaign holds it without anyone having
-- chosen it. Dark stays dark (Grimoire -> Vellum Lamplight), light stays
-- light (Tome -> Vellum). The "new look" announcement (announcements.ts,
-- id 2026-10-vellum) tells DMs how to switch back in campaign settings.
update public.campaigns set theme = 'vellum-dark' where theme = 'grimoire';
update public.campaigns set theme = 'vellum' where theme = 'tome';

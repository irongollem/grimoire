/**
 * Pure email composition for send-notification-email — no Deno imports so
 * vitest can cover it (see vitest.config.ts include of supabase/functions).
 *
 * Every string that came from a user (titles, names) is HTML-escaped: these
 * land in HTML email bodies, and a note titled `<img onerror=…>` must render
 * as text, not execute in a webmail client.
 */

const APP_ORIGIN = "https://app.dungeongrimoire.com";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * "2026-08-05" + "19:30" → "Wednesday, August 5, 2026 at 19:30". The date is a
 * wall-clock campaign date with no timezone, so it is formatted in UTC on
 * purpose — local-TZ parsing would shift it by a day for half the world.
 */
export function formatProposalDate(date: string, time: string | null): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dateLabel = d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  // proposed_time is HH:mm or HH:mm:ss from Postgres `time` — trim the seconds.
  return time ? `${dateLabel} at ${time.slice(0, 5)}` : dateLabel;
}

function layout(campaignName: string, bodyHtml: string, ctaLabel: string, ctaPath: string): string {
  const url = `${APP_ORIGIN}${ctaPath}`;
  return `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 36rem; margin: 0 auto; padding: 1.5rem; color: #2a2118;">
  <p style="font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7a5c; margin: 0 0 1rem;">${escapeHtml(campaignName)}</p>
  ${bodyHtml}
  <p style="margin: 1.5rem 0;">
    <a href="${url}" style="display: inline-block; background: #7a1f1f; color: #f5efe0; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.25rem;">${ctaLabel}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #d9cdb4; margin: 1.5rem 0 0.75rem;" />
  <p style="font-size: 0.75rem; color: #8a7a5c; margin: 0;">
    You receive these emails because you are a member of this campaign in Grimoire.
    Turn them off under <a href="${APP_ORIGIN}/play/settings" style="color: #8a7a5c;">Settings → Notifications</a>.
  </p>
</div>`;
}

const OPT_OUT_TEXT =
  "You receive these emails because you are a member of this campaign in Grimoire. " +
  `Turn them off under Settings → Notifications: ${APP_ORIGIN}/play/settings`;

export function noteSharedEmail(args: {
  campaignName: string;
  dmName: string;
  noteTitle: string;
  noteId: string;
}): EmailContent {
  const { campaignName, dmName, noteTitle, noteId } = args;
  // Deep link straight to the note: PlayerJournalView expands + scrolls to
  // the card named by the `note` query param on its DM Notes tab.
  const notePath = `/play/journal?tab=dm-notes&note=${encodeURIComponent(noteId)}`;
  return {
    subject: `${dmName} shared a session note with you — ${campaignName}`,
    html: layout(
      campaignName,
      `<p style="font-size: 1rem; line-height: 1.6;">
    <strong>${escapeHtml(dmName)}</strong> shared the note
    <strong>“${escapeHtml(noteTitle)}”</strong> with you.
  </p>`,
      "Read the note",
      notePath,
    ),
    text: `${dmName} shared the note "${noteTitle}" with you.\n\nRead it: ${APP_ORIGIN}${notePath}\n\n${OPT_OUT_TEXT}`,
  };
}

/**
 * The two one-click links, when the recipient has an RSVP token. They are the
 * fallback for the invitation attachment: a mail app that draws Accept /
 * Decline handles this without them, but plenty of clients — most webmail on a
 * phone, every plain-text reader — draw nothing at all, and those readers are
 * the ones this whole change exists for.
 */
export interface RsvpLinks {
  yesUrl: string;
  noUrl: string;
}

function rsvpButtons(rsvp: RsvpLinks): string {
  return `<p style="margin: 1.25rem 0 0;">
    <a href="${escapeHtml(rsvp.yesUrl)}" style="display: inline-block; background: #2f5d3a; color: #f5efe0; text-decoration: none; padding: 0.55rem 1.1rem; border-radius: 0.25rem; margin-right: 0.5rem;">I&#39;m in</a>
    <a href="${escapeHtml(rsvp.noUrl)}" style="display: inline-block; background: #fffaf0; color: #6a6049; text-decoration: none; padding: 0.55rem 1.1rem; border: 1px solid #d9cdb4; border-radius: 0.25rem;">Can&#39;t make it</a>
  </p>`;
}

export function proposalCreatedEmail(args: {
  campaignName: string;
  dmName: string;
  proposalTitle: string;
  proposedDate: string;
  proposedTime: string | null;
  /** Omitted when no token could be issued — the email still ships, minus the buttons. */
  rsvp?: RsvpLinks | null;
}): EmailContent {
  const { campaignName, dmName, proposalTitle, proposedDate, proposedTime } = args;
  const rsvp = args.rsvp ?? null;
  const when = formatProposalDate(proposedDate, proposedTime);
  const ask = rsvp
    ? "Answer straight from this email — or accept the invitation attached, and your calendar app will tell us for you."
    : "Let your DM know whether you can make it.";
  return {
    subject: `New session date proposed — ${campaignName}`,
    html: layout(
      campaignName,
      `<p style="font-size: 1rem; line-height: 1.6;">
    <strong>${escapeHtml(dmName)}</strong> proposed a date for
    <strong>${escapeHtml(proposalTitle)}</strong>:
  </p>
  <p style="font-size: 1.1rem; line-height: 1.6; margin: 0.75rem 0;">📅 <strong>${escapeHtml(when)}</strong></p>
  <p style="font-size: 1rem; line-height: 1.6;">${ask}</p>${rsvp ? rsvpButtons(rsvp) : ""}`,
      rsvp ? "Open Grimoire" : "Respond with your availability",
      "/play/settings",
    ),
    text:
      `${dmName} proposed a date for ${proposalTitle}: ${when}.\n\n` +
      (rsvp
        ? `I'm in: ${rsvp.yesUrl}\nCan't make it: ${rsvp.noUrl}\n\n`
        : "") +
      `Or answer in Grimoire: ${APP_ORIGIN}/play/settings\n\n${OPT_OUT_TEXT}`,
  };
}

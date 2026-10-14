/**
 * The inactivity retention periods, in one place for the app and the edge
 * functions (`supabase/functions/_shared/inactivityNotice.ts` imports this
 * file, so it must stay free of `@/` imports and of `import.meta.env`).
 * `private.account_retention()` restates both as SQL intervals; change them
 * together.
 */

/** An account unused this many months is due a notice. */
export const INACTIVE_MONTHS = 12;

/** The notice's deletion date is the send date plus this many days. */
export const NOTICE_GRACE_DAYS = 30;

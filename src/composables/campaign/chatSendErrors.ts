import { PostgrestError } from "@supabase/supabase-js";
import { useToast } from "@/composables/useToast";
import { reportHandledError } from "@/lib/observability/sentry";

/** Why a chat send failed, in words for a toast. A refused whisper arrives as an
 *  RLS violation, which PostgREST reports as SQLSTATE 42501. */
function isRefusedWhisper(e: unknown, wasWhisper: boolean): boolean {
  return wasWhisper && e instanceof PostgrestError && e.code === "42501";
}

export function sendFailureMessage(e: unknown, wasWhisper: boolean): string {
  if (isRefusedWhisper(e, wasWhisper)) return "Message not sent. You can't whisper that player privately.";
  return "Message not sent. Please try again.";
}

/** The words for a toast when a chat post fails, e.g. `Couldn't post the roll to the chat.` */
export function chatFailureMessage(what: string): string {
  return `Couldn't ${what}. Please try again.`;
}

/**
 * Give the user feedback when a `useCampaignMessages` helper throws.
 *
 * The helpers throw their Supabase error so a failed post is never mistaken for
 * "nothing to post". A caller that catches it reports here: the user gets a
 * toast naming what did not happen, and Sentry still sees the error (a caught
 * error never reaches the global handler). `what` completes "Couldn't ...",
 * e.g. `"post the roll to the chat"`.
 */
export function useChatSendFailure() {
  const toast = useToast();
  function reportChatFailure(e: unknown, what: string): void {
    reportHandledError(e, "campaign-chat-send", { what });
    toast.error(chatFailureMessage(what));
  }
  /** A typed message or roll the user sent from the chat box. A whisper the
   *  server refuses (#927) is the rule working, not a fault, so it is only
   *  explained to the user; anything else is reported as well. */
  function reportMessageFailure(e: unknown, wasWhisper: boolean): void {
    if (!isRefusedWhisper(e, wasWhisper)) reportHandledError(e, "campaign-chat-send", { what: "message" });
    toast.error(sendFailureMessage(e, wasWhisper));
  }
  return { reportChatFailure, reportMessageFailure };
}

/** `request-parental-consent` edge function error codes (#919) -> human copy. */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "That doesn't look like a valid email address.",
  same_as_account_email: "That's your own email. Enter your parent or guardian's email instead.",
  already_child: "This account is already linked to a parent.",
  send_failed: "We couldn't send that email. Please try again in a moment.",
  unauthorized: "Your sign-in has expired. Sign out, sign back in, and try again.",
};

/** Maps a `request-parental-consent` error code to human copy; an unrecognised code gets a generic fallback. */
export function parentRequestErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}

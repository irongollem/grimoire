import { functionErrorText } from "@/lib/functionError";

/**
 * supabase-js wraps a non-2xx Edge Function response as a `FunctionsHttpError`
 * and DISCARDS the JSON body — `data` is null and `error.message` is the generic
 * "Edge Function returned a non-2xx status code". Our paid endpoints return
 * structured reasons the user needs to see (account frozen, rate limited,
 * insufficient credits), so read the body back and turn it into a clear message.
 *
 * Use at every generation/spend call site:
 *   if (error) throw new Error(await edgeErrorMessage(error));
 */
export async function edgeErrorMessage(
  fnError: { message?: string; context?: Response },
): Promise<string> {
  let body: { error?: string; message?: string; balance?: number } | null = null;
  const text = await functionErrorText(fnError);
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Some functions answer in plain text ("Campaign not found"). A short
    // line is the reason and worth showing; an HTML error page is not.
    const plain = text?.trim() ?? "";
    if (plain && plain.length <= 200 && !plain.startsWith("<")) return plain;
  }

  switch (body?.error) {
    case "account_suspended":
      return "Your account is frozen — AI generation and purchases are paused. Email info@dungeongrimoire.com to resolve this.";
    case "rate_limited":
      return body.message ?? "You're generating too fast for a new account. Please try again shortly.";
    case "insufficient_credits": {
      const left = body.balance !== undefined ? ` (${body.balance} left)` : "";
      return `Insufficient credits${left}. Buy a credit pack or wait for the monthly refresh.`;
    }
    case "already_subscribed":
      return "You already have an active subscription. Use Manage billing to change it.";
    case "withdrawal_consent_required":
      return "Tick the withdrawal-waiver box above before continuing to payment.";
    case "checkout_failed":
    case "Internal server error":
      return "We couldn't open the payment page. Please try again in a moment, or email info@dungeongrimoire.com if it keeps happening.";
    default:
      return body?.error ?? body?.message ?? fnError.message ?? "The request failed. Please try again.";
  }
}

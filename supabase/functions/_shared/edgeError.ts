import { functionErrorText } from "./functionError.ts";

/**
 * supabase-js wraps a non-2xx Edge Function response as a `FunctionsHttpError`
 * and DISCARDS the JSON body — `data` is null and `error.message` is the generic
 * "Edge Function returned a non-2xx status code". Our paid endpoints return
 * structured reasons the user needs to see (account frozen, rate limited,
 * insufficient credits), so read the body back and turn it into a clear message.
 *
 * Lives in `_shared` because the MCP server invokes paid functions under the
 * caller's token too, and its refusals must read the same as the app's.
 *
 * Use at every generation/spend call site:
 *   if (error) throw new Error(await edgeErrorMessage(error));
 *
 * A caller that also branches on the refusal's code uses `edgeRefusal`, which
 * reads the body once and returns both (a Response body can be read only once).
 */
export async function edgeErrorMessage(
  fnError: { message?: string; context?: Response },
): Promise<string> {
  return (await edgeRefusal(fnError)).sentence;
}

type RefusalBody = { error?: string; message?: string; balance?: number };

/** The refusal's code (`error`), when the body was JSON with one, and the sentence to show for it. */
export async function edgeRefusal(
  fnError: { message?: string; context?: Response },
): Promise<{ code: string | null; sentence: string }> {
  const text = await functionErrorText(fnError);
  let body: RefusalBody | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // The functions outside the AI pipeline (#1234) may still answer in plain
    // text ("Campaign not found"). A short line is the reason and worth showing;
    // an HTML error page is not.
    const plain = text?.trim() ?? "";
    if (plain && plain.length <= 200 && !plain.startsWith("<")) return { code: null, sentence: plain };
  }
  const code = typeof body?.error === "string" ? body.error : null;
  return { code, sentence: sentenceFor(body, fnError) };
}

function sentenceFor(body: RefusalBody | null, fnError: { message?: string }): string {
  switch (body?.error) {
    case "account_suspended":
      return "Your account is frozen: AI generation and purchases are paused. Email info@dungeongrimoire.com to resolve this.";
    case "child_account":
      return "AI features aren't available on young players' accounts.";
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
      // `message` is the sentence for a person and `error` a code (#1234: every refusal is `{ error, message? }`),
      // so the sentence wins when both are there; an older body with only `error` still shows it.
      return body?.message ?? body?.error ?? fnError.message ?? "The request failed. Please try again.";
  }
}

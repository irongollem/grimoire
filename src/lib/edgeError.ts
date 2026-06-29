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
  try {
    body = (await fnError.context?.json()) ?? null;
  } catch {
    /* body wasn't JSON */
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
    default:
      return body?.error ?? body?.message ?? fnError.message ?? "The request failed. Please try again.";
  }
}

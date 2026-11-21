// The Deno-facing wrapper for a signed-in edge function (#1234). Everything it decides lives in `respond.ts`, which is
// tested; this file only wires that to CORS (`withCors`, which also turns an unhandled throw into a reported 500),
// supabase-js and Sentry, and so, like `observability/report.ts`, it is not imported by any test.
//
//   serve(serveUser(async ({ user, req, report }) => { ... }));

import { createClient } from "@supabase/supabase-js";
import { withCors } from "../cors.ts";
import { reportEdgeError } from "../observability/report.ts";
import { authenticate, type UserRequest } from "./respond.ts";

export interface SignedInRequest extends UserRequest {
  /** Send an error that did not stop the request to Sentry (a ledger write that failed after the answer was made). */
  report: (err: unknown) => void;
}

export function serveUser(
  handler: (ctx: SignedInRequest) => Promise<Response>,
  { methods = ["POST"] }: { methods?: readonly string[] } = {},
): (req: Request) => Promise<Response> {
  return withCors(async (req) => {
    const caller = await authenticate(req, methods, (authHeader) =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      }));
    if (caller instanceof Response) return caller;
    return handler({ ...caller, report: (err) => void reportEdgeError(err, req) });
  });
}

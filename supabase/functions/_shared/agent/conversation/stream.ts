// The streaming half of a conversation function (#1253): the Server-Sent Events response, and the emitter a turn
// writes to. Shared so the two ways a stream can lose a paid turn are closed once.

import { jsonError } from "../../pipeline/respond.ts";
import type { Refusal } from "./gates.ts";

/**
 * Wraps a listener so one that throws (a closed stream: the browser went away) never costs the turn that is already
 * paid for. The turn goes on, is saved and charged, and only the telling is lost.
 */
export function safeEmit<E>(send: (event: E) => void): (event: E) => void {
  return (event) => {
    try {
      send(event);
    } catch {
      // ignored on purpose
    }
  };
}

/**
 * The response for a turn that runs inside the stream. `run` gets `send` and the request's abort signal; the stream
 * is closed whether it finished, threw or the client left.
 */
export function eventStreamResponse<E>(
  run: (send: (event: E) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: E) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await run(send);
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by the client going away
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

/** A refusal before the stream opened. A code (`sitting_ended`, `rate_limited`...) is the page's to branch on; a sentence is for a person. */
export function refusalResponse(refusal: Refusal): Response {
  return /^[a-z][a-z_]*$/.test(refusal.error)
    ? jsonError(refusal.status, refusal.error)
    : jsonError(refusal.status, "refused", refusal.error);
}

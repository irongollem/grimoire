/**
 * The generic half of reading an agent function's server-sent events: bytes to `data:` payloads to JSON, then a
 * caller's parser decides what each payload is. The Table (`readTableStream`) and Ask Grimoire share it, so the
 * chunk-boundary rules live in one place.
 */

function payloadOf(block: string): unknown {
  // A block is `data: <json>` lines; a comment line (": keep-alive") has none and is skipped.
  const payload = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  if (payload === "") return undefined;
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

/**
 * The events of a response, in order, each run through `parse` (which returns null for anything it does not know).
 * Chunks arrive wherever the network cut them: an event may be split across two, and several may share one, so
 * text is buffered until a blank line ends an event.
 */
export async function* readEventStream<T>(response: Response, parse: (raw: unknown) => T | null): AsyncGenerator<T> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut >= 0) {
        const raw = payloadOf(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 2);
        const event = raw === undefined ? null : parse(raw);
        if (event) yield event;
        cut = buffer.indexOf("\n\n");
      }
    }
    // A stream that ends mid-event never finished it: the half block is dropped, not guessed at.
  } finally {
    reader.releaseLock();
  }
}

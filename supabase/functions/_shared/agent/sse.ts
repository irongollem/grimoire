// A Server-Sent Events reader for the agent adapters (#1205).
//
// `documentGen.ts` has a reader too, but it only yields events that carry a string `type` and skips `[DONE]`,
// which fits Anthropic's document stream and not OpenAI's chat chunks (no `type`, and `[DONE]` is the terminal
// signal the adapter must see). This one hands back every event's raw data and name and leaves meaning to the caller.

export interface SseMessage {
  /** The `event:` name, or null when the server sent none (OpenAI sends none). */
  event: string | null;
  /** The joined `data:` lines, still a string. */
  data: string;
}

/**
 * Splits a byte stream into SSE messages. A message ends at a blank line; a stream that closes with a message still
 * pending delivers it, so a final event without its trailing blank line is not lost. Bytes may be split anywhere,
 * including inside a multi-byte character, which the streaming decoder holds until it is whole.
 */
export async function* iterateSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | null = null;
  let data: string[] = [];

  const flush = (): SseMessage | null => {
    if (data.length === 0) {
      event = null;
      return null;
    }
    const message = { event, data: data.join("\n") };
    event = null;
    data = [];
    return message;
  };

  const readLine = (line: string): SseMessage | null => {
    if (line === "") return flush();
    if (line.startsWith(":")) return null; // a comment, used as a keep-alive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    return null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // The last element may be half a line; it waits for more bytes.
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const message = readLine(raw.endsWith("\r") ? raw.slice(0, -1) : raw);
        if (message) yield message;
      }
    }
    buffer += decoder.decode();
    if (buffer !== "") {
      const message = readLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
      if (message) yield message;
    }
    const last = flush();
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

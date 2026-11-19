// Helpers for the adapter tests: a fake fetch that serves recorded SSE text in awkward chunks. No network.

export function sseBody(text: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

export interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export function fakeFetch(respond: () => Response): { fetch: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return respond();
  }) as typeof fetch;
  return { fetch: impl, calls };
}

export function sseResponse(text: string, chunkSize?: number): Response {
  return new Response(sseBody(text, chunkSize), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
export const named = (event: string, obj: unknown) => `event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`;

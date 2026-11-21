import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { miniForgeError } from "./useMiniForge";

const failure = (body: unknown) => ({ message: "non-2xx", context: new Response(JSON.stringify(body), { status: 409 }) });

describe("miniForgeError", () => {
  it("words a code the client knows itself, reading it from the body because the shared refusals put a sentence in `message`", async () => {
    // edgeErrorMessage would show the server's sentence here; the code is what picks the client's own wording.
    const text = await miniForgeError(failure({ error: "feature_disabled", message: "Server sentence." }));
    expect(text).toBe("The Simulacrum ritual isn't open yet.");
  });

  it("shows the server's sentence for a code the client has no wording for", async () => {
    expect(await miniForgeError(failure({ error: "forbidden", message: "That mini is not yours." }))).toBe("That mini is not yours.");
  });

  it("falls back to the client's message when the response had no JSON body", async () => {
    expect(await miniForgeError({ message: "network down", context: new Response("<html>") })).toBe("network down");
  });
});

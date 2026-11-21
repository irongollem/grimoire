import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./useEmbeddingBackfill";

const failure = (body: unknown) => ({ message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify(body)) });

describe("extractErrorMessage", () => {
  it("shows the sentence, not the code, when the body carries both", async () => {
    // Fails if the code is read before the sentence: the admin would see "store_failed".
    expect(await extractErrorMessage(failure({ error: "store_failed", message: "Failed to store embeddings" })))
      .toBe("Failed to store embeddings");
  });

  it("prefers the provider detail over both", async () => {
    expect(await extractErrorMessage(failure({ error: "embedding_provider_unavailable", message: "No provider.", detail: "Two providers are enabled." })))
      .toBe("Two providers are enabled.");
  });

  it("falls back to the client message when the response has no JSON body", async () => {
    expect(await extractErrorMessage({ message: "boom", context: new Response("<html>") })).toBe("boom");
  });
});

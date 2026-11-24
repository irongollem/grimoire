import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { voiceStudioCall } from "./useSpeechVoices";

const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe("voiceStudioCall", () => {
  // Bug caught: the studio's own sentence lost behind a generic one, so the admin never learns why (a missing key,
  // a preview text too short).
  it("shows the studio's own refusal", async () => {
    await expect(voiceStudioCall({ action: "account" }, answer(503, { error: "no_key", message: "ElevenLabs is not set up on this server." })))
      .rejects.toThrow("ElevenLabs is not set up on this server.");
  });

  // Bug caught: a gateway's message ("name resolution failed") shown to a person as if it were the studio's answer.
  it("never shows a message that is not the studio's", async () => {
    await expect(voiceStudioCall({ action: "account" }, answer(502, { message: "name resolution failed" })))
      .rejects.toThrow("The voice studio could not be reached. Try again in a moment.");
  });
});

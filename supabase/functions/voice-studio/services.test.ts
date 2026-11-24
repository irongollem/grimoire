import { describe, expect, it } from "vitest";
import { ServiceError } from "./handler";
import { makeServices } from "./services";

const env = { elevenKey: "eleven-secret", inworldKey: "inworld-secret", elevenModel: "m" };

function fakeFetch(answers: Array<{ status?: number; body?: unknown }>) {
  const seen: Array<{ url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null }> = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const a = answers.shift() ?? { status: 500 };
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as unknown as typeof fetch;
  return { seen, services: makeServices(env, doFetch) };
}

describe("Inworld design", () => {
  it("asks for the prompt verbatim, three samples, and sends the prompt as written", async () => {
    const { seen, services } = fakeFetch([{ body: { previewVoices: [{ voiceId: "w__v1", previewAudio: "AAAA" }] } }]);
    const out = await services.design("inworld", " a  prompt\n", "say this");
    expect(seen[0].body).toMatchObject({ designPrompt: " a  prompt\n", previewText: "say this", designPromptMode: "DESIGN_PROMPT_MODE_VERBATIM", voiceDesignConfig: { numberOfSamples: 3 } });
    expect(seen[0].headers.Authorization).toBe("Basic inworld-secret");
    expect(out[0]).toMatchObject({ id: "w__v1", audio: "AAAA" });
  });
});

describe("ElevenLabs", () => {
  it("design uses the v3 design model and the text as written", async () => {
    const { seen, services } = fakeFetch([{ body: { previews: [{ generated_voice_id: "g1", audio_base_64: "AAAA" }] } }]);
    await services.design("elevenlabs", "p", "t");
    expect(seen[0].body).toEqual({ voice_description: "p", model_id: "eleven_ttv_v3", text: "t" });
    expect(seen[0].headers["xi-api-key"]).toBe("eleven-secret");
  });

  it("library add answers the id the account returned, not the library's", async () => {
    const { seen, services } = fakeFetch([{ body: { voice_id: "accountid12" } }]);
    expect(await services.libraryAdd("owner1", "libid1234", "Name")).toBe("accountid12");
    expect(seen[0].url).toBe("https://api.elevenlabs.io/v1/voices/add/owner1/libid1234");
    expect(seen[0].body).toEqual({ new_name: "Name" });
  });

  it("keep labels the voice so the account's My Voices stays sorted", async () => {
    const { seen, services } = fakeFetch([{ body: { voice_id: "v1234567" } }]);
    await services.keep("elevenlabs", { previewId: "g1", name: "N", description: "D" });
    expect(seen[0].body?.labels).toEqual({ grimoire: "slot" });
  });

  it("a free library voice has a null rate and a paid one keeps it", async () => {
    const { services } = fakeFetch([{ body: { has_more: true, voices: [{ public_owner_id: "o", voice_id: "a1234567" }, { public_owner_id: "o", voice_id: "b1234567", rate: 0.3, notice_period: 30 }] } }]);
    const out = await services.librarySearch({ search: "", page: 0 });
    expect(out.hasMore).toBe(true);
    expect(out.voices.map((v) => [v.rate, v.noticePeriodDays])).toEqual([[null, null], [0.3, 30]]);
  });

  it("the account listing leaves the ready-made voices out", async () => {
    const { services } = fakeFetch([{ body: { voices: [{ voice_id: "premade123", category: "premade" }, { voice_id: "mine12345", category: "generated" }] } }]);
    expect((await services.accountVoices("elevenlabs")).map((v) => v.voiceId)).toEqual(["mine12345"]);
  });

  it("deleting a voice that is already gone is not an error, but any other refusal is", async () => {
    const gone = fakeFetch([{ status: 404 }]);
    await expect(gone.services.deleteVoice("elevenlabs", "abc12345")).resolves.toBeUndefined();
    const refused = fakeFetch([{ status: 401 }]);
    await expect(refused.services.deleteVoice("elevenlabs", "abc12345")).rejects.toBeInstanceOf(ServiceError);
  });

  it("an ok answer without the voice id is a failure, not an empty voice", async () => {
    const { services } = fakeFetch([{ body: {} }]);
    await expect(services.keep("elevenlabs", { previewId: "g", name: "N", description: "D" })).rejects.toBeInstanceOf(ServiceError);
  });
});

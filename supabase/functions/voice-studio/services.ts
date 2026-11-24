// The calls the voice studio makes to ElevenLabs and Inworld. Plain `fetch`, so a test can stand in for it; the keys
// come in as `SpeechEnv` (`_shared/speechKeys.ts`) and are never logged. A failing call throws `ServiceError`, which
// carries the status only: neither service's own message is ever shown or logged.
import { hasSpeechService, synthesizeSpeech, type SpeechEnv } from "../_shared/speech.ts";
import { ServiceError, type AccountVoice, type DesignedPreview, type LibraryVoice, type SpeechService, type StudioServices } from "./handler.ts";

const ELEVEN = "https://api.elevenlabs.io";
const INWORLD = "https://api.inworld.ai";
// Designing a voice is slow (the service renders three samples); the rest are quick.
const DESIGN_TIMEOUT_MS = 90_000;
const CALL_TIMEOUT_MS = 30_000;
const PAGE_LIMIT = 20;
const LIBRARY_PAGE_SIZE = 20;

type Fetch = typeof fetch;

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function makeServices(env: SpeechEnv, doFetch: Fetch = fetch): StudioServices {
  const headers = (service: SpeechService): Record<string, string> =>
    service === "inworld" ? { Authorization: `Basic ${env.inworldKey ?? ""}`, "Content-Type": "application/json" } : { "xi-api-key": env.elevenKey ?? "", "Content-Type": "application/json" };

  async function call(service: SpeechService, url: string, init: { method: string; body?: unknown; timeout?: number; okOn404?: boolean }): Promise<Record<string, unknown>> {
    const response = await doFetch(url, {
      method: init.method,
      headers: headers(service),
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(init.timeout ?? CALL_TIMEOUT_MS),
    });
    if (init.okOn404 && response.status === 404) return {};
    if (!response.ok) throw new ServiceError(service, response.status);
    return obj(await response.json().catch(() => null)) ?? {};
  }

  const required = (service: SpeechService, v: unknown): string => {
    const text = str(v);
    // The service answered ok but without what it should hold: a failure, not an empty result.
    if (text === null) throw new ServiceError(service, 502);
    return text;
  };

  return {
    hasService: (service) => hasSpeechService(env, service),

    async design(service, prompt, previewText) {
      if (service === "inworld") {
        // VERBATIM: the default mode lets Inworld rewrite the prompt, and the maintainer's words are the brief.
        const out = await call("inworld", `${INWORLD}/voices/v1/voices:design`, {
          method: "POST",
          timeout: DESIGN_TIMEOUT_MS,
          body: { languageCode: "en-US", designPrompt: prompt, previewText, designPromptMode: "DESIGN_PROMPT_MODE_VERBATIM", voiceDesignConfig: { numberOfSamples: 3 } },
        });
        const list = Array.isArray(out.previewVoices) ? out.previewVoices : [];
        return list.map((p): DesignedPreview => {
          const o = obj(p) ?? {};
          return { id: required("inworld", o.voiceId), audio: required("inworld", o.previewAudio), mediaType: "" };
        });
      }
      const out = await call("elevenlabs", `${ELEVEN}/v1/text-to-voice/design`, {
        method: "POST",
        timeout: DESIGN_TIMEOUT_MS,
        body: { voice_description: prompt, model_id: "eleven_ttv_v3", text: previewText },
      });
      const list = Array.isArray(out.previews) ? out.previews : [];
      return list.map((p): DesignedPreview => {
        const o = obj(p) ?? {};
        return { id: required("elevenlabs", o.generated_voice_id), audio: required("elevenlabs", o.audio_base_64), mediaType: "" };
      });
    },

    async keep(service, draft) {
      if (service === "inworld") {
        const out = await call("inworld", `${INWORLD}/voices/v1/voices/${encodeURIComponent(draft.previewId)}:publish`, {
          method: "POST",
          body: { displayName: draft.name, description: draft.description, tags: ["grimoire"] },
        });
        return required("inworld", out.voiceId);
      }
      // The label keeps the maintainer's My Voices sorted: everything the registry made is findable by it.
      const out = await call("elevenlabs", `${ELEVEN}/v1/text-to-voice`, {
        method: "POST",
        body: { voice_name: draft.name, voice_description: draft.description, generated_voice_id: draft.previewId, labels: { grimoire: "slot" } },
      });
      return required("elevenlabs", out.voice_id);
    },

    async deleteVoice(service, voiceId) {
      // Already gone is as good as deleted.
      if (service === "inworld") await call("inworld", `${INWORLD}/voices/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", okOn404: true });
      else await call("elevenlabs", `${ELEVEN}/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", okOn404: true });
    },

    async librarySearch(query) {
      const params = new URLSearchParams({ page_size: String(LIBRARY_PAGE_SIZE), page: String(query.page) });
      if (query.search.trim() !== "") params.set("search", query.search);
      if (query.gender !== undefined) params.set("gender", query.gender);
      if (query.age !== undefined) params.set("age", query.age);
      const out = await call("elevenlabs", `${ELEVEN}/v1/shared-voices?${params.toString()}`, { method: "GET" });
      const list = Array.isArray(out.voices) ? out.voices : [];
      const voices = list.map((raw): Omit<LibraryVoice, "inRegistry"> => {
        const v = obj(raw) ?? {};
        return {
          publicOwnerId: required("elevenlabs", v.public_owner_id),
          voiceId: required("elevenlabs", v.voice_id),
          name: str(v.name) ?? "Unnamed voice",
          description: str(v.description) ?? "",
          previewUrl: str(v.preview_url),
          gender: str(v.gender),
          age: str(v.age),
          accent: str(v.accent),
          useCase: str(v.use_case),
          // A voice with no rate, or a rate of nothing, is free.
          rate: typeof v.rate === "number" && v.rate > 0 ? v.rate : null,
          noticePeriodDays: typeof v.notice_period === "number" ? v.notice_period : null,
        };
      });
      return { voices, hasMore: out.has_more === true };
    },

    async libraryAdd(publicOwnerId, voiceId, name) {
      const out = await call("elevenlabs", `${ELEVEN}/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`, { method: "POST", body: { new_name: name } });
      return required("elevenlabs", out.voice_id);
    },

    async accountSlots() {
      const out = await call("elevenlabs", `${ELEVEN}/v1/user/subscription`, { method: "GET" });
      if (typeof out.voice_slots_used !== "number" || typeof out.voice_limit !== "number") throw new ServiceError("elevenlabs", 502);
      return { used: out.voice_slots_used, limit: out.voice_limit };
    },

    async accountVoices(service) {
      const found: AccountVoice[] = [];
      if (service === "inworld") {
        let token: string | null = null;
        for (let page = 0; page < PAGE_LIMIT; page++) {
          const params = new URLSearchParams({ filter: 'owned = "true"', pageSize: "200" });
          if (token !== null) params.set("pageToken", token);
          const out = await call("inworld", `${INWORLD}/voices/v1/voices?${params.toString()}`, { method: "GET" });
          for (const raw of Array.isArray(out.voices) ? out.voices : []) {
            const v = obj(raw) ?? {};
            found.push({ service, voiceId: required(service, v.voiceId), name: str(v.displayName) ?? required(service, v.voiceId), description: str(v.description) ?? "", category: str(v.source) ?? "unknown" });
          }
          token = str(out.nextPageToken);
          if (token === null) break;
        }
        return found;
      }
      let next: string | null = null;
      for (let page = 0; page < PAGE_LIMIT; page++) {
        const params = new URLSearchParams({ page_size: "100" });
        if (next !== null) params.set("next_page_token", next);
        const out = await call("elevenlabs", `${ELEVEN}/v2/voices?${params.toString()}`, { method: "GET" });
        for (const raw of Array.isArray(out.voices) ? out.voices : []) {
          const v = obj(raw) ?? {};
          const category = str(v.category) ?? "unknown";
          // The ready-made voices are everyone's and need no registering.
          if (category === "premade") continue;
          found.push({ service, voiceId: required(service, v.voice_id), name: str(v.name) ?? required(service, v.voice_id), description: str(v.description) ?? "", category });
        }
        next = out.has_more === true ? str(out.next_page_token) : null;
        if (next === null) break;
      }
      return found;
    },

    // ElevenLabs keeps a preview recording of every voice (ready-made, designed, saved from the library) at a public
    // address. Downloading it costs no characters, which is what lets anyone listen to a voice for free. Inworld
    // publishes none: null, and the caller speaks a line instead.
    async previewRecording(service, voiceId) {
      if (service !== "elevenlabs") return null;
      const voice = await call("elevenlabs", `${ELEVEN}/v1/voices/${encodeURIComponent(voiceId)}`, { method: "GET", okOn404: true });
      const url = str(voice.preview_url);
      if (url === null || !url.startsWith("https://")) return null;
      const response = await doFetch(url, { method: "GET", signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length > 0 ? bytes : null;
    },

    synthesize: (service, voiceId, text) => synthesizeSpeech(env, { service, id: voiceId }, text),
  };
}

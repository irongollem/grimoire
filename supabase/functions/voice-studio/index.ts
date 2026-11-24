// voice-studio (#1272): designs, keeps, imports and removes the voices of the registry. The rules are `handler.ts`'s;
// this file wires the database, the speech services and the samples' store. Every action but `sample` and `greeting` is the admin's.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { getObject, putObject, deleteObjects } from "../_shared/r2/client.ts";
import { voiceStoreFrom } from "../_shared/agent/voiceClips.ts";
import { loadSpeechEnv } from "../_shared/speechKeys.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { handleStudio, STUDIO_MESSAGES, type SampleStore, type SpeechVoiceRow, type StudioDeps } from "./handler.ts";
import { makeServices } from "./services.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// The samples live in the clips' private bucket (`voiceStoreFrom`), under `voice-samples/`. Without R2 credentials
// nothing is kept and a sample is made anew on every listen.
const voiceStore = voiceStoreFrom((key) => Deno.env.get(key));
const store: SampleStore | null =
  voiceStore === null
    ? null
    : {
        get: (key) => getObject(voiceStore, key),
        put: (key, body, contentType) => putObject(voiceStore, { key, body, contentType }),
        remove: (key) => deleteObjects(voiceStore, [key]),
      };

serve(serveUser(async ({ user, req, report, userClient }) => {
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);

  // `sample` and `greeting` are for anyone signed in (a slot's own row level security decides what they may hear, and
  // the Familiar's greeting is the one bound slot open to all); everything else goes through the admin gate before
  // any key is read or any row written.
  const forEveryone = body.action === "sample" || body.action === "greeting";
  if (!forEveryone) {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
  }

  const speech = await loadSpeechEnv(admin);

  const deps: StudioDeps = {
    services: makeServices(speech),
    store,
    rateLimit: (userId) => checkRateLimit(admin, userId, "voice_sample"),
    newId: () => crypto.randomUUID(),
    report,
    db: {
      async listAll() {
        const { data, error } = await admin.from("speech_voices").select("*");
        if (error) throw error;
        return (data ?? []) as SpeechVoiceRow[];
      },
      async loadAsAdmin(id) {
        const { data, error } = await admin.from("speech_voices").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return data as SpeechVoiceRow | null;
      },
      async loadBound(binding) {
        const { data, error } = await admin.from("speech_voices").select("*").eq("binding", binding).maybeSingle();
        if (error) throw error;
        return data as SpeechVoiceRow | null;
      },
      async loadAsCaller(id) {
        const { data, error } = await userClient.from("speech_voices").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return data as SpeechVoiceRow | null;
      },
      async insert(row) {
        const { data, error } = await admin.from("speech_voices").insert(row).select("*").single();
        if (error) throw error;
        return data as SpeechVoiceRow;
      },
      async update(id, patch) {
        const { data, error } = await admin.from("speech_voices").update(patch).eq("id", id).select("*").single();
        if (error) throw error;
        return data as SpeechVoiceRow;
      },
      async setSampleKey(id, voiceId, key) {
        const { error } = await admin.from("speech_voices").update({ sample_key: key }).eq("id", id).eq("voice_id", voiceId);
        if (error) throw error;
      },
      async remove(id) {
        const { error } = await admin.from("speech_voices").delete().eq("id", id);
        if (error) throw error;
      },
    },
  };

  return handleStudio({ userId: user.id, isAdmin: !forEveryone, body, deps });
}));

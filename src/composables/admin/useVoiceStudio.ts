import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { SPEECH_VOICES_KEY, voiceStudioCall } from "@/composables/voices/useSpeechVoices";
import type {
  AccountResponse,
  AccountVoice,
  DesignedPreview,
  DesignResponse,
  KeepResponse,
  LibraryAddResponse,
  LibrarySearchRequest,
  LibrarySearchResponse,
  LibraryVoice,
  LookedUpVoice,
  LookupResponse,
  SpeechService,
  SpeechVoice,
  SpeechVoiceFields,
  VoiceAge,
  VoiceSex,
} from "@/types/speechVoice.types";

// The admin's voice studio (#1272): design voices on a service, keep any number of them, add library voices, import
// the ones already on an account, and write the slots' own fields. The studio's calls go through `voiceStudioCall`;
// slot fields are written straight to `speech_voices` (admin RLS), and every write refreshes the registry.

export const VOICE_ACCOUNT_KEY = ["voice-studio", "account"] as const;

/** ElevenLabs refuses a preview text outside this many characters. */
export const ELEVENLABS_PREVIEW_MIN = 100;
export const ELEVENLABS_PREVIEW_MAX = 1000;

/** The old voice is deleted from the service only when the admin asked AND the studio made it (it frees a custom slot). */
export function shouldRetireOld(existing: Pick<SpeechVoice, "origin" | "voice_id"> | undefined, asked: boolean): boolean {
  return asked && existing?.voice_id != null && existing.origin === "designed";
}

/** A stock voice belongs to the service; every other origin may be deleted from it along with the slot. */
export function canDeleteFromService(voice: Pick<SpeechVoice, "origin" | "voice_id">): boolean {
  return voice.voice_id !== null && voice.origin !== "stock";
}

/** The name offered for "Keep as a new slot": "Shady guy" becomes "Shady guy 2", "Shady guy 2" becomes "Shady guy 3". */
export function nextSlotName(name: string): string {
  const match = /^(.*\S)\s+(\d+)$/.exec(name.trim());
  if (match) return `${match[1]} ${Number(match[2]) + 1}`;
  return `${name.trim()} 2`;
}

/** The slot-field set of a slot, for a copy. */
export function fieldsOf(voice: SpeechVoice): SpeechVoiceFields {
  return {
    name: voice.name,
    description: voice.description,
    design_prompt: voice.design_prompt,
    preview_text: voice.preview_text,
    sex: voice.sex,
    age: voice.age,
    kind: voice.kind,
  };
}

/** Trimmed fields as written: an empty prompt or text is stored as null, never as an empty string. */
export function cleanFields(fields: SpeechVoiceFields): SpeechVoiceFields {
  const blank = (text: string | null): string | null => (text !== null && text.trim() !== "" ? text : null);
  return {
    ...fields,
    name: fields.name.trim(),
    description: fields.description.trim(),
    design_prompt: blank(fields.design_prompt),
    preview_text: blank(fields.preview_text),
  };
}

/** Why a design request cannot be sent yet, or null when it can. */
export function designProblem(service: SpeechService, prompt: string, previewText: string): string | null {
  if (prompt.trim() === "") return "Write what the voice should sound like first.";
  if (service === "elevenlabs") {
    const length = previewText.trim().length;
    if (length < ELEVENLABS_PREVIEW_MIN || length > ELEVENLABS_PREVIEW_MAX) {
      return `ElevenLabs needs a preview text of ${ELEVENLABS_PREVIEW_MIN} to ${ELEVENLABS_PREVIEW_MAX} characters.`;
    }
  }
  if (previewText.trim() === "") return "Write the words the previews should say.";
  return null;
}

export interface KeepInput {
  service: SpeechService;
  preview: DesignedPreview;
  /** Fill this slot. */
  slot?: SpeechVoice;
  /** Or make a new slot from these fields. */
  newSlot?: SpeechVoiceFields;
  /** The admin ticked "Also delete the old voice"; honoured only for a designed voice. */
  retireOld?: boolean;
}

/** ElevenLabs' own gender label, as a slot's sex; anything else is left for the admin to set. */
export function sexOfLabel(gender: string | null): VoiceSex | null {
  if (gender === "female") return "woman";
  if (gender === "male") return "man";
  return null;
}

/** ElevenLabs' own age label ("young", "middle_aged", "old"), as a slot's age band; anything else is left unset. */
export function ageOfLabel(age: string | null): VoiceAge | null {
  if (age === "young") return "young";
  if (age === "middle_aged" || age === "middle aged" || age === "middle-aged") return "adult";
  if (age === "old") return "old";
  return null;
}

export function useVoiceStudio(sample?: { forget: (slotId: string) => void }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: SPEECH_VOICES_KEY });

  /** What the account has: custom slots used, and voices no slot holds yet. Read once, refreshed after a change. */
  const account = useQuery({
    queryKey: VOICE_ACCOUNT_KEY,
    queryFn: () => voiceStudioCall<AccountResponse>({ action: "account" }),
    staleTime: 5 * 60_000,
    // A refused key is answered inside the summary now; what is left to fail is worth one more try, not three.
    retry: 1,
  });
  const refreshAccount = () => queryClient.invalidateQueries({ queryKey: VOICE_ACCOUNT_KEY });

  const design = useMutation({
    mutationFn: async (input: { service: SpeechService; prompt: string; previewText: string }): Promise<DesignedPreview[]> => {
      const response = await voiceStudioCall<DesignResponse>({
        action: "design",
        service: input.service,
        prompt: input.prompt,
        previewText: input.previewText,
      });
      return response.previews;
    },
  });

  const keep = useMutation({
    mutationFn: async (input: KeepInput): Promise<SpeechVoice> => {
      const response = await voiceStudioCall<KeepResponse>({
        action: "keep",
        service: input.service,
        previewId: input.preview.id,
        audio: input.preview.audio,
        ...(input.slot ? { slotId: input.slot.id, retireOld: shouldRetireOld(input.slot, input.retireOld === true) } : {}),
        ...(input.newSlot ? { slot: cleanFields(input.newSlot) } : {}),
      });
      return response.voice;
    },
    onSuccess: async (_voice, input) => {
      // A replaced slot's cached sample is the old voice; a new slot has none to forget.
      if (input.slot) sample?.forget(input.slot.id);
      await Promise.all([refresh(), refreshAccount()]);
    },
  });

  /** An ElevenLabs voice by the ID pasted from their website. */
  async function lookupVoice(voiceId: string): Promise<LookedUpVoice> {
    return (await voiceStudioCall<LookupResponse>({ action: "lookup", voiceId })).voice;
  }

  async function searchLibrary(request: Omit<LibrarySearchRequest, "action">): Promise<LibrarySearchResponse> {
    return voiceStudioCall<LibrarySearchResponse>({ action: "library-search", ...request });
  }

  const addFromLibrary = useMutation({
    mutationFn: async (input: { voice: Pick<LibraryVoice, "publicOwnerId" | "voiceId">; slot: SpeechVoiceFields }): Promise<SpeechVoice> => {
      const response = await voiceStudioCall<LibraryAddResponse>({
        action: "library-add",
        publicOwnerId: input.voice.publicOwnerId,
        voiceId: input.voice.voiceId,
        slot: cleanFields(input.slot),
      });
      return response.voice;
    },
    onSuccess: refresh,
  });

  const importVoice = useMutation({
    mutationFn: async (input: { voice: Pick<AccountVoice, "service" | "voiceId">; slot: SpeechVoiceFields; origin?: "imported" | "stock" }): Promise<void> => {
      const { error } = await supabase.from("speech_voices").insert({
        ...cleanFields(input.slot),
        // A ready-made voice found by its ID is everyone's, not one the account made.
        origin: input.origin ?? "imported",
        service: input.voice.service,
        voice_id: input.voice.voiceId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([refresh(), refreshAccount()]);
    },
  });

  /** Create a planned slot (`id` omitted) or write one slot's own fields. */
  const saveSlot = useMutation({
    mutationFn: async (input: { id?: string; fields: SpeechVoiceFields; active?: boolean }): Promise<void> => {
      const fields = cleanFields(input.fields);
      if (input.id === undefined) {
        const { error } = await supabase.from("speech_voices").insert({ ...fields, origin: "designed", active: input.active ?? true });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("speech_voices")
        .update({ ...fields, ...(input.active === undefined ? {} : { active: input.active }) })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (input: { slot: SpeechVoice; fromService: boolean }): Promise<void> => {
      // A planned slot holds no voice: there is nothing on a service to delete, so it is only a row.
      if (input.slot.voice_id === null) {
        const { error } = await supabase.from("speech_voices").delete().eq("id", input.slot.id);
        if (error) throw error;
        return;
      }
      await voiceStudioCall({
        action: "remove",
        slotId: input.slot.id,
        fromService: input.fromService && canDeleteFromService(input.slot),
      });
    },
    onSuccess: async (_none, input) => {
      sample?.forget(input.slot.id);
      await Promise.all([refresh(), refreshAccount()]);
    },
  });

  return { account, design, keep, searchLibrary, lookupVoice, addFromLibrary, importVoice, saveSlot, remove };
}

import { onBeforeUnmount, ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export type ReadingVoice = "male" | "female";
/** With feeling (ElevenLabs, with delivery cues: the maintainer's pick by ear) or plainly, on the cheaper service. */
export type ReadingTelling = "storyteller" | "plain";

export const READING_TELLING_OPTIONS: ReadonlyArray<{ value: ReadingTelling; label: string }> = [
  { value: "storyteller", label: "With feeling" },
  { value: "plain", label: "Plainly (cheaper)" },
];

/** What a reading would cost, asked before it is made. */
export interface ReadingEstimate {
  chars: number;
  credits: number;
  /** This very text in this voice has been read already. */
  has: boolean;
}

/** Calls `note-reading` and hands back the raw response. The seam a test replaces. */
export type ReadingTransport = (request: { action: "estimate" | "make" | "listen"; noteId: string; voice?: ReadingVoice; telling?: ReadingTelling }) => Promise<Response>;

export const sendToNoteReading: ReadingTransport = async (request) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/note-reading`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(request),
  });
};

/**
 * A refusal in the player's own words. `code` is the server's `error` code and `message` its sentence for a person
 * (#1234); a refusal that has a sentence shows it, and the codes the page branches on are read from `code`.
 */
export function readingRefusal(status: number, code: string | null, message: string | null = null): string {
  if (status === 402 || code === "insufficient_credits") return "You are out of credits, so the note could not be read aloud. Nothing was charged.";
  if (status === 422 && message !== null) return message;
  if (status === 403 && code === "child_account") return "Reading aloud is not open to a child account.";
  if (status === 403) return message ?? "Only the Dungeon Master has a note read aloud.";
  if (status === 404) return "There is no recording of this note to play.";
  if (code === "voices_spent") return "The voices have used up their allowance for now. Nothing was charged.";
  if (status === 503) return "Reading aloud is not switched on for this server.";
  return "The note could not be read aloud right now. Nothing was charged.";
}

async function refusalOf(response: Response): Promise<string> {
  let code: string | null = null;
  let message: string | null = null;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") code = body.error;
    if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") message = body.message;
  } catch {
    // Not JSON (a gateway's page): the status alone decides.
  }
  return readingRefusal(response.status, code, message);
}

/**
 * A note read aloud (#1021 row 19): the Dungeon Master asks the cost and has it made; anyone who may read the note
 * listens. The recording is fetched with the caller's own token (an `<audio>` cannot send one) and played from the
 * browser's memory; the server decides who may hear it.
 */
export function useNoteReading(transport: ReadingTransport = sendToNoteReading) {
  const client = useQueryClient();
  const busy = ref<"estimate" | "make" | "listen" | null>(null);
  const problem = ref<string | null>(null);
  const audioUrl = ref<string | null>(null);

  function forget(): void {
    if (audioUrl.value !== null) URL.revokeObjectURL(audioUrl.value);
    audioUrl.value = null;
  }
  onBeforeUnmount(forget);

  async function ask<T>(action: "estimate" | "make" | "listen", noteId: string, how: { voice: ReadingVoice; telling: ReadingTelling } | undefined, read: (response: Response) => Promise<T>): Promise<T | null> {
    if (busy.value !== null) return null;
    busy.value = action;
    problem.value = null;
    try {
      const response = await transport({ action, noteId, ...(how === undefined ? {} : how) });
      if (!response.ok) {
        problem.value = await refusalOf(response);
        return null;
      }
      return await read(response);
    } catch {
      problem.value = readingRefusal(0, null);
      return null;
    } finally {
      busy.value = null;
    }
  }

  const estimate = (noteId: string, how: { voice: ReadingVoice; telling: ReadingTelling }): Promise<ReadingEstimate | null> =>
    ask("estimate", noteId, how, async (response) => {
      const body = (await response.json()) as Partial<ReadingEstimate>;
      if (typeof body.chars !== "number" || typeof body.credits !== "number") throw new Error("not an estimate");
      return { chars: body.chars, credits: body.credits, has: body.has === true };
    });

  /** Has the note read aloud. True when it was made; the note's own row then says so, and the lists are read again. */
  async function make(noteId: string, how: { voice: ReadingVoice; telling: ReadingTelling }): Promise<boolean> {
    const made = await ask("make", noteId, how, async () => true);
    if (made !== true) return false;
    forget();
    await client.invalidateQueries({ queryKey: ["notes"] });
    return true;
  }

  /** Fetches the recording and keeps it ready to play. True when there is one. */
  async function listen(noteId: string): Promise<boolean> {
    const blob = await ask("listen", noteId, undefined, (response) => response.blob());
    if (blob === null) return false;
    forget();
    audioUrl.value = URL.createObjectURL(blob);
    return true;
  }

  return { busy, problem, audioUrl, estimate, make, listen, forget };
}

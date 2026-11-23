import type { AskTurnBody } from "@edge-shared/agent/askContract";
import { supabase } from "@/lib/supabase";

/** Sends one turn and hands back the raw response. The seam a test replaces; the default talks to `ask-turn`. */
export type AskTransport = (body: AskTurnBody, signal: AbortSignal) => Promise<Response>;

export const sendToAskTurn: AskTransport = async (body, signal) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session === null) throw new Error("Not signed in.");
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
};

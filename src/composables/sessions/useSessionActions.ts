import { useCampaignSession, type StartSessionOptions } from "@/composables/campaign/useCampaignSession";
import { useToast } from "@/composables/useToast";

/**
 * Start and end the live session with the toasts every surface shows for it.
 * The chrome control, the Sessions page, the dashboard widget and the "Still
 * playing?" prompt all start and end the same session; the wording lives here so they cannot disagree.
 */
export function useSessionActions() {
  const toast = useToast();
  const live = useCampaignSession();

  async function startSession(options: StartSessionOptions): Promise<boolean> {
    try {
      await live.start(options);
      return true;
    } catch (cause) {
      // PostgREST errors are plain objects; fromError keeps the sentences the
      // RPCs raise for the DM ("Only the most recent session can be continued").
      toast.error(toast.fromError(cause, "The session could not be started"));
      return false;
    }
  }

  async function endSession(): Promise<boolean> {
    const endedId = live.session.value?.id ?? null;
    try {
      await live.end();
      // Ending is one click, so it is one click to take back (#1058): Undo
      // continues the same session rather than starting a second one. Ending
      // stops nothing else: quests keep their cursor and a running fight stays
      // live until the DM presses End combat.
      toast.success(
        "Session ended.",
        undefined,
        endedId ? { action: { label: "Undo", run: () => void startSession({ continueId: endedId }) } } : undefined,
      );
      return true;
    } catch (cause) {
      toast.error(toast.fromError(cause, "The session could not be ended"));
      return false;
    }
  }

  return { ...live, startSession, endSession };
}

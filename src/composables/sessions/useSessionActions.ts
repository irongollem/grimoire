import { useCampaignSession, type StartSessionOptions } from "@/composables/campaign/useCampaignSession";
import { useToast } from "@/composables/useToast";
import { sessionEndedMessage } from "@/lib/sessions/sessionLog";

/**
 * Start and end the live session with the toasts every surface shows for it.
 * The chrome control, the Sessions page, the dashboard widget and the "Still
 * playing?" prompt all start and end the same session; the wording of "what
 * ending it did" lives here so they cannot disagree.
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
      const closed = await live.end();
      // Ending is one click, so it is one click to take back (#1058): Undo
      // continues the same session rather than starting a second one. What
      // ending stopped (combat, open chains) stays stopped, as it would after
      // any Continue.
      toast.success(
        sessionEndedMessage(closed),
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

import { useCampaignSession, type StartSessionOptions } from "@/composables/campaign/useCampaignSession";
import { useToast } from "@/composables/useToast";
import { sessionEndedMessage } from "@/lib/sessions/sessionLog";

/**
 * Start and end the live session with the toasts every surface shows for it.
 * The chrome control, the Sessions page and the dashboard widget all start and
 * end the same session; the wording of "what ending it did" lives here so they
 * cannot disagree.
 */
export function useSessionActions() {
  const toast = useToast();
  const live = useCampaignSession();

  async function startSession(options: StartSessionOptions): Promise<boolean> {
    try {
      await live.start(options);
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The session could not be started");
      return false;
    }
  }

  async function endSession(): Promise<boolean> {
    try {
      toast.success(sessionEndedMessage(await live.end()));
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The session could not be ended");
      return false;
    }
  }

  return { ...live, startSession, endSession };
}

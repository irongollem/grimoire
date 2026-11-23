import { typeChoices } from "@/lib/worldLinks/connections";
import { useCreateConnection } from "@/composables/connections/useConnections";
import { toast } from "@/lib/toast";

/**
 * Every "becomes" in the canon writes a `led_to` link from the old entry to the new one (#1258 item 18), beside the
 * `became_entry_id` pointer: a secret made a truth, a question answered as a truth or as a secret to uncover. The
 * pointer says what it became; the link is what the Connections block, the web and a backstory's threads read.
 * A failed link never undoes the new entry or the pointer: a toast says so and nothing else is touched.
 */
export function useLinkBecame() {
  const { mutateAsync: connect } = useCreateConnection();

  async function linkBecame(from: { id: string }, to: { id: string; title: string }): Promise<void> {
    const choice = typeChoices("canon", "canon").find((c) => c.key === "led_to" && c.subjectIsFrom);
    if (!choice) throw new Error("the catalogue has no canon-to-canon led_to tie");
    try {
      await connect({ subject: { kind: "canon", id: from.id }, other: { kind: "canon", id: to.id, name: to.title }, choice });
    } catch (e) {
      toast.error(`It was made, but the link to it could not be saved: ${toast.fromError(e)}`);
    }
  }

  return linkBecame;
}

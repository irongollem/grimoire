/**
 * Writes the ties a generator was asked to make with the record it created (the maintainer's rule: any sort of
 * linking must be possible from the generators; #1253). The generator's own page and Ask Grimoire call this one
 * function, so they cannot write different rows.
 *
 * Each tie goes through `useCreateConnectionInCampaign`, the mutation the Connections block's Add dialog uses, so a
 * membership, a home or a patron deity lands in its own record and a plain link in `world_links`, in the direction
 * the choice stores (`subjectIsFrom`). It never throws: the record is already saved, and a failed tie must not lose
 * it. A failure is returned as a sentence and the rest are still written. The campaign comes in as an argument so a
 * run that outlives the DM's navigation writes into the campaign it started in.
 */
import { useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { useToast } from "@/composables/useToast";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import type { WorldRef } from "@/types/connections.types";

export function useApplyGeneratorLinks() {
  const { mutateAsync: createConnection } = useCreateConnectionInCampaign();
  const toast = useToast();

  /** Returns what failed, one sentence per tie ("Auril: ..."); an empty list means every tie was written. */
  async function applyGeneratorLinks(subject: WorldRef, links: readonly GeneratorLink[], campaignId: string): Promise<string[]> {
    const errors: string[] = [];
    for (const link of links) {
      try {
        await createConnection({
          input: { subject, other: { kind: link.kind, id: link.id, name: link.name }, choice: link.choice },
          campaignId,
        });
      } catch (error: unknown) {
        errors.push(`${link.name}: ${toast.fromError(error)}`);
      }
    }
    return errors;
  }

  return { applyGeneratorLinks };
}

<template>
  <section
    v-if="requests.length > 0"
    class="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden"
    aria-labelledby="family-requests-heading"
  >
    <header class="px-4 py-3 border-b border-primary/20">
      <h2 id="family-requests-heading" class="font-cinzel text-sm font-bold text-foreground tracking-wide">
        Waiting on you
      </h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Nobody joins a table with a young player until their parent says yes.
      </p>
    </header>

    <ul class="divide-y divide-primary/15">
      <li v-for="request in requests" :key="request.requestId" class="p-4 space-y-3" data-testid="family-request">
        <p class="text-body text-foreground leading-relaxed">
          <template v-if="request.kind === 'child_joining'">
            <strong>{{ request.joinerName }}</strong> wants to join <strong>{{ request.campaignName }}</strong>,
            run by {{ request.dmName }}.
          </template>
          <template v-else>
            <strong>{{ request.joinerName }}</strong> wants to join {{ request.dmName }}'s campaign
            <strong>{{ request.campaignName }}</strong>.
            <span v-if="request.joinerIsYoungPlayer" class="text-muted-foreground">
              {{ request.joinerName }} is a young player too.
            </span>
          </template>
        </p>

        <p v-if="request.waitingOnOtherParent" class="text-body text-muted-foreground italic" data-testid="waiting">
          You said yes. Waiting for the other parent.
        </p>
        <div v-else class="flex flex-wrap gap-2">
          <AppButton
            variant="primary"
            size="sm"
            :icon="IconCheck"
            label="Approve"
            :loading="isDeciding(request.requestId)"
            :disabled="deciding !== null"
            @click="decide(request, true)"
          />
          <AppButton
            variant="outline"
            size="sm"
            :icon="IconClose"
            label="Decline"
            :disabled="deciding !== null"
            @click="decide(request, false)"
          />
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * The join requests waiting on the signed-in parent (#927), at the top of the
 * Family page. Renders nothing when there are none. Each request reads as a
 * sentence about real people, since the parent is deciding who their child
 * plays with; the two kinds differ in who is being asked about.
 */
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import {
  decisionMessage,
  familyCampaignErrorMessage,
  useDecideJoinRequest,
  type FamilyJoinRequest,
} from "@/composables/account/useFamilyCampaigns";
import { IconCheck, IconClose } from "@/lib/icons";

defineProps<{ requests: FamilyJoinRequest[] }>();

const { confirm } = useConfirm();
const toast = useToast();
const decideRequest = useDecideJoinRequest();

/** The request being decided, so only its own button spins and no second
 *  decision can start while one is in flight. */
const deciding = ref<string | null>(null);

function isDeciding(requestId: string) {
  return deciding.value === requestId;
}

async function decide(request: FamilyJoinRequest, approve: boolean) {
  if (!approve) {
    const ok = await confirm(
      `${request.joinerName} won't be added to ${request.campaignName}. They can ask again with the invite link.`,
      { title: "Decline this request?", confirmLabel: "Decline", danger: true },
    );
    if (!ok) return;
  }
  deciding.value = request.requestId;
  try {
    const decision = await decideRequest.mutateAsync({ requestId: request.requestId, approve });
    const message = decisionMessage(decision, request);
    if (decision === "joined") toast.success(message);
    else toast.info(message);
  } catch (err) {
    toast.error(familyCampaignErrorMessage(err));
  } finally {
    deciding.value = null;
  }
}
</script>

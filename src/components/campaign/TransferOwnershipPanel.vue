<template>
  <div class="border border-border rounded-lg p-5 space-y-4">
    <p class="text-label-lg font-semibold text-foreground">TRANSFER OWNERSHIP</p>

    <p class="text-body text-muted-foreground">
      Hand <span class="text-foreground font-semibold">{{ campaign?.name }}</span> to
      another member. They become the Dungeon Master and you lose DM access — there
      is no undo, and only they can hand it back.
    </p>

    <!-- Nobody to hand it to -->
    <div
      v-if="!candidates.length"
      class="rounded-md border border-dashed border-border px-3 py-4 text-center"
    >
      <p class="text-body text-muted-foreground italic">
        A campaign can only be handed to someone who has already joined it. Invite
        the new DM from the Members &amp; Invites tab first.
      </p>
    </div>

    <template v-else>
      <div class="space-y-2">
        <label class="text-eyebrow font-semibold text-muted-foreground block">NEW DUNGEON MASTER</label>
        <EntityCombobox
          v-model="newOwnerId"
          :options="candidates"
          placeholder="Choose a member…"
        />
      </div>

      <div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1.5">
        <p class="text-caption text-amber-700 dark:text-amber-400 font-semibold">
          What moves with the campaign
        </p>
        <p class="text-caption text-muted-foreground">
          Every note, NPC, quest, location, item, encounter, faction, sound and
          campaign-scoped homebrew, plus the monsters, traps, backgrounds and
          Scriptorium handouts this campaign uses — those are copied into their
          library, so yours keeps its own.
        </p>
        <p class="text-caption text-muted-foreground">
          Staying with you: your AI provider keys (cleared from the campaign), your
          chat messages, your private entity notes, your credit history and minis,
          and your Cartographer maps — locations lose their “open in Cartographer”
          link.
        </p>
      </div>

      <label class="flex items-start gap-2.5 cursor-pointer group">
        <input
          v-model="leaveCampaign"
          type="checkbox"
          class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
        />
        <div>
          <span class="text-body text-foreground group-hover:text-primary transition-colors">
            Leave the campaign as well
          </span>
          <p class="text-caption text-muted-foreground italic">
            Unchecked, you stay on as a player and the new DM can assign you a
            character. Checked, your membership is removed and you would need a new
            invite to come back.
          </p>
        </div>
      </label>

      <ConfirmByNameInput
        v-model="confirmInput"
        :name="campaign?.name ?? ''"
        accent="primary"
      />

      <button
        type="button"
        :disabled="!canTransfer || isTransferring"
        class="w-full px-4 py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-30 transition-opacity"
        @click="doTransfer"
      >
        {{ isTransferring ? "Transferring…" : "Transfer Campaign" }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useCampaigns, useTransferCampaignOwnership } from "@/composables/useCampaigns";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ConfirmByNameInput from "@/components/common/ConfirmByNameInput.vue";

const campaignStore = useCampaignStore();
const auth = useAuthStore();
const router = useRouter();

const { data: campaignList, refetch: refetchCampaigns } = useCampaigns();
const membersQuery = useCampaignMembers();
const { mutateAsync: transferOwnership, isPending: isTransferring } =
  useTransferCampaignOwnership();

const campaign = computed(() => campaignStore.activeCampaign);

const newOwnerId = ref("");
const leaveCampaign = ref(false);
const confirmInput = ref("");

// Everyone but the current DM. The RPC re-checks membership server-side; this is
// only about not offering a choice that would be rejected.
const candidates = computed(() =>
  (membersQuery.data.value ?? [])
    .filter((m) => m.role !== "dm")
    .map((m) => ({ id: m.user_id, name: m.display_name || "(unnamed player)" })),
);

const canTransfer = computed(
  () =>
    !!campaign.value &&
    !!newOwnerId.value &&
    confirmInput.value === campaign.value.name,
);

async function doTransfer() {
  if (!campaign.value || !canTransfer.value) return;
  const campaignId = campaign.value.id;
  const left = leaveCampaign.value;

  await transferOwnership({
    campaignId,
    newOwnerId: newOwnerId.value,
    leaveCampaign: left,
  });

  // The role this session is running as just changed underneath us; the router
  // guard reads it, so it has to be refreshed before we navigate anywhere.
  await auth.refreshMembership(left ? undefined : campaignId);
  const { data: fresh } = await refetchCampaigns();

  if (left) {
    // No longer a member — the campaign is gone from `fresh`. Fall back to
    // whatever else they run, or to no active campaign at all.
    const remaining = (fresh ?? []).filter((c) => c.id !== campaignId);
    if (remaining.length > 0) {
      campaignStore.switchToCampaign(remaining[0]);
    } else {
      campaignStore.clearActiveCampaign();
    }
    router.push("/dashboard");
    return;
  }

  // Still in the campaign, now as a player. Re-seat the store on the freshly
  // read row so the stale owner id and the decrypted AI keys (cleared by the
  // transfer) do not linger, then hand over to the player portal.
  const updated =
    (fresh ?? campaignList.value ?? []).find((c) => c.id === campaignId) ?? null;
  if (updated) campaignStore.switchToCampaign(updated);
  router.push("/play");
}
</script>

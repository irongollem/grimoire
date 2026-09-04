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
          campaign-scoped homebrew, plus whatever this campaign's encounters and
          quests use from your cross-campaign library — monsters, traps, items,
          NPCs, factions, locations, backgrounds and Scriptorium handouts. Those
          are copied into their library, so yours keeps its own.
        </p>
        <p class="text-caption text-muted-foreground">
          Staying with you: your AI provider keys (cleared from the campaign), your
          chat messages, your private entity notes, your credit history and minis,
          and your Cartographer maps — locations lose their “open in Cartographer”
          link.
        </p>
      </div>

      <div
        v-if="isCheckingScopedCopies"
        class="rounded-md border border-border px-3 py-2.5"
      >
        <p class="text-caption text-muted-foreground italic">
          Checking for campaign-only monsters and traps…
        </p>
      </div>

      <div
        v-else-if="scopedCopiesError"
        class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5"
      >
        <p class="text-caption text-destructive">
          Campaign-only monsters and traps could not be checked. Reload this page
          before transferring so none of your authored work is left hidden.
        </p>
      </div>

      <div
        v-else-if="hasScopedCopies"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-2.5"
      >
        <p class="text-caption text-amber-700 dark:text-amber-400">
          This campaign has <span class="font-semibold">{{ scopedCopiesSummary }}</span>
          scoped exclusively to it. Copies move to the new DM. Choose what happens
          to your originals:
        </p>
        <div class="space-y-2">
          <label class="flex items-start gap-2.5 cursor-pointer group">
            <input
              v-model="scopedCopyDisposition"
              type="radio"
              value="promote"
              class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
            />
            <div>
              <span class="text-body text-foreground group-hover:text-primary transition-colors">
                Keep in my library
              </span>
              <p class="text-caption text-muted-foreground italic">
                Your originals become available in all your other campaigns.
              </p>
            </div>
          </label>
          <label
            v-if="otherOwnedCampaigns.length"
            class="flex items-start gap-2.5 cursor-pointer group"
          >
            <input
              v-model="scopedCopyDisposition"
              type="radio"
              value="reassign"
              class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
            />
            <div>
              <span class="text-body text-foreground group-hover:text-primary transition-colors">
                Move to another campaign
              </span>
              <p class="text-caption text-muted-foreground italic">
                Your originals become scoped to one campaign you keep — pick which.
              </p>
            </div>
          </label>
          <div v-if="scopedCopyDisposition === 'reassign'" class="pl-6">
            <EntityCombobox
              v-model="reassignCampaignId"
              :options="otherOwnedCampaigns"
              placeholder="Choose a campaign…"
            />
          </div>
          <label class="flex items-start gap-2.5 cursor-pointer group">
            <input
              v-model="scopedCopyDisposition"
              type="radio"
              value="delete"
              class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
            />
            <div>
              <span class="text-body text-foreground group-hover:text-primary transition-colors">
                Remove my originals
              </span>
              <p class="text-caption text-muted-foreground italic">
                The new DM keeps their copies, but these originals are permanently removed from your library.
              </p>
            </div>
          </label>
        </div>
      </div>

      <AppCheckbox
        v-model="leaveCampaign"
        size="sm"
        label="Leave the campaign as well"
        hint="Unchecked, you stay on as a player and the new DM can assign you a character. Checked, your membership is removed and you would need a new invite to come back."
        class="gap-2.5 group"
        label-class="group-hover:text-primary transition-colors"
      />

      <ConfirmByNameInput
        v-model="confirmInput"
        :name="campaign?.name ?? ''"
        accent="primary"
      />

      <AppButton
        variant="primary"
        size="md"
        block
        :label="isTransferring ? 'Transferring…' : 'Transfer Campaign'"
        :disabled="!canTransfer || isTransferring"
        @click="doTransfer"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useModeSwitch } from "@/composables/useModeSwitch";
import {
  useDmCampaigns,
  useCampaignScopedHomebrewCounts,
  useTransferCampaignOwnership,
} from "@/composables/campaign/useCampaigns";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import {
  EMPTY_HOMEBREW_COUNTS,
  type TransferScopedDisposition,
} from "@/lib/campaign/campaignHomebrewDisposition";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ConfirmByNameInput from "@/components/common/ConfirmByNameInput.vue";
import AppButton from "@/components/common/AppButton.vue";

const campaignStore = useCampaignStore();
const auth = useAuthStore();
const router = useRouter();
const { switchMode } = useModeSwitch();

const { data: campaignList, refetch: refetchCampaigns } = useDmCampaigns();
const membersQuery = useCampaignMembers();
const { mutateAsync: transferOwnership, isPending: isTransferring } =
  useTransferCampaignOwnership();

const campaign = computed(() => campaignStore.activeCampaign);

const newOwnerId = ref("");
const leaveCampaign = ref(false);
const confirmInput = ref("");
const scopedCopyDisposition = ref<TransferScopedDisposition | null>(null);
const reassignCampaignId = ref("");

const campaignId = computed(() => campaign.value?.id ?? null);
const {
  data: scopedHomebrewCounts,
  isPending: isCheckingScopedCopies,
  isError: scopedCopiesError,
} = useCampaignScopedHomebrewCounts(() => campaignId.value);
const scopedCounts = computed(
  () => scopedHomebrewCounts.value ?? EMPTY_HOMEBREW_COUNTS,
);
const scopedCopyCount = computed(
  () => scopedCounts.value.monsters + scopedCounts.value.traps,
);
const hasScopedCopies = computed(() => scopedCopyCount.value > 0);
const scopedCopiesSummary = computed(() => {
  const parts: string[] = [];
  if (scopedCounts.value.monsters > 0) {
    const count = scopedCounts.value.monsters;
    parts.push(`${count} ${count === 1 ? "monster" : "monsters"}`);
  }
  if (scopedCounts.value.traps > 0) {
    const count = scopedCounts.value.traps;
    parts.push(`${count} ${count === 1 ? "trap" : "traps"}`);
  }
  return parts.join(" and ");
});

// Campaign settings can stay mounted while the active campaign changes. Never
// carry a destructive retention choice (or a recipient/confirmation) across
// that boundary; the outgoing DM must choose for the campaign being transferred.
watch(campaignId, () => {
  newOwnerId.value = "";
  leaveCampaign.value = false;
  confirmInput.value = "";
  scopedCopyDisposition.value = null;
  reassignCampaignId.value = "";
});

// Everyone but the current DM. The RPC re-checks membership server-side; this is
// only about not offering a choice that would be rejected.
const candidates = computed(() =>
  (membersQuery.data.value ?? [])
    .filter((m) => m.role !== "dm")
    .map((m) => ({ id: m.user_id, name: m.display_name || "(unnamed player)" })),
);

// Campaigns the outgoing DM could reassign scoped originals into: their own,
// excluding the one being transferred. `campaignList` is already the
// non-archived set (see `fetchCampaigns`), and the RPC re-checks ownership
// server-side — this is only about not offering a target it would reject.
const otherOwnedCampaigns = computed(() =>
  (campaignList.value ?? [])
    .filter((c) => c.user_id === auth.user?.id && c.id !== campaignId.value)
    .map((c) => ({ id: c.id, name: c.name })),
);

const canTransfer = computed(
  () =>
    !!campaign.value &&
    !!newOwnerId.value &&
    !isCheckingScopedCopies.value &&
    !scopedCopiesError.value &&
    (!hasScopedCopies.value || scopedCopyDisposition.value !== null) &&
    (scopedCopyDisposition.value !== "reassign" || !!reassignCampaignId.value) &&
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
    // When no scoped copies exist either disposition is a no-op. Supplying the
    // non-destructive choice keeps the RPC contract explicit for every call.
    scopedCopyDisposition: scopedCopyDisposition.value ?? "promote",
    // Strict RPC contract: null for every disposition except "reassign".
    reassignCampaignId: scopedCopyDisposition.value === "reassign" ? reassignCampaignId.value : null,
  });

  // The role this session is running as just changed underneath us; the router
  // guard reads it, so it has to be refreshed before we navigate anywhere.
  const { data: fresh } = await refetchCampaigns();

  if (left) {
    // No longer a member — the campaign is gone from `fresh`. Fall back to
    // whatever else they run, or to no active campaign at all.
    const remaining = (fresh ?? []).filter(
      (c) => c.id !== campaignId && c.user_id === auth.user?.id,
    );
    if (remaining.length > 0) {
      campaignStore.switchToCampaign(remaining[0]);
      await auth.refreshMembership(remaining[0].id);
      await router.push("/dashboard");
    } else {
      await switchMode("player", { rememberCurrentCampaign: false });
    }
    return;
  }

  // Still in the campaign, now as a player. Re-seat the store on the freshly
  // read row so the stale owner id and the decrypted AI keys (cleared by the
  // transfer) do not linger, then hand over to the player portal.
  const updated =
    (fresh ?? campaignList.value ?? []).find((c) => c.id === campaignId) ?? null;
  // The transferred campaign must not be remembered as a DM campaign: this
  // account no longer owns it. The shared switch also clears stale membership
  // and invalidates mode-sensitive queries before the player route is opened.
  await switchMode("player", {
    navigate: false,
    rememberCurrentCampaign: false,
  });
  if (updated) campaignStore.switchToCampaign(updated);
  await auth.refreshMembership(campaignId);
  await router.push("/play");
}
</script>

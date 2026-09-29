<template>
  <div class="space-y-2" data-testid="child-tables">
    <h4 class="text-body font-semibold text-foreground">Tables</h4>

    <p v-if="campaigns.length === 0" class="text-body text-muted-foreground italic">
      Not at any table yet.
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="campaign in campaigns"
        :key="campaign.campaignId"
        class="rounded-md border border-border bg-muted/20 p-3 space-y-2"
        data-testid="child-table"
      >
        <div>
          <p class="text-body font-semibold text-foreground">{{ campaign.name }}</p>
          <p class="text-caption text-muted-foreground italic">
            {{ campaign.childRunsIt ? "They run this table" : "They play here" }}
          </p>
        </div>

        <ul class="divide-y divide-border/60">
          <li
            v-for="member in campaign.members"
            :key="member.userId"
            class="flex items-center gap-2 py-1.5 min-h-9"
            data-testid="table-member"
          >
            <IconDM v-if="member.isOwner" class="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Runs the campaign" />
            <span class="text-body text-foreground truncate">{{ member.displayName }}</span>
            <span v-if="member.isYou" class="text-caption text-muted-foreground">(you)</span>
            <span
              v-if="member.isYoungPlayer"
              class="text-caption rounded-full border border-border px-2 text-muted-foreground shrink-0"
            >young player</span>
            <AppButton
              v-if="canRemoveMember(campaign, member, childUserId)"
              class="ml-auto"
              variant="ghost"
              size="sm"
              tone="danger"
              :icon="IconRemoveUser"
              :aria-label="`Remove ${member.displayName} from ${campaign.name}`"
              label="Remove"
              @click="remove(campaign, member)"
            />
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * The campaigns one young player is at, and who sits at each table (#927).
 * The Remove button only shows where `remove_from_family_campaign` would
 * allow it; the server checks again, so this is presentation, not the guard.
 */
import AppButton from "@/components/common/AppButton.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import {
  canRemoveMember,
  familyCampaignErrorMessage,
  useRemoveFromFamilyCampaign,
  type FamilyCampaign,
  type FamilyCampaignMember,
} from "@/composables/account/useFamilyCampaigns";
import { IconDM, IconRemoveUser } from "@/lib/icons";

const { childUserId, campaigns } = defineProps<{
  childUserId: string;
  campaigns: FamilyCampaign[];
}>();

const { confirm } = useConfirm();
const toast = useToast();
const removeMember = useRemoveFromFamilyCampaign();

async function remove(campaign: FamilyCampaign, member: FamilyCampaignMember) {
  const ok = await confirm(
    `${member.displayName} will leave ${campaign.name} and lose access to it. Their characters there are detached, not deleted.`,
    { title: `Remove ${member.displayName}?`, confirmLabel: "Remove", danger: true },
  );
  if (!ok) return;
  try {
    await removeMember.mutateAsync({ campaignId: campaign.campaignId, userId: member.userId });
    toast.success(`${member.displayName} was removed from ${campaign.name}.`);
  } catch (err) {
    toast.error(familyCampaignErrorMessage(err, "remove"));
  }
}
</script>

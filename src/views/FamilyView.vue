<template>
  <PageHeader title="Family" description="The young players' accounts you manage">
    <div class="max-w-lg space-y-6">
      <p class="text-body text-muted-foreground leading-relaxed">
        A young player's account is for a player under 16. You manage it: sign-in, password
        and consent. It can't use AI features, buy anything or receive email.
      </p>

      <p v-if="!isLoading && !error && !subscriptionLoading" class="text-body text-muted-foreground leading-relaxed">
        {{ limitsNote }}
      </p>

      <div v-if="isLoading" class="flex justify-center py-8">
        <BannerLoader class="h-10" />
      </div>

      <p v-else-if="error" class="text-body text-destructive">
        Couldn't load your young players' accounts. Please try again.
      </p>

      <template v-else-if="children.length > 0">
        <FamilyRequests :requests="requests" />
        <div class="space-y-4">
          <FamilyChildCard
            v-for="child in children"
            :key="child.child_user_id"
            :child="child"
            :campaigns="tablesByChild.get(child.child_user_id)"
            :tables-failed="tablesError !== null"
            :beyond-cover="isPro && !covered.has(child.child_user_id)"
          />
        </div>
        <AppButton variant="outline" size="md" block :icon="IconAddUser" label="Add a young player" to="/account/family/add" />
      </template>

      <div v-else class="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
        <p class="text-body text-muted-foreground">
          You don't manage any young players' accounts yet.
        </p>
        <AppButton variant="primary" size="md" :icon="IconAddUser" label="Add a young player" to="/account/family/add" />
      </div>

      <p class="text-caption text-muted-foreground italic">
        To add a young player to one of your campaigns, send them an invite link from Campaign
        Settings → Members, and have them open it while signed in to their account. When a young
        player joins someone else's table, or someone joins theirs, you'll be asked here first.
      </p>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
/** The Family page (#919) — a parent's list of the young players' accounts
 *  they manage. Reachable from `/account` in both the DM and player lens. */
import { computed } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import FamilyRequests from "@/components/account/FamilyRequests.vue";
import FamilyChildCard from "@/components/account/FamilyChildCard.vue";
import { useFamily } from "@/composables/account/useFamily";
import { useFamilyCampaigns } from "@/composables/account/useFamilyCampaigns";
import { useSubscription } from "@/composables/billing/useSubscription";
import { inheritingChildIds, INHERITING_CHILD_LIMIT } from "@/lib/childAccount";
import { IconAddUser } from "@/lib/icons";

const { children, isLoading, error } = useFamily();
const { isPro, isLoading: subscriptionLoading } = useSubscription();

// Display only: the database decides the quota (private.effective_quotas), and
// this mirrors its "first five active links" rule so each card can say which side it is on.
const covered = computed(() => inheritingChildIds(children.value));
const limitsNote = computed(() =>
  isPro.value
    ? `Your young players get the same limits as your Pro plan, for up to ${INHERITING_CHILD_LIMIT} accounts.`
    : `Young players' accounts follow the standard limits. With Pro, up to ${INHERITING_CHILD_LIMIT} of them get Pro limits.`,
);
const { requests, tablesByChild, error: tablesError } = useFamilyCampaigns();
</script>

<template>
  <SettingsSection title="Account">
    <!-- A young player's account (#919): no email of its own, and the parent
         manages it rather than it managing itself, so there is no link onward
         — a child never reaches /billing (the router fences it) and the danger
         zone below this section is hidden for the same reason. -->
    <p v-if="emailUnsafe" class="text-body text-foreground">
      Signed in as <span class="font-semibold">{{ childLoginName ?? '…' }}</span>, managed by your parent
    </p>
    <div v-else class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="text-caption text-muted-foreground w-16">Email</span>
        <span class="text-body text-foreground">{{ auth.userEmail ?? '—' }}</span>
      </div>
      <AppButton variant="link" size="inline" :to="linkTo" :label="linkLabel" />
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
/**
 * The "Account" settings block — email plus one link onward. Both surfaces that
 * show it (#631) render the identical email row and differ only in where the
 * link goes: `/account` sends a player to the deletion UI, `/billing` sends a DM
 * on from it. Two copies of this markup is what the second surface started as.
 *
 * `/billing` never renders this for a child (the router fences the route
 * entirely), so the child branch only ever fires on `/account`.
 */
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import SettingsSection from "@/components/common/settings/SettingsSection.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useAuthStore } from "@/stores/auth";
import { useChildAccount } from "@/composables/account/useChildAccount";
import { isUnsafeAccountEmail } from "@/lib/accountLabel";

defineProps<{
  linkTo: RouteLocationRaw;
  linkLabel: string;
}>();

const auth = useAuthStore();
const { link } = useChildAccount();
const childLoginName = computed(() => link.value?.login_name ?? null);
// Checked against the email string itself, not `isChild`: that flag depends
// on the `child_accounts` row finishing its own async load, so it can read
// false for a moment after sign-in even for a child account — during which
// this would otherwise render the internal marker address (#919).
const emailUnsafe = computed(() => isUnsafeAccountEmail(auth.userEmail));
</script>

<template>
  <SettingsSection title="Account">
    <div class="space-y-3">
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
 */
import type { RouteLocationRaw } from "vue-router";
import SettingsSection from "@/components/common/SettingsSection.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useAuthStore } from "@/stores/auth";

defineProps<{
  linkTo: RouteLocationRaw;
  linkLabel: string;
}>();

const auth = useAuthStore();
</script>

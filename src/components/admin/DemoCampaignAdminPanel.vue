<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Demo campaign</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Controls whether new users are offered the published demo campaign.
      </p>
    </div>

    <p v-if="demoStatusQuery.isPending.value" class="text-muted-foreground text-body">Loading…</p>
    <p v-else-if="demoStatusQuery.isError.value" class="text-destructive text-body">
      Failed to load demo status.
    </p>

    <template v-else-if="demoStatus?.published">
      <p class="text-body text-foreground">
        <span class="font-semibold">{{ demoStatus.template_name }}</span>, version {{ demoStatus.version }}
      </p>

      <div :class="setOffered.isPending.value ? 'opacity-60 pointer-events-none' : undefined">
        <SettingsToggleRow
          label="Offered to new users"
          description="While off, only admins see the offer, so you can load and check the demo yourself."
          :model-value="demoStatus.offered"
          @update:model-value="onToggle"
        />
      </div>

      <p v-if="toggleError" class="text-caption text-destructive">{{ toggleError }}</p>
    </template>

    <p v-else class="text-body text-muted-foreground italic">
      No demo published yet. Open the campaign you want to use, go to Campaign Settings → Details, and publish it
      as the demo campaign.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin switch for whether the published demo template is offered to new
 * users (#912). The template itself is published from `DemoCampaignPanel`
 * (Campaign Settings → Details); this panel only controls visibility once
 * one exists, so an admin can keep iterating on the demo without exposing a
 * work-in-progress — `get_demo_status()` already reports `published: true`
 * for an admin whenever a template exists, offered or not.
 */
import { ref } from "vue";
import SettingsToggleRow from "@/components/common/SettingsToggleRow.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useDemoStatus, useSetDemoOffered } from "@/composables/campaign/useDemoCampaign";

const { confirm } = useConfirm();
const toast = useToast();

const demoStatusQuery = useDemoStatus();
const demoStatus = demoStatusQuery.data;
const setOffered = useSetDemoOffered();
const toggleError = ref("");

async function onToggle(next: boolean) {
  if (setOffered.isPending.value) return;
  const message = next
    ? "Every DM who has no demo yet will be offered this campaign."
    : "New users stop seeing the offer. Existing copies are unaffected.";
  const ok = await confirm(message, {
    title: next ? "Offer the demo campaign?" : "Stop offering the demo campaign?",
    confirmLabel: next ? "Offer it" : "Stop offering",
    danger: false,
  });
  if (!ok) return;

  toggleError.value = "";
  try {
    await setOffered.mutateAsync(next);
    toast.success(next ? "Demo campaign is now offered to new users." : "Demo campaign is no longer offered.");
  } catch (e) {
    toggleError.value = toast.fromError(e, "Couldn't update the demo offer.");
    toast.error(toggleError.value);
  }
}
</script>

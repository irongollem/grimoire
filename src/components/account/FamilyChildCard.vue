<template>
  <section class="rounded-lg border border-border bg-card overflow-hidden">
    <header class="px-4 py-3 border-b border-border">
      <h3 class="font-cinzel text-sm font-bold text-foreground tracking-wide">{{ child.displayName }}</h3>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Signs in as <span class="text-foreground not-italic">{{ child.login_name }}</span>
      </p>
    </header>

    <div class="p-4 space-y-4">
      <p class="text-body text-muted-foreground">
        Becomes their own account on <span class="text-foreground">{{ becomesOwnOn }}</span>.
      </p>

      <div class="flex flex-wrap gap-2">
        <AppButton variant="outline" size="sm" :icon="IconKey" label="Reset password" @click="showReset = true" />
        <AppButton
          variant="outline"
          size="sm"
          :icon="IconDownload"
          :loading="exporting"
          label="Download their data"
          @click="handleExport"
        />
        <AppButton
          variant="destructive"
          size="sm"
          :icon="IconDelete"
          label="Delete account"
          @click="showDelete = true"
        />
      </div>
      <p v-if="exportError" class="text-caption text-destructive">{{ exportError }}</p>
    </div>
  </section>

  <ResetChildPasswordDialog v-model="showReset" :child="child" />
  <DeleteChildAccountDialog v-model="showDelete" :child="child" />
</template>

<script setup lang="ts">
/**
 * One young player's account on the Family page (#919) — the display name,
 * login name, when the account becomes theirs, and the three things a parent
 * can do to it. Its own component per the component-granularity rule: a list
 * of these is a `v-for` over a card, not a combined block in `FamilyView`.
 */
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import ResetChildPasswordDialog from "@/components/account/ResetChildPasswordDialog.vue";
import DeleteChildAccountDialog from "@/components/account/DeleteChildAccountDialog.vue";
import { useDataExport } from "@/composables/account/useDataExport";
import { formatAdultOn, type FamilyChild } from "@/composables/account/useFamily";
import { IconDelete, IconDownload, IconKey } from "@/lib/icons";

const { child } = defineProps<{ child: FamilyChild }>();

const becomesOwnOn = formatAdultOn(child.adult_on);

const { exporting, error: exportError, exportData } = useDataExport();
function handleExport() {
  return exportData(child.child_user_id, child.login_name);
}

const showReset = ref(false);
const showDelete = ref(false);
</script>

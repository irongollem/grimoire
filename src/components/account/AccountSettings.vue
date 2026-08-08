<template>
  <SettingsSection title="Account">
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="text-caption text-muted-foreground w-16">Email</span>
        <span class="text-body text-foreground">{{ auth.userEmail ?? '—' }}</span>
      </div>
      <RouterLink
        to="/billing"
        class="inline-block text-label font-semibold text-primary hover:opacity-80 transition-opacity"
      >
        Billing & Subscription →
      </RouterLink>
    </div>
  </SettingsSection>

  <!-- Danger zone (#631) — same accent-recoloured section shell as PlayerSettingsInstall,
       since SettingsSection has no accent prop. -->
  <section class="rounded-lg border border-destructive/40 bg-destructive/5 overflow-hidden">
    <header class="px-4 py-3 border-b border-destructive/20">
      <h3 class="font-cinzel text-sm font-bold text-destructive tracking-wide">Delete Account</h3>
      <p class="text-caption text-muted-foreground italic mt-0.5">Permanent — there is no undo.</p>
    </header>
    <div class="p-4 space-y-4">
      <p class="text-body text-muted-foreground">
        Campaigns you own — and everything in them — are deleted, and your players lose access.
        Content you created in other people's campaigns is removed. Billing records are kept in
        anonymized form, as legally required. If you want your campaigns to live on, transfer
        ownership first.
      </p>
      <ConfirmByNameInput v-model="deleteConfirmInput" name="DELETE" :disabled="deleting" />
      <AppButton
        variant="destructive"
        size="md"
        block
        label="Delete account"
        :loading="deleting"
        :disabled="deleteConfirmInput !== 'DELETE'"
        @click="handleDeleteAccount"
      />
      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import ConfirmByNameInput from "@/components/common/ConfirmByNameInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useAuthStore } from "@/stores/auth";
import { useAccountDeletion } from "@/composables/useAccountDeletion";

const auth = useAuthStore();
const { deleting, error, deleteAccount } = useAccountDeletion();

const deleteConfirmInput = ref("");

function handleDeleteAccount() {
  if (deleteConfirmInput.value !== "DELETE") return;
  void deleteAccount();
}
</script>

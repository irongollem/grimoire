<template>
  <SettingsSection title="Account">
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Email</span>
        <span class="font-fell text-sm text-foreground">{{ auth.userEmail ?? '—' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Role</span>
        <span class="text-label-lg px-1.5 py-0.5 rounded bg-primary/15 text-primary">
          {{ auth.currentRole ?? '—' }}
        </span>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import SettingsSection from "@/components/common/SettingsSection.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

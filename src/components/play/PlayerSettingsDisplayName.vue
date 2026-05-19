<template>
  <SettingsSection title="Display Name" description="This is how your DM and party members see you in the campaign. It defaults to your email address.">
    <form class="flex gap-2" @submit.prevent="saveName">
      <input
        v-model="displayName"
        type="text"
        maxlength="60"
        placeholder="Your name…"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        :disabled="savingName || !displayName.trim() || displayName.trim() === currentName"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        <IconCheck v-if="nameSaved" class="h-3.5 w-3.5" />
        <IconSave v-else class="h-3.5 w-3.5" />
        {{ nameSaved ? "Saved" : "Save" }}
      </button>
    </form>
    <p v-if="nameError" class="font-fell text-xs text-destructive mt-2">{{ nameError }}</p>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import { IconCheck, IconSave } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

const auth = useAuthStore();

const currentName = computed(() => auth.membership?.display_name ?? "");
const displayName = ref(currentName.value);
const savingName = ref(false);
const nameSaved = ref(false);
const nameError = ref<string | null>(null);

async function saveName() {
  if (!auth.membership?.id || !displayName.value.trim()) return;
  savingName.value = true;
  nameError.value = null;
  nameSaved.value = false;

  const { error: err } = await supabase
    .from("campaign_members")
    .update({ display_name: displayName.value.trim() })
    .eq("id", auth.membership.id);

  savingName.value = false;

  if (err) {
    nameError.value = err.message;
  } else {
    if (auth.membership) auth.membership = { ...auth.membership, display_name: displayName.value.trim() };
    nameSaved.value = true;
    setTimeout(() => { nameSaved.value = false; }, 2000);
  }
}
</script>

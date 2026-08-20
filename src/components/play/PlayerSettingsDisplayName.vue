<template>
  <SettingsSection title="Display Name" description="This is how your DM and party members see you in the campaign. It defaults to your email address.">
    <form class="flex gap-2" @submit.prevent="saveName">
      <AppInput
        v-model="displayName"
        type="text"
        maxlength="60"
        placeholder="Your name…"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        tone="default"
        size="body"
        class="flex-1"
      />
      <AppButton
        type="submit"
        variant="primary"
        size="md"
        :disabled="savingName || !displayName.trim() || displayName.trim() === currentName"
        :icon="nameSaved ? IconCheck : IconSave"
        :label="nameSaved ? 'Saved' : 'Save'"
      />
    </form>
    <p v-if="nameError" class="text-caption text-destructive mt-2">{{ nameError }}</p>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
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

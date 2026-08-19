<template>
  <div class="p-3 rounded-md bg-muted/40 border border-border space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-eyebrow font-semibold text-muted-foreground">{{ label }}</span>
      <div class="flex items-center gap-2">
        <span v-if="isSet" class="font-cinzel text-2xs tracking-widest text-emerald-500 uppercase">
          Set · {{ updatedAtLabel }}
        </span>
        <span v-else class="font-cinzel text-2xs tracking-widest text-muted-foreground/60 uppercase">Not configured</span>
        <AppButton
          v-if="isSet"
          variant="destructive"
          size="xs"
          :disabled="clearing"
          :label="clearing ? '…' : 'Clear'"
          @click="doClear"
        />
      </div>
    </div>
    <div class="flex gap-2">
      <div class="relative flex-1">
        <AppInput
          v-model="draft"
          :type="visible ? 'text' : 'password'"
          :placeholder="isSet ? '•••••••• (leave blank to keep current)' : hint"
          class="font-mono pr-9"
          autocomplete="off"
        />
        <AppButton
          type="button"
          variant="ghost"
          size="icon-xs"
          class="absolute right-2 top-1/2 -translate-y-1/2"
          :icon="visible ? IconHide : IconReveal"
          :aria-label="visible ? 'Hide key' : 'Show key'"
          @click="visible = !visible"
        />
      </div>
      <AppButton
        variant="primary"
        size="sm"
        class="shrink-0"
        :disabled="saving || !draft.trim()"
        :label="saving ? 'Saving…' : 'Set Key'"
        @click="save"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconHide, IconReveal } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useAdminKeys } from "@/composables/useAdminKeys";
import type { KeyProvider } from "@/composables/useAdminKeys";

const { provider, label = "Platform API Key", hint = "…" } = defineProps<{
  provider: KeyProvider;
  label?: string;
  hint?: string;
}>();

// Fires after a successful clear — callers with dependent state (e.g.
// Simulacrum's "live" mode requires the meshy key) react to this.
const emit = defineEmits<{ cleared: [] }>();

const { keysQuery, setKey, clearKey } = useAdminKeys();
const row = computed(() => keysQuery.data.value?.find((r) => r.provider === provider) ?? null);
const isSet = computed(() => !!row.value);
const updatedAtLabel = computed(() => row.value ? new Date(row.value.updated_at).toLocaleDateString() : "");

const draft = ref("");
const visible = ref(false);
const saving = ref(false);
const clearing = ref(false);

async function save() {
  const val = draft.value.trim();
  if (!val) return;
  saving.value = true;
  try {
    await setKey.mutateAsync({ provider, plaintext: val });
    draft.value = "";
  } finally {
    saving.value = false;
  }
}

async function doClear() {
  clearing.value = true;
  try {
    await clearKey.mutateAsync(provider);
    emit("cleared");
  } finally {
    clearing.value = false;
  }
}
</script>

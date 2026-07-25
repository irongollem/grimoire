<template>
  <div class="p-3 rounded-md bg-muted/40 border border-border space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-eyebrow font-semibold text-muted-foreground">{{ label }}</span>
      <div class="flex items-center gap-2">
        <span v-if="isSet" class="font-cinzel text-2xs tracking-widest text-emerald-500 uppercase">
          Set · {{ updatedAtLabel }}
        </span>
        <span v-else class="font-cinzel text-2xs tracking-widest text-muted-foreground/60 uppercase">Not configured</span>
        <button
          v-if="isSet"
          class="px-2 py-0.5 text-label font-semibold text-destructive border border-destructive/40 rounded hover:bg-destructive/10 disabled:opacity-50 transition-colors"
          :disabled="clearing"
          @click="doClear"
        >
          {{ clearing ? '…' : 'Clear' }}
        </button>
      </div>
    </div>
    <div class="flex gap-2">
      <div class="relative flex-1">
        <input
          v-model="draft"
          :type="visible ? 'text' : 'password'"
          :placeholder="isSet ? '•••••••• (leave blank to keep current)' : hint"
          class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring pr-9"
          autocomplete="off"
        />
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          @click="visible = !visible"
        >
          <component :is="visible ? IconHide : IconReveal" class="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        class="shrink-0 px-3 py-1.5 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        :disabled="saving || !draft.trim()"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Set Key' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconHide, IconReveal } from "@/lib/icons";
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

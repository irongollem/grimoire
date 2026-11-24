<template>
  <div class="space-y-2" data-testid="beat-canon-secret">
    <div class="space-y-1">
      <span class="block text-caption font-semibold text-foreground">This is the canon secret…</span>
      <EntityCombobox v-model="picked" :options="options" placeholder="Pick a secret from the canon" />
    </div>

    <div v-if="canonSecretId !== null" class="space-y-1.5 border border-border bg-muted/40 p-3" data-testid="beat-canon-secret-words">
      <p class="flex items-center justify-between gap-2 text-eyebrow text-muted-foreground">
        The canon secret
        <span v-if="secret" class="inline-flex items-center gap-1.5 text-label font-bold text-foreground" data-testid="beat-canon-secret-state">
          <span aria-hidden="true">{{ SECRET_STATE_MARK[state] }}</span>
          {{ SECRET_STATE_LABEL[state] }}
        </span>
      </p>
      <p v-if="secret" class="text-body text-foreground" data-testid="beat-canon-secret-statement">{{ secret.title }}</p>
      <p v-else class="text-body text-muted-foreground">This secret is not in the canon any more.</p>
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink v-if="secret" :to="{ path: '/canon', query: { entry: secret.id } }" class="text-label underline">Edit it in the canon</RouterLink>
        <AppButton variant="link" size="inline-caption" label="Not a canon secret" @click="emit('tie', null)" />
      </div>
      <p class="text-caption text-muted-foreground">The beat's own DM lead is kept as it was, and shows again if you untie it.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Where a beat says which canon secret it is (#1255 item 21). A tied beat reads the secret's words in place of its
 * own DM lead (the lead stays in the database), so a secret lives in one place. Saving is the parent's: this only
 * says which secret, or none.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { SECRET_STATE_LABEL, SECRET_STATE_MARK, secretState } from "@/lib/canon/canonSecrets";

const { canonSecretId } = defineProps<{ canonSecretId: string | null }>();
const emit = defineEmits<{ tie: [secretId: string | null] }>();

const { data: entries } = useCanonEntries();
const { data: clues } = useCanonClues();
const secrets = computed(() => (entries.value ?? []).filter((e) => e.part === "secret"));
const options = computed(() => secrets.value.map((s) => ({ id: s.id, name: s.title })));
const secret = computed(() => (canonSecretId === null ? undefined : secrets.value.find((s) => s.id === canonSecretId)));
const state = computed(() => (secret.value ? secretState(secret.value, (clues.value ?? []).filter((c) => c.secret_id === secret.value?.id)) : "hidden"));

// The combobox clears to "" (its x); that is the same as "Not a canon secret".
const picked = computed<string>({
  get: () => canonSecretId ?? "",
  set: (id) => {
    const next = id === "" ? null : id;
    if (next !== canonSecretId) emit("tie", next);
  },
});
</script>

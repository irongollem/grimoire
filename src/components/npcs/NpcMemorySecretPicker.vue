<template>
  <!--
    Names the [secret] block a line discloses (#1053). Kept out of the way: a
    ghost button until asked, and absent altogether in a campaign with no secrets.
  -->
  <div v-if="model" class="flex items-center gap-1.5 text-caption text-muted-foreground" data-testid="npc-memory-secret">
    <NpcMemoryDisclosure :reference="model" :secrets="secrets" :loaded="loaded" class="min-w-0" />
    <AppButton
      variant="ghost"
      size="icon-xs"
      :icon="IconClose"
      label=""
      aria-label="Remove the disclosed secret"
      data-testid="npc-memory-secret-clear"
      @click="model = null"
    />
  </div>
  <div v-else-if="picking" class="flex items-center gap-1.5" data-testid="npc-memory-secret-picker">
    <EntityCombobox
      v-model="chosen"
      :options="options"
      placeholder="Search the secrets in your campaign"
      dropdown-height="lg"
    >
      <template #option="{ opt }">
        <span class="flex min-w-0 flex-col">
          <span class="truncate">{{ opt.excerpt }}</span>
          <span class="text-caption text-muted-foreground">{{ opt.where }}</span>
        </span>
      </template>
    </EntityCombobox>
    <AppButton variant="ghost" size="sm" type="button" label="Never mind" @click="picking = false" />
  </div>
  <AppButton
    v-else-if="secrets.length"
    variant="ghost"
    size="sm"
    type="button"
    :icon="IconSecret"
    label="Discloses a secret…"
    data-testid="npc-memory-secret-open"
    @click="picking = true"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import NpcMemoryDisclosure from "@/components/npcs/NpcMemoryDisclosure.vue";
import { SECRET_ENTITY_LABELS, type SecretRef } from "@/lib/npcs/secretEntityRoute";
import { useCampaignSecrets } from "@/composables/npcs/useCampaignSecrets";
import { IconClose, IconSecret } from "@/lib/icons";

const model = defineModel<SecretRef | null>({ required: true });

const { data, isSuccess } = useCampaignSecrets();
const secrets = computed(() => data.value ?? []);
const loaded = computed(() => isSuccess.value);
const picking = ref(false);

const EXCERPT_MAX = 90;
const options = computed(() =>
  secrets.value.map((s) => {
    const excerpt = s.excerpt.length > EXCERPT_MAX ? `${s.excerpt.slice(0, EXCERPT_MAX).trimEnd()}…` : s.excerpt;
    const where = `${SECRET_ENTITY_LABELS[s.entity_type]} · ${s.entity_name}`;
    // `name` is what the combobox searches, so it carries the whole text and the place.
    return { id: `${s.entity_id}:${s.secret_id}`, name: `${s.excerpt} ${where}`, excerpt, where, secret: s };
  }),
);

// The combobox speaks in ids; picking one turns it into the three columns.
const chosen = computed<string>({
  get: () => "",
  set: (id) => {
    const found = options.value.find((o) => o.id === id);
    if (!found) return;
    model.value = {
      secret_entity_type: found.secret.entity_type,
      secret_entity_id: found.secret.entity_id,
      secret_id: found.secret.secret_id,
    };
    picking.value = false;
  },
});
</script>

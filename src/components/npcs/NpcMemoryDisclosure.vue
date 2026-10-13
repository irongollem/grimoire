<template>
  <!--
    "Discloses: <excerpt> in <entity>" for a memory line (#1053). The excerpt comes
    from the live [secret] block; if the block was deleted the line says so rather
    than keeping a stale quote.
  -->
  <span class="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5" data-testid="npc-memory-disclosure">
    <IconSecret class="h-3 w-3 shrink-0" aria-hidden="true" />
    <span>Discloses</span>
    <span v-if="match" class="min-w-0 truncate italic" :title="match.excerpt">&ldquo;{{ match.excerpt }}&rdquo;</span>
    <span v-else-if="loaded" class="italic">a secret that is no longer there</span>
    <RouterLink
      v-if="entityName"
      :to="route"
      class="font-semibold text-foreground underline-offset-2 hover:underline"
    >{{ entityName }}</RouterLink>
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconSecret } from "@/lib/icons";
import { secretEntityRoute, type SecretRef } from "@/lib/npcs/secretEntityRoute";
import type { CampaignSecret } from "@/types/npcMemory.types";

const { reference, secrets, loaded } = defineProps<{
  reference: SecretRef;
  secrets: readonly CampaignSecret[];
  /** The secrets list has arrived; until then nothing claims the block is gone. */
  loaded: boolean;
}>();

const match = computed(() =>
  secrets.find((s) => s.secret_id === reference.secret_id && s.entity_id === reference.secret_entity_id),
);
const entityName = computed(() => (match.value ? match.value.entity_name : null));
const route = computed(() => secretEntityRoute(reference.secret_entity_type, reference.secret_entity_id));
</script>

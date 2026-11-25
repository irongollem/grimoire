<template>
  <div class="flex flex-wrap items-center gap-2" data-testid="force-who">
    <span class="text-eyebrow text-muted-foreground">Who</span>
    <ul v-if="ties.length > 0" class="flex flex-wrap gap-1.5" data-testid="force-who-list">
      <li v-for="tie in ties" :key="tie.row_id" class="inline-flex items-center gap-1 border border-border bg-muted/40 py-px pr-1 pl-2 text-label text-foreground">
        <RouterLink :to="pathOf(tie)" class="font-semibold hover:underline" data-testid="force-who-name">{{ tie.other_name }}</RouterLink>
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`${tie.other_name} is not behind this`" @click="removeWho(tie)" />
      </li>
    </ul>
    <div class="w-56 max-w-full">
      <EntityCombobox :key="picked" v-model="picked" :options="options" placeholder="Name who is behind it…">
        <template #option="{ opt }">
          <span class="min-w-0 flex-1 truncate">{{ opt.name }}</span>
          <span class="text-caption text-muted-foreground">{{ opt.label }}</span>
        </template>
      </EntityCombobox>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The force's "Who" (#1279 item 11): the people, factions and gods the force is about, each a link to its own page with
 * a button to take it off, and one picker over all three kinds to add another. It writes the canon's `about` link from
 * the force, so the tie is the same one the Connections block would write, and that block hides it (`isWhoTie`).
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useForceWhoTies } from "@/composables/canon/useForceWho";
import { useAllDeities } from "@/composables/deities/useDeities";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { WHO_KIND_LABEL, whoPath, type WhoKind } from "@/lib/canon/forceWho";
import { IconClose } from "@/lib/icons";
import type { Connection } from "@/types/connections.types";

const { forceId } = defineProps<{ forceId: string }>();

const { ties, addWho, removeWho } = useForceWhoTies(() => forceId);
const { data: npcs } = useNpcs();
const { data: factions } = useAllFactions();
const { data: deities } = useAllDeities();

const pathOf = (tie: Connection) => whoPath({ kind: tie.other_kind as WhoKind, id: tie.other_id, name: tie.other_name });

// What can be named: every person, faction and god not already named. The id carries the kind, since three tables share no id space.
const options = computed(() => {
  const named = new Set(ties.value.map((t) => `${t.other_kind}:${t.other_id}`));
  const all: { id: string; name: string; label: string }[] = [
    ...(npcs.value ?? []).map((n) => ({ id: `npc:${n.id}`, name: n.name, label: WHO_KIND_LABEL.npc })),
    ...(factions.value ?? []).map((f) => ({ id: `faction:${f.id}`, name: f.name, label: WHO_KIND_LABEL.faction })),
    ...(deities.value ?? []).map((d) => ({ id: `deity:${d.id}`, name: d.name, label: WHO_KIND_LABEL.deity })),
  ];
  return all.filter((o) => !named.has(o.id));
});

const picked = ref("");
watch(picked, (value) => {
  if (value === "") return;
  const found = options.value.find((o) => o.id === value);
  picked.value = "";
  if (found === undefined) return;
  const [kind, id] = found.id.split(":") as [WhoKind, string];
  void addWho({ kind, id, name: found.name });
});
</script>

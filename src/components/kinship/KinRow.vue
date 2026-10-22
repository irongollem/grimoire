<template>
  <li class="flex items-center gap-3 py-1.5" :data-dead="row.person.dead || undefined">
    <span
      class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-muted text-body font-bold text-muted-foreground"
      :class="[row.person.isPc ? 'border-primary ring-1 ring-primary' : 'border-border', row.person.dead && 'opacity-60']"
      aria-hidden="true"
    >
      <img v-if="row.person.portraitUrl" :src="row.person.portraitUrl" alt="" class="size-full object-cover" loading="lazy" />
      <template v-else>{{ initial }}</template>
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <button
        v-if="peekable"
        type="button"
        class="truncate text-left text-body font-bold hover:text-primary"
        :class="row.person.dead ? 'text-muted-foreground line-through decoration-1' : 'text-foreground'"
        @click="peek(parsePersonKey(row.key).id)"
      >{{ row.person.name }}</button>
      <component
        :is="row.person.to ? RouterLink : 'span'"
        v-else
        v-bind="row.person.to ? { to: row.person.to } : {}"
        class="truncate text-body font-bold"
        :class="[row.person.dead ? 'text-muted-foreground line-through decoration-1' : 'text-foreground', row.person.to && 'hover:text-primary']"
      >{{ row.person.name }}</component>
      <span class="flex flex-wrap items-center gap-x-1 text-caption italic text-muted-foreground">
        <span>{{ row.meta.join(" · ") }}</span>
        <template v-if="row.door">
          <span aria-hidden="true">·</span>
          <RouterLink :to="doorTo" class="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:opacity-80">
            {{ row.door }} kin
            <IconChevronRight class="size-3" aria-hidden="true" />
          </RouterLink>
        </template>
      </span>
    </span>
    <OverflowMenu
      v-if="row.link && !player"
      :label="`More actions for ${row.person.name}`"
      :items="MENU"
      size="icon-sm"
      @select="emit('remove', row)"
    />
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { IconChevronRight } from "@/lib/icons";
import { parsePersonKey } from "@/lib/kinship/keys";
import { useOpenNpc } from "@/composables/npcs/useNpcPeek";
import type { FamilyRow } from "@/components/kinship/familyRows";

const { row, player = false } = defineProps<{ row: FamilyRow; player?: boolean }>();
const emit = defineEmits<{ remove: [row: FamilyRow] }>();

const MENU: OverflowMenuEntry[] = [{ key: "remove", label: "Remove link", danger: true }];

const peek = useOpenNpc();
// The DM opens an NPC relative's sheet in place (in the NPC modal, with a way back); a PC still opens its page.
const peekable = computed(() => !player && row.key.startsWith("npc:"));

const initial = computed(() => row.person.name.trim().charAt(0).toUpperCase() || "?");
// The door re-centres the tree on the spouse: their own family, not ours.
const doorTo = computed(() => (player ? `/play/family/${row.key}` : `/family/${row.key}`));
</script>

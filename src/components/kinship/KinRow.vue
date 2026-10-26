<template>
  <li :data-dead="row.person.dead || undefined">
    <ConnectionSlip
      :name="row.person.name"
      :image="row.person.portraitUrl"
      :to="peekable ? null : row.person.to"
      :opens="peekable"
      :pc="row.person.isPc"
      :dead="row.person.dead"
      :meta="row.meta.join(' · ')"
      @open="peek(parsePersonKey(row.key).id)"
    >
      <template #tags>
        <KinRelationPicker v-if="picker" :row="row" :kin="picker.kin" :bonds="picker.bonds" @kin="(o) => emit('retype-kin', row, o)" @bond="(c) => emit('retype-bond', row, c)" />
        <span v-else class="rounded bg-muted px-1.5 py-0.5 text-label font-semibold text-muted-foreground" data-testid="kin-word-static">{{ row.word }}</span>
      </template>
      <template v-if="row.door" #meta>
        <span v-if="row.meta.length" aria-hidden="true">·</span>
        <RouterLink :to="doorTo" class="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:opacity-80">
          {{ row.door }} kin
          <IconChevronRight class="size-3" aria-hidden="true" />
        </RouterLink>
      </template>
      <template v-if="row.link && !player" #actions>
        <OverflowMenu
          variant="ghost"
          :label="`More actions for ${row.person.name}`"
          :items="MENU"
          size="icon-sm"
          @select="emit('remove', row)"
        />
      </template>
    </ConnectionSlip>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import ConnectionSlip from "@/components/common/entity/ConnectionSlip.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { IconChevronRight } from "@/lib/icons";
import { parsePersonKey } from "@/lib/kinship/keys";
import { useOpenNpc } from "@/composables/npcs/useNpcPeek";
import KinRelationPicker from "@/components/kinship/KinRelationPicker.vue";
import type { FamilyRow, KinOption } from "@/components/kinship/familyRows";
import type { TypeChoice } from "@/lib/worldLinks/connections";

/** `picker` is what the row can be changed to; absent for a player's row and for a derived sibling, which has no link to change. */
const { row, player = false, picker = null } = defineProps<{
  row: FamilyRow;
  player?: boolean;
  picker?: { kin: readonly KinOption[]; bonds: readonly TypeChoice[] } | null;
}>();
const emit = defineEmits<{
  remove: [row: FamilyRow];
  "retype-kin": [row: FamilyRow, option: KinOption];
  "retype-bond": [row: FamilyRow, choice: TypeChoice];
}>();

const MENU: OverflowMenuEntry[] = [{ key: "remove", label: "Remove link", danger: true }];

const peek = useOpenNpc();
// The DM opens an NPC relative's sheet in place (in the NPC modal, with a way back); a PC still opens its page.
const peekable = computed(() => !player && row.key.startsWith("npc:"));

// The door re-centres the tree on the spouse: their own family, not ours.
const doorTo = computed(() => (player ? `/play/family/${row.key}` : `/family/${row.key}`));
</script>

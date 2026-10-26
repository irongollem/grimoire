<template>
  <div class="flex flex-col gap-3">
    <div>
      <p class="text-eyebrow text-muted-foreground">
        Ingredient {{ slot.index + 1 }} of {{ total }}<template v-if="slot.index === 0"> · primary</template>
      </p>
      <h3 :id="titleId" class="text-heading-sm font-bold text-foreground">{{ slot.name }}</h3>
      <p class="text-caption text-muted-foreground">Need {{ slot.needed }}</p>
    </div>

    <p v-if="eligible.length === 0" class="text-body text-foreground">
      You have none. Ask your DM where to find it.
    </p>

    <fieldset v-else class="flex flex-col gap-1.5">
      <legend class="sr-only">Which one is used first</legend>
      <label
        v-for="c in eligible"
        :key="c.inv.id"
        class="flex cursor-pointer items-center gap-2.5 rounded-md border px-2 py-1.5 has-focus-visible:ring-2 has-focus-visible:ring-foreground"
        :class="c.inv.id === current ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-muted/40'"
      >
        <input
          type="radio"
          class="sr-only"
          :name="groupName"
          :value="c.inv.id"
          :checked="c.inv.id === current"
          @change="emit('choose', c.inv.id)"
        />
        <img :src="thumb(c).src" :style="{ filter: thumb(c).filter ?? undefined }" alt="" class="h-10 w-10 shrink-0 object-contain" draggable="false" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-label-lg font-semibold text-foreground">{{ c.inv.name }}</span>
            <QualityBadge :quality="c.inv.quality" size="sm" />
          </span>
          <span class="block text-caption text-muted-foreground">
            {{ c.inv.carried_by === memberId ? `Carried by ${memberName}` : "Party stash" }}
          </span>
        </span>
        <span class="shrink-0 text-label-lg text-foreground">×{{ c.inv.quantity }}</span>
        <IconCheckCircle v-if="c.inv.id === current" class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </label>
      <p class="text-caption text-muted-foreground">If it runs short, the rest comes from your largest other stack.</p>
    </fieldset>

    <div v-if="blocked.length > 0">
      <p class="text-eyebrow text-muted-foreground">Matching, but never used</p>
      <ul class="mt-1 flex flex-col gap-1">
        <li v-for="c in blocked" :key="c.inv.id" class="flex items-baseline justify-between gap-2 text-caption text-muted-foreground">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="truncate">{{ c.inv.name }} ×{{ c.inv.quantity }}</span>
            <QualityBadge :quality="c.inv.quality" size="sm" />
          </span>
          <span class="shrink-0 italic">{{ c.reason ? REASON_WORDS[c.reason] : "" }}</span>
        </li>
      </ul>
    </div>

    <AppButton variant="primary" size="md" block label="Use this" @click="emit('done')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, useId } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import QualityBadge from "@/components/inventory/QualityBadge.vue";
import { IconCheckCircle } from "@/lib/icons";
import type { Ineligibility, IngredientSlot, SlotCandidate } from "@/lib/crafting/ingredients";
import { spriteSrc } from "@/lib/crafting/workbench/art";
import { spriteForItem } from "@/lib/crafting/workbench/materialSprite";
import { firstUsed } from "@/lib/crafting/workbench/slotMaterial";

const { slot, total, chosenId, memberId, memberName, titleId } = defineProps<{
  slot: IngredientSlot;
  total: number;
  /** The row the player chose to use first; absent = the largest stack. */
  chosenId: string | undefined;
  memberId: string;
  memberName: string;
  titleId: string;
}>();

const emit = defineEmits<{ choose: [rowId: string]; done: [] }>();

const REASON_WORDS: Record<Ineligibility, string> = {
  equipped: "equipped",
  container: "in a container",
  ruined: "ruined",
};

const groupName = useId();
const eligible = computed(() => slot.candidates.filter((c) => c.reason === null));
const blocked = computed(() => slot.candidates.filter((c) => c.reason !== null));
const current = computed(() => firstUsed(slot, chosenId)?.inv.id);

function thumb(c: SlotCandidate): { src: string; filter: string | null } {
  const s = spriteForItem(c.item);
  return { src: spriteSrc(s.sprite), filter: s.filter };
}

// Land on the checked option so arrow keys move the choice straight away.
onMounted(() => {
  requestAnimationFrame(() => {
    document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(groupName)}"]:checked`)?.focus();
  });
});
</script>

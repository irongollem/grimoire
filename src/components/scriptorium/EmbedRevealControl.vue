<template>
  <div ref="triggerRef" class="flex w-fit">
    <AppButton
      size="xs"
      variant="ghost"
      fill="muted"
      :icon="isOff ? IconHide : IconReveal"
      icon-size="xs"
      :active="open"
      :disabled="!hasControl"
      :tooltip="summary"
      :aria-label="`What sharing reveals: ${summary}`"
      @click="open = !open"
    />
  </div>

  <!-- Teleported for the same reason EntitySendMenu is: the toolbar sits in the
       editor's scroll panel, and a fixed panel anchored to the trigger's
       viewport rect cannot be clipped by it. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      class="z-300 w-60 rounded-md border border-border bg-popover p-3 shadow-lg"
      role="dialog"
      aria-label="What sharing this handout reveals"
    >
      <p class="text-eyebrow font-bold uppercase text-muted-foreground">
        When shared, reveals
      </p>

      <div v-if="entityType === 'npc'" class="mt-2 flex flex-col gap-1.5">
        <AppCheckbox
          v-for="field in NPC_PLAYER_FIELDS"
          :key="field.key"
          size="sm"
          :label="field.label"
          :disabled="isOff"
          :model-value="npcFields.includes(field.key)"
          @update:model-value="(on: boolean) => setNpcField(field.key, on)"
        />
      </div>

      <AppCheckbox
        v-else-if="entityType === 'monster'"
        class="mt-2"
        size="sm"
        label="Also reveal stats"
        :disabled="isOff"
        :model-value="stats"
        @update:model-value="(on: boolean) => setFlag('stats', on)"
      />

      <AppCheckbox
        v-else-if="entityType === 'location'"
        class="mt-2"
        size="sm"
        label="Also share description"
        :disabled="isOff"
        :model-value="description"
        @update:model-value="(on: boolean) => setFlag('description', on)"
      />

      <p v-else-if="entityType === 'quest'" class="mt-2 text-caption text-muted-foreground">
        The quest starts and its rumour reaches the players.
      </p>

      <div class="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        <AppCheckbox
          size="sm"
          label="Don't reveal"
          :model-value="isOff"
          @update:model-value="(on: boolean) => emitReveal(on ? { off: true } : null)"
        />
        <AppButton
          size="xs"
          variant="ghost"
          fill="muted"
          label="Automatic"
          :disabled="reveal === null"
          tooltip="Go back to the default for this kind of entry"
          @click="emitReveal(null)"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/*
 * Toolbar control for an entityEmbed's `reveal` attribute (#970): what sharing
 * the handout does for this one embed. Edits only the attribute; the effect is
 * applied by `public.share_handout`. Items and spells reveal nothing by design,
 * so there the button is present but inert, and its tooltip says why.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconHide, IconReveal } from "@/lib/icons";
import { NPC_PLAYER_FIELDS, type NpcPlayerFieldKey } from "@/lib/npcDisplay";
import {
  describeEmbedReveal,
  effectiveEmbedReveal,
  embedHasRevealControl,
  type EntityEmbedReveal,
} from "@/lib/scriptorium/embedReveal";
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";

const { entityType, showArt, reveal } = defineProps<{
  entityType: EntityEmbedType;
  showArt: boolean;
  reveal: EntityEmbedReveal | null;
}>();
const emit = defineEmits<{ "update:reveal": [value: EntityEmbedReveal | null] }>();

const subject = computed(() => ({ entityType, showArt, reveal }));
const summary = computed(() => describeEmbedReveal(subject.value));
const effective = computed(() => effectiveEmbedReveal(subject.value));
const hasControl = computed(() => embedHasRevealControl(entityType));
const isOff = computed(() => reveal?.off === true);

const npcFields = computed<NpcPlayerFieldKey[]>(() =>
  effective.value.type === "npc" ? effective.value.fields : [],
);
const stats = computed(() => effective.value.type === "monster" && effective.value.stats);
const description = computed(() => effective.value.type === "location" && effective.value.description);

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function emitReveal(next: EntityEmbedReveal | null) {
  emit("update:reveal", next);
}

function setNpcField(key: NpcPlayerFieldKey, on: boolean) {
  // Kept in the declared field order so the stored list is stable.
  const next = NPC_PLAYER_FIELDS.map((f) => f.key).filter((k) =>
    k === key ? on : npcFields.value.includes(k),
  );
  emitReveal({ fields: next });
}

function setFlag(flag: "stats" | "description", on: boolean) {
  const { off: _off, ...rest } = reveal ?? {};
  emitReveal({ ...rest, [flag]: on });
}
</script>

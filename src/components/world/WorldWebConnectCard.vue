<template>
  <!--
    Connect… (#1084): tap another node, or find anyone, then say what they are to
    each other. It replaces shift-click, which a tablet cannot do.
  -->
  <div class="flex flex-col gap-3 p-4">
    <div class="flex items-start justify-between gap-2">
      <h2 class="text-heading-sm font-bold leading-tight text-foreground">
        Connect {{ fromName }}<template v-if="target"> to {{ target.name }}</template>
      </h2>
      <AppButton variant="ghost" size="icon-sm" :icon="IconClose" label="Cancel connecting" @click="emit('cancel')" />
    </div>

    <template v-if="!target">
      <p class="text-body text-muted-foreground">
        Tap another node on the web, or find someone here.
      </p>
      <WorldEntityPicker :subject="fromRef" @pick="emit('target', $event)" />
    </template>

    <template v-else>
      <p v-if="!choices.length" class="text-body italic text-muted-foreground">
        Nothing in the world ties {{ fromName }} to {{ target.name }}.
      </p>
      <template v-else>
        <p class="text-label-lg font-semibold text-foreground">{{ fromName }} is…</p>
        <WorldWebTypePicker :choices="choices" :busy="busy" @pick="emit('pick', $event)" />
        <p class="text-caption text-muted-foreground">…{{ target.name }}.</p>
      </template>
      <AppButton variant="subtle" size="sm" label="Pick someone else" class="self-start" @click="emit('target', null)" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import WorldEntityPicker from "@/components/common/entity/WorldEntityPicker.vue";
import WorldWebTypePicker from "@/components/world/WorldWebTypePicker.vue";
import { IconClose } from "@/lib/icons";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { isLinkKind, parseNodeKey } from "@/lib/worldWeb/kinds";
import type { WorldRef } from "@/types/connections.types";

const { fromKey, fromName, target = null, busy = false } = defineProps<{
  fromKey: string;
  fromName: string;
  target?: (WorldRef & { name: string }) | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  target: [target: (WorldRef & { name: string }) | null];
  pick: [choice: TypeChoice];
  cancel: [];
}>();

const fromRef = computed<WorldRef | undefined>(() => {
  const ref = parseNodeKey(fromKey);
  return ref && isLinkKind(ref.kind) ? { kind: ref.kind, id: ref.id } : undefined;
});

const choices = computed(() => {
  const from = fromRef.value;
  return from && target ? typeChoices(from.kind, target.kind) : [];
});
</script>

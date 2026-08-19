<template>
  <!--
    Shared portrait-row for a faction member (NPC or party character). Owns the
    avatar + role/status selects + remove button; the differing name and
    subtitle markup are passed via the `name` and `subtitle` slots.
  -->
  <div
    class="flex items-center gap-3 rounded-md border border-border px-3 py-2"
    :class="former ? 'bg-muted/30 opacity-70' : 'bg-card'"
  >
    <div class="h-8 w-8 shrink-0 rounded-full border border-border bg-muted overflow-hidden">
      <FocalImage
        v-if="portraitUrl"
        :src="portraitUrl"
        :focal-point="portraitFocalPoint"
        format="token"
        alt=""
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <component :is="fallbackIcon" class="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
    </div>

    <div class="flex-1 min-w-0">
      <slot name="name" />
      <slot name="subtitle" />
    </div>

    <!-- Role — editable on active rows, read-only on former rows -->
    <AppSelect
      v-if="!readonlyRole"
      v-model="roleModel"
      tone="filled"
      size="xs"
      weight="normal"
      class="text-muted-foreground"
    >
      <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">{{ r }}</option>
    </AppSelect>
    <span v-else class="font-cinzel text-2xs text-muted-foreground shrink-0">{{ role ?? 'Member' }}</span>

    <!-- Status -->
    <AppSelect
      v-model="statusModel"
      tone="filled"
      size="xs"
      weight="normal"
      :style="{ color: NPC_FACTION_STATUS_COLORS[(status ?? 'Active') as NpcFactionStatus] ?? NPC_FACTION_STATUS_COLORS.Active }"
    >
      <option v-for="s in NPC_FACTION_STATUSES" :key="s" :value="s">{{ s }}</option>
    </AppSelect>

    <AppButton
      variant="ghost"
      tone="danger"
      size="inline"
      class="shrink-0"
      @click="emit('remove')"
    >×</AppButton>
  </div>
</template>

<script setup lang="ts">
import { type Component, computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppButton from "@/components/common/AppButton.vue";
import {
  NPC_FACTION_ROLES,
  NPC_FACTION_STATUSES,
  NPC_FACTION_STATUS_COLORS,
  type NpcFactionStatus,
} from "@/types/faction.types";

const { readonlyRole = false, former = false, role, status } = defineProps<{
  portraitUrl: string | null;
  portraitFocalPoint?: { x: number; y: number } | null;
  fallbackIcon: Component;
  role: string | null;
  status: string | null;
  /** When true, the row uses the dimmed "former member" styling. */
  former?: boolean;
  /** When true, the role is shown as read-only text instead of a select. */
  readonlyRole?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:role", value: string): void;
  (e: "update:status", value: string): void;
  (e: "remove"): void;
}>();

// AppSelect requires a genuine v-model; this component only has prop+emit, so
// bridge the two with a local writable computed rather than the old :value/@change pair.
const roleModel = computed({
  get: () => role ?? "Member",
  set: (v: string) => emit("update:role", v),
});
const statusModel = computed({
  get: () => status ?? "Active",
  set: (v: string) => emit("update:status", v),
});
</script>

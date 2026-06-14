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
    <select
      v-if="!readonlyRole"
      :value="role ?? 'Member'"
      class="bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
      @change="emit('update:role', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">{{ r }}</option>
    </select>
    <span v-else class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ role ?? 'Member' }}</span>

    <!-- Status -->
    <select
      :value="status ?? 'Active'"
      class="bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
      :style="{ color: NPC_FACTION_STATUS_COLORS[(status ?? 'Active') as NpcFactionStatus] ?? NPC_FACTION_STATUS_COLORS.Active }"
      @change="emit('update:status', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="s in NPC_FACTION_STATUSES" :key="s" :value="s">{{ s }}</option>
    </select>

    <button
      type="button"
      class="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-base leading-none"
      @click="emit('remove')"
    >×</button>
  </div>
</template>

<script setup lang="ts">
import { type Component } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import {
  NPC_FACTION_ROLES,
  NPC_FACTION_STATUSES,
  NPC_FACTION_STATUS_COLORS,
  type NpcFactionStatus,
} from "@/types/faction.types";

const { readonlyRole = false, former = false } = defineProps<{
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
</script>

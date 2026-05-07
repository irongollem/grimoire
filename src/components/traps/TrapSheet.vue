<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />
        Edit
      </button>
    </div>

    <!-- Identity: image + name / type / CR / tags -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex gap-4">
        <div class="shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
          <FocalImage
            v-if="trap.image_url"
            :src="trap.image_url"
            :alt="trap.name"
            format="portrait"
            :focal-point="trap.image_focal_point ?? null"
            :lightbox="true"
            class="w-full h-full"
          />
          <IconTrap v-else class="h-8 w-8 text-muted-foreground/30" />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <h1 class="font-cinzel text-xl font-bold text-foreground leading-tight">{{ trap.name }}</h1>
          <div class="flex flex-wrap gap-1.5">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5">
              {{ trap.trap_type }}
            </span>
            <span v-if="trap.cr" class="font-cinzel text-[10px] font-semibold tracking-wider bg-primary/10 text-primary rounded px-2 py-0.5">
              CR {{ trap.cr }}
            </span>
            <span v-if="crXp" class="font-cinzel text-[10px] tracking-wider text-muted-foreground rounded px-2 py-0.5">
              {{ crXp }} XP
            </span>
          </div>
          <div v-if="trap.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in trap.tags"
              :key="tag"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Mechanics -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Mechanics</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
          <div v-if="trap.trigger_type">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Trigger</span>
            <p class="font-fell text-sm text-foreground">{{ trap.trigger_type }}</p>
          </div>
          <div v-if="trap.detection_dc">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Detection DC</span>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ trap.detection_dc }}</p>
          </div>
          <div v-if="trap.disarm_dc">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Disarm DC</span>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ trap.disarm_dc }}</p>
          </div>
          <div>
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Reset</span>
            <p class="font-fell text-sm text-foreground">{{ trap.reset_type }}</p>
          </div>
          <div v-if="trap.trap_hp">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">HP</span>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ trap.trap_hp }}</p>
          </div>
          <div v-if="trap.trap_ac">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">AC</span>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ trap.trap_ac }}</p>
          </div>
        </div>
        <div v-if="trap.damage_immunities.length">
          <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Damage Immunities</span>
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="imm in trap.damage_immunities"
              :key="imm"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5 capitalize"
            >{{ imm }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Effect -->
    <div
      v-if="trap.effect_description || trap.attack_bonus != null || (trap.save_type && trap.save_dc) || trap.damage_entries.length"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Effect</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p v-if="trap.effect_description" class="font-fell text-sm text-foreground">{{ trap.effect_description }}</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-if="trap.attack_bonus != null"
            class="font-cinzel text-[11px] font-semibold tracking-wider bg-primary/10 text-primary rounded px-2.5 py-1"
          >
            ATK +{{ trap.attack_bonus }}
          </span>
          <span
            v-if="trap.save_type && trap.save_dc"
            class="font-cinzel text-[11px] font-semibold tracking-wider bg-amber-500/10 text-amber-400 rounded px-2.5 py-1"
          >
            {{ trap.save_type }} Save DC {{ trap.save_dc }}
          </span>
        </div>
        <div v-if="trap.damage_entries.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="(entry, i) in trap.damage_entries"
            :key="i"
            class="font-cinzel text-[11px] font-semibold tracking-wider bg-destructive/10 text-destructive rounded px-2.5 py-1 capitalize"
          >
            {{ entry.dice }}{{ entry.type ? ` ${entry.type}` : "" }}
          </span>
        </div>
      </div>
    </div>

    <!-- Description -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="trap.description" />
      </div>
    </div>

    <!-- DM Notes -->
    <div v-if="hasNotes" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">DM Notes</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="trap.notes" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit, IconTrap } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteTrap } from "@/composables/useTraps";
import { CR_XP } from "@/types/encounter.types";
import type { Trap } from "@/types/trap.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props  = defineProps<{ trap: Trap }>();
const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const deleteMut = useDeleteTrap();

const crXp = computed(() => (props.trap.cr ? CR_XP[props.trap.cr] : null));

function hasContent(field: string | null | undefined): boolean {
  if (!field) return false;
  try {
    const doc = JSON.parse(field);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(field).trim().length > 0;
  }
}

const hasDescription = computed(() => hasContent(props.trap.description));
const hasNotes       = computed(() => hasContent(props.trap.notes));

async function handleDelete() {
  const ok = await confirm(`Delete "${props.trap.name}"? This cannot be undone.`, {
    title: "Delete Trap",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push({ path: "/dungeon-craft", query: { tab: "traps" } });
  await deleteMut.mutateAsync(props.trap);
}
</script>

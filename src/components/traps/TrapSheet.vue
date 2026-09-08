<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <AppButton variant="destructive" size="md" :icon="IconDelete" label="Delete" @click="handleDelete" />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconEdit"
        label="Edit"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      />
    </div>

    <!-- Identity: image + name / type / CR / tags -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex gap-4">
        <div class="shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
          <FocalImage
            :src="trap.image_url"
            :alt="trap.name"
            format="portrait"
            :focal-point="trap.image_focal_point ?? null"
            :lightbox="true"
            placeholder="/assets/placeholders/trap.webp"
            class="w-full h-full"
          />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <h1 class="text-heading-lg font-bold text-foreground leading-tight">{{ trap.name }}</h1>
          <div class="flex flex-wrap gap-1.5">
            <span class="text-label font-semibold bg-muted/60 text-muted-foreground rounded px-2 py-0.5">
              {{ trap.trap_type }}
            </span>
            <span v-if="trap.cr" class="text-label font-semibold bg-primary/10 text-primary rounded px-2 py-0.5">
              CR {{ trap.cr }}
            </span>
            <span v-if="crXp" class="text-label text-muted-foreground rounded px-2 py-0.5">
              {{ crXp }} XP
            </span>
          </div>
          <div v-if="trap.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in trap.tags"
              :key="tag"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Mechanics -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Mechanics</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
          <div v-if="trap.trigger_type">
            <span class="text-eyebrow font-semibold text-muted-foreground">Trigger</span>
            <p class="text-body text-foreground">{{ trap.trigger_type }}</p>
          </div>
          <div v-if="trap.detection_dc">
            <span class="text-eyebrow font-semibold text-muted-foreground">Detection DC</span>
            <p class="text-heading font-bold text-foreground">{{ trap.detection_dc }}</p>
          </div>
          <div v-if="trap.disarm_dc">
            <span class="text-eyebrow font-semibold text-muted-foreground">Disarm DC</span>
            <p class="text-heading font-bold text-foreground">{{ trap.disarm_dc }}</p>
          </div>
          <div>
            <span class="text-eyebrow font-semibold text-muted-foreground">Reset</span>
            <p class="text-body text-foreground">{{ trap.reset_type }}</p>
          </div>
          <div v-if="trap.trap_hp">
            <span class="text-eyebrow font-semibold text-muted-foreground">HP</span>
            <p class="text-heading font-bold text-foreground">{{ trap.trap_hp }}</p>
          </div>
          <div v-if="trap.trap_ac">
            <span class="text-eyebrow font-semibold text-muted-foreground">AC</span>
            <p class="text-heading font-bold text-foreground">{{ trap.trap_ac }}</p>
          </div>
        </div>
        <div v-if="trap.damage_immunities.length">
          <span class="text-eyebrow font-semibold text-muted-foreground">Damage Immunities</span>
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="imm in trap.damage_immunities"
              :key="imm"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5 capitalize"
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
        <span class="text-label-lg font-semibold text-muted-foreground">Effect</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p v-if="trap.effect_description" class="text-body text-foreground">{{ trap.effect_description }}</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-if="trap.attack_bonus != null"
            class="text-label-lg font-semibold bg-primary/10 text-primary rounded px-2.5 py-1"
          >
            ATK +{{ trap.attack_bonus }}
          </span>
          <span
            v-if="trap.save_type && trap.save_dc"
            class="text-label-lg font-semibold bg-amber-500/10 text-amber-400 rounded px-2.5 py-1"
          >
            {{ trap.save_type }} Save DC {{ trap.save_dc }}
          </span>
        </div>
        <div v-if="trap.damage_entries.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="(entry, i) in trap.damage_entries"
            :key="i"
            class="text-label-lg font-semibold bg-destructive/10 text-destructive rounded px-2.5 py-1 capitalize"
          >
            {{ entry.dice }}{{ entry.type ? ` ${entry.type}` : "" }}
          </span>
        </div>
      </div>
    </div>

    <!-- Description -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="trap.description" />
      </div>
    </div>

    <!-- DM Notes -->
    <div v-if="hasNotes" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">DM Notes</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="trap.notes" />
      </div>
    </div>

    <!-- Placed In -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Placed In</span>
      </div>
      <div class="p-4">
        <EntityPlacements kind="trap" :entity-id="trap.id" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteTrap } from "@/composables/dungeon-features/useTraps";
import { CR_XP } from "@/types/encounter.types";
import type { Trap } from "@/types/trap.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityPlacements from "@/components/locations/EntityPlacements.vue";

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

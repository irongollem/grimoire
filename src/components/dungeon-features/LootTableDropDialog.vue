<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      @keydown.esc="emit('close')"
    >
      <div class="absolute inset-0 bg-black/70" @click="emit('close')" />
      <div class="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div class="flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b border-border shrink-0">
          <h2 class="font-cinzel text-sm font-bold tracking-wider text-foreground flex items-center gap-2">
            <IconPackageOpen class="h-4 w-4 text-primary" />
            Drop chest in chat
          </h2>
          <button class="text-muted-foreground hover:text-foreground" @click="emit('close')">
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <div class="overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <!-- How it works -->
          <div class="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex flex-col gap-1">
            <span class="text-eyebrow font-semibold text-muted-foreground">How it works</span>
            <ol class="text-caption text-muted-foreground list-decimal list-inside space-y-0.5 leading-relaxed">
              <li>The table is rolled now — the <strong class="text-foreground">preview</strong> below shows what drops.</li>
              <li><strong class="text-foreground">Claims</strong> sets how many times players can take an item before the chest closes.</li>
              <li>Players click items in the chat chest one at a time; each claim removes one slot.</li>
              <li>The chest closes when claims run out <em>or</em> all items are taken, whichever comes first.</li>
            </ol>
          </div>

          <div class="space-y-1.5">
            <label class="text-eyebrow font-semibold text-muted-foreground">Claims (dice or fixed)</label>
            <input
              :value="claimsDice"
              placeholder="1d4, 2, 1d6+1…"
              class="w-full bg-muted border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="emit('update:claimsDice', ($event.target as HTMLInputElement).value)"
            />
            <p class="text-caption-sm text-muted-foreground italic">
              Fixed number or dice expression. Capped at the number of items that actually rolled.
            </p>
          </div>

          <div class="space-y-1.5">
            <label class="text-eyebrow font-semibold text-muted-foreground">Chest art (optional)</label>
            <div v-if="chestImageUrl" class="relative w-24 h-24 rounded border border-border overflow-hidden bg-muted">
              <FocalImage :src="chestImageUrl" alt="Chest" format="square" />
              <button
                type="button"
                class="absolute top-1 right-1 rounded bg-black/60 text-white p-0.5 hover:bg-black/80"
                @click="emit('update:chestImageUrl', null)"
              >
                <IconClose class="h-3 w-3" />
              </button>
            </div>
            <input
              v-else
              type="file"
              accept="image/*"
              class="text-caption text-muted-foreground"
              @change="onChestFileChange"
            />
            <p v-if="uploadingChestImg" class="text-caption-sm text-muted-foreground italic">Uploading…</p>
          </div>

          <button
            type="button"
            class="self-start text-caption text-muted-foreground hover:text-foreground italic"
            @click="emit('reroll')"
          >
            ↻ re-roll preview
          </button>

          <div class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-1.5">
            <span class="text-eyebrow font-semibold text-muted-foreground">
              Preview ({{ atoms.length }} {{ atoms.length === 1 ? "item" : "items" }})
            </span>
            <ul v-if="atoms.length" class="flex flex-col gap-0.5">
              <li v-for="atom in atoms" :key="atom.atom_id" class="text-body text-foreground truncate">
                <template v-if="(atom.type ?? 'item') === 'item'">· {{ atom.item_name }}</template>
                <template v-else-if="atom.type === 'currency'">
                  💰 {{ atom.currency_label ? atom.currency_label + ': ' : '' }}{{ formatCoinParts(atom.pp ?? 0, atom.gp ?? 0, atom.ep ?? 0, atom.sp ?? 0, atom.cp ?? 0).join(', ') || '0 GP' }}
                </template>
                <template v-else>· {{ atom.item_name }}</template>
              </li>
            </ul>
            <p v-else class="text-caption text-muted-foreground italic">Nothing rolled — chest will be empty.</p>
          </div>

          <!-- Under-delivery warning: entries that hit but produced no loot -->
          <div
            v-if="unresolved.length"
            class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 flex flex-col gap-1.5"
          >
            <span class="text-eyebrow font-semibold text-amber-500 flex items-center gap-1.5">
              <IconWarning class="h-3 w-3" />
              Under-delivered ({{ unresolved.length }})
            </span>
            <ul class="flex flex-col gap-0.5">
              <li v-for="u in unresolved" :key="u.entry_id" class="text-caption text-muted-foreground">
                {{ u.wanted }} — {{ unresolvedReasonLabel(u.reason) }}
              </li>
            </ul>
            <p class="text-caption-sm text-muted-foreground italic">
              These entries hit but had nothing to give. The chest will drop without them.
            </p>
          </div>
        </div>

        <div class="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            class="text-label-lg font-semibold text-muted-foreground hover:text-foreground transition-colors"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="dropping || !atoms.length || effectiveCap === null || effectiveCap <= 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="emit('drop')"
          >
            <IconPackageOpen class="size-3.5" />
            {{ dropping ? "Dropping…" : `Drop chest (${effectiveCap} ${effectiveCap === 1 ? 'claim' : 'claims'})` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IconClose, IconPackageOpen, IconWarning } from '@/lib/icons';
import { formatCoinParts } from '@/lib/currency';
import { useImageUpload } from '@/composables/useImageUpload';
import FocalImage from '@/components/common/FocalImage.vue';
import type { LootChestAtom } from '@/types/chat.types';
import { unresolvedReasonLabel, type RolledUnresolvedEntry } from '@/lib/lootTableRoll';

const {
  open,
  atoms,
  unresolved,
  claimsDice,
  chestImageUrl,
  effectiveCap,
  dropping,
} = defineProps<{
  open: boolean;
  atoms: LootChestAtom[];
  unresolved: RolledUnresolvedEntry[];
  claimsDice: string;
  chestImageUrl: string | null;
  effectiveCap: number | null;
  dropping: boolean;
}>();

const emit = defineEmits<{
  close: [];
  drop: [];
  reroll: [];
  'update:claimsDice': [value: string];
  'update:chestImageUrl': [value: string | null];
}>();

const uploadingChestImg = ref(false);

function onChestFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploadingChestImg.value = true;
  const upload = useImageUpload('loot-images');
  upload.upload(file).then((url) => {
    if (url) emit('update:chestImageUrl', url);
    uploadingChestImg.value = false;
  });
}
</script>

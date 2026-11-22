<template>
  <section class="space-y-4 rounded-lg border border-border bg-card p-4">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-heading-sm font-semibold text-foreground">NPC starter inventory</h2>
        <p class="mt-0.5 text-caption text-muted-foreground">
          Generated NPCs get the first pack that matches their occupation or tags.
          Pack items are added by name. Any item selected with @ is included separately.
        </p>
      </div>
      <AppButton v-if="packs && !draft" label="Edit packs" @click="startEditing" />
    </header>

    <ListSkeleton v-if="packsQuery.isPending.value" variant="rows" :count="3" :columns="1" />
    <div v-else-if="!packs" class="flex flex-wrap items-center gap-2">
      <p role="alert" class="text-body text-destructive">Couldn't load the starter inventory packs.</p>
      <AppButton label="Try again" :loading="packsQuery.isFetching.value" @click="packsQuery.refetch()" />
    </div>

    <dl v-else-if="!draft" class="divide-y divide-border text-caption">
      <div v-for="pack in packs" :key="pack.id" class="grid gap-1 py-2 sm:grid-cols-[minmax(9rem,1fr)_3fr] sm:gap-3">
        <dt class="font-semibold">
          {{ pack.label }}
          <span v-if="pack.id === 'everyday'" class="font-normal text-muted-foreground">(fallback)</span>
        </dt>
        <dd class="text-muted-foreground">{{ pack.items.length ? pack.items.join(", ") : "No items" }}</dd>
      </div>
    </dl>

    <form v-else class="space-y-4" @submit.prevent="save">
      <div class="divide-y divide-border border-y border-border">
        <details
          v-for="(pack, index) in draft"
          :key="pack.id"
          :open="pack.id === newPackId"
          class="py-2"
        >
          <summary class="cursor-pointer py-1 text-body font-semibold">
            {{ pack.label.trim() || "New pack" }}
            <span v-if="pack.id === 'everyday'" class="text-caption font-normal text-muted-foreground">(fallback)</span>
          </summary>

          <fieldset :disabled="isSaving" class="space-y-3 pt-2 pb-3">
            <label class="block max-w-md space-y-1">
              <span class="text-caption text-muted-foreground">Pack name</span>
              <AppInput v-model="pack.label" tone="card" />
            </label>
            <div class="grid gap-4 sm:grid-cols-2">
              <fieldset v-if="pack.id !== 'everyday'" class="min-w-0 space-y-1">
                <legend class="mb-1 text-caption text-muted-foreground">Match cues</legend>
                <div v-for="(_, cueIndex) in pack.cues" :key="cueIndex" class="flex items-center gap-1">
                  <AppInput v-model="pack.cues[cueIndex]" tone="card" :aria-label="`Match cue ${cueIndex + 1}`" />
                  <AppButton
                    :icon="IconClose"
                    :tooltip="`Remove match cue ${cueIndex + 1}`"
                    @click="pack.cues.splice(cueIndex, 1)"
                  />
                </div>
                <AppButton :icon="IconAdd" label="Add match cue" @click="pack.cues.push('')" />
              </fieldset>
              <fieldset class="min-w-0 space-y-1">
                <legend class="mb-1 text-caption text-muted-foreground">Items</legend>
                <div v-for="(_, itemIndex) in pack.items" :key="itemIndex" class="flex items-center gap-1">
                  <AppInput v-model="pack.items[itemIndex]" tone="card" :aria-label="`Item ${itemIndex + 1}`" />
                  <AppButton
                    :icon="IconClose"
                    :tooltip="`Remove item ${itemIndex + 1}`"
                    @click="pack.items.splice(itemIndex, 1)"
                  />
                </div>
                <AppButton :icon="IconAdd" label="Add item" @click="pack.items.push('')" />
              </fieldset>
            </div>

            <div v-if="pack.id !== 'everyday'" class="flex flex-wrap gap-1">
              <AppButton
                :icon="IconChevronUp"
                label="Move up"
                :disabled="index === 0"
                @click="movePack(index, -1)"
              />
              <AppButton
                :icon="IconChevronDown"
                label="Move down"
                :disabled="index >= draft.length - 2"
                @click="movePack(index, 1)"
              />
              <AppButton tone="danger" label="Remove pack" @click="removePack(index)" />
            </div>
          </fieldset>
        </details>
      </div>

      <p class="text-caption text-muted-foreground">
        Saving updates starter packs for future NPCs across campaigns.
      </p>
      <p v-if="saveError" role="alert" class="text-caption text-destructive">{{ saveError }}</p>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton label="Add pack" :icon="IconAdd" :disabled="isSaving" @click="addPack" />
        <div class="ml-auto flex flex-wrap gap-2">
          <AppButton label="Cancel" :disabled="isSaving" @click="draft = null" />
          <AppButton type="submit" variant="primary" label="Save packs" :loading="isSaving" />
        </div>
      </div>
    </form>
    <p v-if="saved && !draft" role="status" class="text-caption text-ink-success">Starter packs saved.</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { useSaveNpcStarterPacks } from "@/composables/admin/useNpcStarterPacks";
import { useNpcStarterPacks } from "@/composables/npcs/useNpcStarterPacks";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconChevronDown, IconChevronUp, IconClose } from "@/lib/icons";

interface PackDraft {
  id: string;
  label: string;
  cues: string[];
  items: string[];
}

const packsQuery = useNpcStarterPacks();
const packs = packsQuery.data;
const savePacks = useSaveNpcStarterPacks();
const isSaving = savePacks.isPending;
const toast = useToast();
const draft = ref<PackDraft[] | null>(null);
const newPackId = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saved = ref(false);

function startEditing() {
  if (!packs.value) return;
  saved.value = false;
  saveError.value = null;
  newPackId.value = null;
  draft.value = packs.value.map(({ id, label, cues, items }) => ({
    id,
    label,
    cues: [...cues],
    items: [...items],
  }));
}

function addPack() {
  const rows = draft.value;
  if (!rows) return;
  const id = crypto.randomUUID();
  newPackId.value = id;
  rows.splice(rows.length - 1, 0, { id, label: "", cues: [""], items: [""] });
}

function movePack(index: number, offset: -1 | 1) {
  const rows = draft.value;
  const target = index + offset;
  if (!rows || target < 0 || target >= rows.length - 1) return;
  const [pack] = rows.splice(index, 1);
  if (pack) rows.splice(target, 0, pack);
}

function removePack(index: number) {
  draft.value?.splice(index, 1);
}

async function save() {
  if (!draft.value || isSaving.value) return;
  saveError.value = null;
  try {
    await savePacks.mutateAsync(draft.value);
    draft.value = null;
    saved.value = true;
  } catch (error: unknown) {
    saveError.value = toast.fromError(error, "Couldn't save starter inventory packs.");
  }
}
</script>

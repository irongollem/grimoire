<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-5 p-4 lg:p-6">
    <header class="flex items-center gap-3">
      <AppButton :to="{ name: 'play-crafting' }" variant="ghost" size="icon-sm" :icon="IconChevronLeft" aria-label="Back to the Workshop" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-heading-sm font-bold text-foreground">Inventor's notebook</h1>
        <p class="text-caption text-muted-foreground">{{ discipline.label }}</p>
      </div>
    </header>

    <p v-if="!available" class="rounded-lg border border-dashed border-border p-4 text-body text-muted-foreground" data-testid="unavailable">
      Inventing is switched off in this campaign. Your DM can turn on the AI invention rule, and AI, in Campaign Settings.
    </p>

    <section
      v-else-if="!previewing"
      class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      aria-labelledby="wish-heading"
    >
      <h2 id="wish-heading" class="text-title font-bold text-foreground">What do you want to make?</h2>
      <div class="flex flex-col gap-1">
        <textarea
          v-model="wish"
          data-hand
          rows="4"
          :maxlength="INVENTION_WISH_LIMIT"
          aria-labelledby="wish-heading"
          placeholder="A lantern that burns without oil, a blade that hums near water"
          class="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span class="self-end text-caption text-muted-foreground">{{ wish.length }} / {{ INVENTION_WISH_LIMIT }}</span>
      </div>
      <p class="text-caption text-muted-foreground">
        Rarity and value are paid for in materials, so a grand idea needs rare ones. Your DM approves every draft before it
        becomes a recipe.
      </p>
      <div class="flex flex-wrap items-center justify-end gap-3">
        <GenerationCostBadge :credits="cost" />
        <AppButton
          variant="primary"
          size="md"
          label="Invent"
          :disabled="wish.trim().length === 0 || inventions.busy.value"
          :loading="inventions.ideaPending.value"
          @click="onInvent"
        />
      </div>
      <p v-if="inventions.ideaError.value" class="text-caption text-destructive" role="alert">{{ inventions.ideaError.value }}</p>
    </section>

    <p v-else class="text-caption text-muted-foreground">Only the player can invent. The preview shows their notebook.</p>

    <p v-if="loadError" class="text-caption text-destructive" role="alert">{{ loadError }}</p>
    <p v-else-if="list.length === 0 && !isLoading" class="text-body italic text-muted-foreground" data-testid="empty">
      Nothing in the notebook yet. Describe something above, or lay materials on the experiment bench and ask what they could make.
    </p>

    <ul v-if="list.length > 0" class="flex flex-col gap-4" aria-label="Your inventions">
      <li
        v-for="inv in list"
        :id="`invention-${inv.id}`"
        :key="inv.id"
        class="rounded-lg transition-shadow duration-700"
        :class="highlighted === inv.id ? 'ring-2 ring-gold-500/70' : ''"
      >
        <InventionDraftCard :invention="inv" viewer="player" :character-name="member.name">
          <template v-if="inv.status === 'draft' && !previewing" #note>
            <div v-if="revisingId === inv.id" class="flex flex-col gap-1">
              <label :for="`note-${inv.id}`" class="text-label-lg font-semibold text-foreground">What should change?</label>
              <!-- Native on purpose: the note is the revision's prompt (invent-recipe), so rich text would reach the model as markup. -->
              <textarea
                :id="`note-${inv.id}`"
                v-model="note"
                data-hand
                rows="3"
                :maxlength="INVENTION_NOTE_LIMIT"
                class="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span class="self-end text-caption text-muted-foreground">{{ note.length }} / {{ INVENTION_NOTE_LIMIT }}</span>
              <div class="flex flex-wrap items-center justify-end gap-3">
                <GenerationCostBadge :credits="cost" />
                <AppButton
                  variant="primary"
                  size="sm"
                  label="Revise"
                  :disabled="note.trim().length === 0 || inventions.busy.value"
                  :loading="inventions.revisePending.value"
                  @click="onRevise(inv.id)"
                />
              </div>
              <p v-if="inventions.reviseError.value" class="text-caption text-destructive" role="alert">{{ inventions.reviseError.value }}</p>
            </div>
          </template>

          <template v-if="!previewing" #actions>
            <template v-if="inv.status === 'draft'">
              <AppButton
                variant="ghost"
                size="sm"
                label="Discard"
                :disabled="inventions.busy.value"
                @click="onDiscard(inv, 'Discard this draft? It cannot be brought back.', 'Discard')"
              />
              <AppButton
                v-if="available"
                variant="subtle"
                size="sm"
                :label="revisingId === inv.id ? 'Cancel revising' : 'Revise'"
                :active="revisingId === inv.id"
                @click="toggleRevise(inv.id)"
              />
              <AppButton
                variant="primary"
                size="sm"
                label="Send to your DM"
                :disabled="inventions.busy.value"
                :loading="inventions.submitPending.value && submittingId === inv.id"
                @click="onSubmit(inv.id)"
              />
            </template>
            <AppButton
              v-else-if="inv.status === 'pending'"
              variant="ghost"
              size="sm"
              label="Withdraw"
              :disabled="inventions.busy.value"
              @click="onDiscard(inv, 'Withdraw this draft from your DM? It is deleted, not returned to you.', 'Withdraw')"
            />
            <template v-else>
              <AppButton
                variant="ghost"
                size="sm"
                label="Clear from notebook"
                :disabled="inventions.busy.value"
                @click="onDiscard(inv, 'Clear this from your notebook? The recipe stays with your character.', 'Clear')"
              />
              <AppButton
                v-if="inv.recipe_id"
                variant="primary"
                size="sm"
                label="Open the recipe"
                :to="{ name: 'play-crafting-workbench', params: { recipeId: inv.recipe_id } }"
              />
            </template>
          </template>
        </InventionDraftCard>
        <p v-if="inv.status === 'draft' && submittingId === inv.id && inventions.submitError.value" class="mt-1 text-caption text-destructive" role="alert">
          {{ inventions.submitError.value }}
        </p>
      </li>
    </ul>
    <p v-if="inventions.discardError.value" class="text-caption text-destructive" role="alert">{{ inventions.discardError.value }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import InventionDraftCard from "@/components/crafting/invention/InventionDraftCard.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import {
  INVENTION_COST_KEY,
  INVENTION_NOTE_LIMIT,
  INVENTION_WISH_LIMIT,
  useCraftInventions,
  useInventionAvailable,
  useMyInventions,
} from "@/composables/crafting/useCraftInventions";
import { useConfirm } from "@/composables/useConfirm";
import { getDiscipline } from "@/lib/crafting/disciplines";
import { IconChevronLeft } from "@/lib/icons";
import type { CraftingDiscipline, CraftingInvention } from "@/types/crafting.types";

/**
 * The inventor's notebook (#1103): one craft's AI drafts for one character. The player describes
 * something to build, revises a draft with a note, and sends it to the DM, who decides. Each draft
 * is a paid generation; sending, withdrawing and clearing are free.
 */
const { disciplineId, member, previewing = false } = defineProps<{
  disciplineId: CraftingDiscipline;
  member: { id: string; name: string };
  /** A DM looking at the player's notebook: read-only, the server only lets the player invent. */
  previewing?: boolean;
}>();

const route = useRoute();
const { confirm } = useConfirm();
const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const available = useInventionAvailable();
const inventions = useCraftInventions();

const discipline = computed(() => getDiscipline(disciplineId));
const cost = computed(() => costOf(INVENTION_COST_KEY));

const query = useMyInventions(
  () => member.id,
  () => disciplineId,
);
const list = computed<CraftingInvention[]>(() => query.data.value ?? []);
const isLoading = computed(() => query.isLoading.value);
const loadError = computed(() => (query.error.value ? "Your notebook could not be read. Try again in a moment." : null));

const wish = ref("");
const note = ref("");
const revisingId = ref<string | null>(null);
const submittingId = ref<string | null>(null);
const highlighted = ref<string | null>(null);

async function onInvent() {
  if (!requireCredits(cost.value, false)) return;
  const out = await inventions.inventFromIdea(member.id, disciplineId, wish.value.trim());
  if (out?.kind === "invention") {
    wish.value = "";
    highlight(out.invention.id);
  }
}

function toggleRevise(id: string) {
  inventions.resetRevise();
  note.value = "";
  revisingId.value = revisingId.value === id ? null : id;
}

async function onRevise(id: string) {
  if (!requireCredits(cost.value, false)) return;
  const out = await inventions.revise(id, note.value.trim());
  if (out) {
    revisingId.value = null;
    note.value = "";
    highlight(id);
  }
}

async function onSubmit(id: string) {
  submittingId.value = id;
  inventions.resetSubmit();
  await inventions.submit(id);
}

async function onDiscard(inv: CraftingInvention, message: string, confirmLabel: string) {
  if (!(await confirm(message, { title: `${confirmLabel} "${inv.draft.item.name}"?`, confirmLabel }))) return;
  await inventions.discard(inv.id);
}

/** Brings a card into view and rings it for a moment, once. */
function highlight(id: string) {
  void nextTick(() => {
    document.getElementById(`invention-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  highlighted.value = id;
  setTimeout(() => {
    if (highlighted.value === id) highlighted.value = null;
  }, 2600);
}

// A draft the bench just made arrives as ?draft=<id>; show it once the list has it.
let arrivedFor: string | null = null;
watch(
  [list, () => route.query.draft],
  ([rows, draftId]) => {
    if (typeof draftId !== "string" || arrivedFor === draftId) return;
    if (!rows.some((r) => r.id === draftId)) return;
    arrivedFor = draftId;
    highlight(draftId);
  },
  { immediate: true },
);
</script>

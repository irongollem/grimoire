<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="quest-preview-heading">
      <button type="button" class="absolute inset-0 bg-black/60" aria-label="Close player preview" @click="emit('close')" />
      <aside class="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl">
        <header class="flex shrink-0 items-start gap-3 border-b border-border p-4">
          <div class="min-w-0 flex-1">
            <p class="text-label font-bold uppercase tracking-wider text-primary">Saved player projection</p>
            <h2 id="quest-preview-heading" class="font-cinzel text-lg font-bold text-foreground">Preview as players</h2>
          </div>
          <AppButton label="Close" size="sm" variant="subtle" @click="emit('close')" />
        </header>
        <div class="shrink-0 space-y-2 border-b border-border p-4">
          <label class="block space-y-1 text-caption font-semibold text-foreground">
            Audience
            <AppSelect v-model="audienceId" aria-label="Preview audience">
              <option value="">Choose a shared character…</option>
              <option v-for="member in audienceOptions" :key="member.id" :value="member.id">{{ member.name }}</option>
            </AppSelect>
          </label>
          <p v-if="audience" class="text-caption text-muted-foreground">Viewing exactly what {{ audience.name }} is authorized to receive.</p>
          <p v-else-if="!audienceOptions.length" class="text-caption text-tone-caution">This quest is not shared with a party character yet.</p>
          <div v-if="draftVisibility && draftVisibility !== savedVisibility" class="rounded-md border border-tone-caution/40 bg-tone-caution/5 p-2 text-caption text-tone-caution">
            Unsaved draft: {{ draftVisibility }}. Preview still shows the saved {{ savedVisibility }} state.
          </div>
          <p v-else-if="savedVisibility" class="text-caption text-muted-foreground">Selected beat saved as {{ savedVisibility }}.</p>
          <p v-if="selectedBeatId" class="text-2xs text-muted-foreground">Contextual preview is focused from the selected beat, but shows the whole saved player thread.</p>
        </div>
        <main class="min-h-0 flex-1 overflow-y-auto p-4">
          <div v-if="!audienceId" class="rounded-lg border border-dashed border-border p-6 text-center text-body text-muted-foreground">Choose an audience to load the player-safe quest.</div>
          <LoadingSpinner v-else-if="beatsQuery.isLoading.value" class="mx-auto my-12" />
          <div v-else-if="beatsQuery.error.value" role="alert" class="rounded-lg border border-destructive/40 p-3 text-body text-destructive">The safe player projection could not be loaded.</div>
          <div v-else-if="!beats.length" class="rounded-lg border border-dashed border-border p-6 text-center text-body text-muted-foreground">No rumored or revealed story moments are currently visible to this audience.</div>
          <PlayerQuestStoryThread v-else :beats="beats" />
        </main>
        <footer class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border p-4">
          <AppButton label="Close preview" variant="subtle" @click="emit('close')" />
          <AppButton label="Open actual player route" :disabled="!audienceId" @click="openActualRoute" />
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useParty } from "@/composables/useParty";
import { usePlayerQuestBeats } from "@/composables/useQuestFlow";
import { useUiStore } from "@/stores/ui";
import type { QuestBeatVisibility } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PlayerQuestStoryThread from "@/components/player/PlayerQuestStoryThread.vue";

const props = defineProps<{
  questId: string;
  visibleTo: string[];
  selectedBeatId?: string | null;
  savedVisibility?: QuestBeatVisibility | null;
  draftVisibility?: QuestBeatVisibility | null;
}>();
const emit = defineEmits<{ close: [] }>();
const ui = useUiStore();
const router = useRouter();
const { data: party } = useParty();
const audienceId = ref(ui.dmPreviewPartyMemberId ?? "");
const audienceOptions = computed(() => (party.value ?? []).filter((member) => props.visibleTo.includes(member.id)));
const audience = computed(() => audienceOptions.value.find((member) => member.id === audienceId.value) ?? null);
// The `<select>` needs "" for its empty option, but the RPC parameter is a uuid
// and `??` would forward the empty string straight into Postgres (22P02). No
// audience is chosen until the party resolves, and never for a quest shared
// with nobody.
const previewAudienceId = computed(() => audienceId.value || null);
const beatsQuery = usePlayerQuestBeats(computed(() => props.questId), previewAudienceId);
const beats = computed(() => beatsQuery.data.value ?? []);

watch(audienceOptions, (options) => {
  if (!options.some((member) => member.id === audienceId.value)) audienceId.value = options[0]?.id ?? "";
}, { immediate: true });

function openActualRoute() {
  if (!audienceId.value) return;
  ui.enterDmPreview(audienceId.value);
  void router.push(`/play/quests/${props.questId}`);
}
function onKeydown(event: KeyboardEvent) { if (event.key === "Escape") emit("close"); }
onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

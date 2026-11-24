<template>
  <section class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="voice-library">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">ElevenLabs Voice Library</h2>
      <p class="mt-0.5 text-caption text-muted-foreground italic">Thousands of voices made by other people. Adding one fills a slot and uses no custom voice slot.</p>
    </div>
    <form class="flex flex-wrap items-center gap-2" @submit.prevent="search(1)">
      <AppInput v-model="query" type="search" size="sm" :block="false" class="min-w-48 flex-1" placeholder="Raspy old sailor, a calm narrator..." aria-label="Search the voice library" />
      <AppSelect v-model="sex" aria-label="Sex">
        <option value="">Any sex</option>
        <option v-for="o in VOICE_SEX_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </AppSelect>
      <AppSelect v-model="age" aria-label="Age">
        <option value="">Any age</option>
        <option v-for="o in VOICE_AGE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </AppSelect>
      <AppButton type="submit" variant="outline" size="sm" :icon="IconSearch" label="Search" :loading="searching" />
    </form>
    <p v-if="problem" role="alert" class="text-body text-destructive">{{ problem }}</p>
    <p v-else-if="searched && results.length === 0 && !searching" class="text-body text-muted-foreground">No voices matched. Try fewer words.</p>

    <ul v-if="results.length > 0" class="flex flex-col divide-y divide-border">
      <li v-for="v in results" :key="`${v.publicOwnerId}:${v.voiceId}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-body font-semibold text-foreground">{{ v.name }}</span>
          <span class="truncate text-caption text-muted-foreground">{{ facts(v) }}</span>
          <span v-if="v.description" class="line-clamp-2 text-caption text-muted-foreground">{{ v.description }}</span>
          <span v-if="v.rate !== null" class="mt-1 w-fit rounded border border-ink-caution/50 px-1.5 text-label text-ink-caution" data-testid="paid-warning">
            Paid voice: costs more per character than speech is charged at
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <AppButton v-if="v.previewUrl" variant="ghost" size="sm" :icon="playingUrl === v.previewUrl ? IconPause : IconPlay" :label="playingUrl === v.previewUrl ? 'Stop' : 'Listen'" @click="toggle(v.previewUrl)" />
          <span v-if="v.inRegistry" class="text-label text-muted-foreground">Already added</span>
          <AppButton v-else variant="outline" size="sm" :icon="IconAdd" label="Add" @click="adding = v" />
        </div>
      </li>
    </ul>
    <AppButton v-if="hasMore" variant="outline" size="sm" label="More voices" :loading="searching" @click="search(page + 1)" />

    <VoiceSlotFieldsDialog
      :open="adding !== null"
      title="Add this voice"
      :note="adding?.rate !== null && adding ? 'This is a paid voice: each character spoken costs more than the speech rate you charge for.' : undefined"
      confirm-label="Add to the registry"
      :initial="initial"
      :saving="studio.addFromLibrary.isPending.value"
      :error="addError"
      @close="adding = null"
      @save="add"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { useVoiceStudio } from "@/composables/admin/useVoiceStudio";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconPause, IconPlay, IconSearch } from "@/lib/icons";
import { VOICE_AGE_OPTIONS, VOICE_SEX_OPTIONS, type LibraryVoice, type SpeechVoiceFields, type VoiceAge, type VoiceSex } from "@/types/speechVoice.types";
import VoiceSlotFieldsDialog from "./VoiceSlotFieldsDialog.vue";

const { studio } = defineProps<{ studio: ReturnType<typeof useVoiceStudio> }>();
const toast = useToast();

// A popup of candidates to add, not a filter over the page's own list: local state on purpose.
const query = ref("");
const sex = ref("");
const age = ref("");
const results = ref<LibraryVoice[]>([]);
const page = ref(1);
const hasMore = ref(false);
const searching = ref(false);
const searched = ref(false);
const problem = ref<string | null>(null);
const adding = ref<LibraryVoice | null>(null);
const addError = ref<string | null>(null);

async function search(target: number): Promise<void> {
  searching.value = true;
  problem.value = null;
  try {
    const response = await studio.searchLibrary({
      query: query.value.trim(),
      ...(sex.value !== "" ? { sex: sex.value as VoiceSex } : {}),
      ...(age.value !== "" ? { age: age.value as VoiceAge } : {}),
      page: target,
    });
    results.value = target === 1 ? response.voices : [...results.value, ...response.voices];
    page.value = target;
    hasMore.value = response.hasMore;
    searched.value = true;
  } catch (e) {
    problem.value = e instanceof Error ? e.message : "The library could not be searched.";
  } finally {
    searching.value = false;
  }
}

function facts(v: LibraryVoice): string {
  const parts = [v.gender, v.age, v.accent, v.useCase].filter((p): p is string => p !== null && p !== "");
  if (v.noticePeriodDays !== null) parts.push(`${v.noticePeriodDays} days notice before withdrawal`);
  return parts.join(" · ");
}

const initial = computed<SpeechVoiceFields>(() => ({
  name: adding.value?.name ?? "",
  description: adding.value?.description ?? "",
  design_prompt: null,
  preview_text: null,
  sex: adding.value?.gender === "female" ? "woman" : adding.value?.gender === "male" ? "man" : null,
  age: null,
  kind: "cast",
}));

async function add(slot: SpeechVoiceFields): Promise<void> {
  const voice = adding.value;
  if (!voice) return;
  addError.value = null;
  try {
    await studio.addFromLibrary.mutateAsync({ voice, slot });
    results.value = results.value.map((r) => (r === voice ? { ...r, inRegistry: true } : r));
    adding.value = null;
    toast.success(`${slot.name} added.`);
  } catch (e) {
    addError.value = e instanceof Error ? e.message : "The voice could not be added.";
  }
}

// ── previews: a plain audio element on the library's own preview file ──────────────────────────────────────────
const playingUrl = ref<string | null>(null);
let audio: HTMLAudioElement | null = null;
function toggle(url: string): void {
  const wasPlaying = playingUrl.value === url;
  audio?.pause();
  playingUrl.value = null;
  if (wasPlaying) return;
  audio = new Audio(url);
  audio.addEventListener("ended", () => {
    if (playingUrl.value === url) playingUrl.value = null;
  });
  playingUrl.value = url;
  void audio.play().catch(() => {
    playingUrl.value = null;
  });
}
onBeforeUnmount(() => audio?.pause());
</script>

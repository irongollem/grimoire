<template>
  <!-- Choosing a character's voice: every voice laid out with who it fits, heard before it is chosen. -->
  <AppModal :open="open" size="lg" panel-class="max-h-[92vh]" label="Choose a voice" @close="emit('close')">
    <div class="flex min-h-0 flex-col gap-3 p-5" data-testid="npc-voice-browser">
      <div>
        <h2 class="text-heading-sm font-semibold text-foreground">Choose a voice</h2>
        <p class="mt-0.5 text-caption text-muted-foreground">Listen first: hearing a voice is free. The one you pick reads this character at the AI table.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppInput v-model="search" type="search" size="sm" :block="false" class="min-w-48 flex-1" placeholder="Search: british, gruff, kindly..." aria-label="Search the voices" />
        <SegmentedControl v-model="sex" :options="SEX_FILTER" size="sm" />
      </div>

      <ul class="-mx-1 flex min-h-0 flex-col divide-y divide-border overflow-y-auto px-1" data-testid="npc-voice-list">
        <li v-for="v in shown" :key="v.id" class="flex flex-wrap items-start gap-x-3 gap-y-2 py-3" :data-testid="`npc-voice-${v.id}`">
          <div class="min-w-0 flex-1">
            <p class="text-body font-semibold text-foreground">
              {{ v.name }}
              <span v-if="v.id === currentId" class="ml-1 text-caption font-normal text-muted-foreground">(their voice now)</span>
            </p>
            <p v-if="v.description" class="text-caption text-foreground/80">{{ v.description }}</p>
            <p v-if="traits(v)" class="mt-0.5 text-caption-sm text-muted-foreground">{{ traits(v) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <AppButton
              variant="outline"
              size="sm"
              :icon="playing === v.id ? IconStop : IconPlay"
              :label="playing === v.id ? 'Stop' : 'Listen'"
              :loading="loading === v.id"
              @click="emit('listen', v.id)"
            />
            <AppButton
              :variant="v.id === currentId ? 'ghost' : 'primary'"
              size="sm"
              :label="v.id === currentId ? 'In use' : 'Use this voice'"
              :disabled="v.id === currentId || saving"
              @click="emit('pick', v.id)"
            />
          </div>
        </li>
        <li v-if="shown.length === 0" class="py-6 text-center text-body text-muted-foreground">No voice fits that search.</li>
      </ul>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <AppButton v-if="currentId !== null" variant="ghost" size="sm" label="Let the table cast" :disabled="saving" @click="emit('pick', null)" />
        <span v-else class="text-caption text-muted-foreground">Cast at the table: a fitting voice is picked the first time they speak.</span>
        <AppButton variant="outline" size="sm" label="Close" @click="emit('close')" />
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The voice picker on an NPC sheet (#1272): a dropdown of names showed nothing a DM chooses a voice by. Each voice is
 * a row with its "Who it fits" (where accent and character are written), its sex and age, a Listen that plays its kept
 * sample, and Use this voice. Searching and the sex filter are this dialog's own (a popup of candidates, so local
 * state, not the list store) and start clear each time it opens.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import { IconPlay, IconStop } from "@/lib/icons";
import type { SpeechVoice } from "@/types/speechVoice.types";

const { open, voices, currentId, playing = null, loading = null, saving = false } = defineProps<{
  open: boolean;
  /** The voices a character may be given: filled and active. */
  voices: readonly SpeechVoice[];
  currentId: string | null;
  playing?: string | null;
  loading?: string | null;
  saving?: boolean;
}>();
const emit = defineEmits<{ close: []; listen: [slotId: string]; pick: [slotId: string | null] }>();

const SEX_FILTER = [
  { value: "any", label: "Any" },
  { value: "woman", label: "Women" },
  { value: "man", label: "Men" },
] as const;

const search = ref("");
const sex = ref<"any" | "woman" | "man">("any");
watch(
  () => open,
  (isOpen) => {
    if (isOpen) {
      search.value = "";
      sex.value = "any";
    }
  },
);

const AGE_WORD: Record<string, string> = { child: "child", young: "young", adult: "adult", old: "old" };
/** "Woman, old" style line under the description; empty when the voice has neither. */
function traits(v: SpeechVoice): string {
  const parts = [v.sex === "woman" ? "Woman" : v.sex === "man" ? "Man" : null, v.age ? AGE_WORD[v.age] : null].filter((p): p is string => p !== null);
  return parts.join(", ");
}

const shown = computed(() => {
  const words = search.value.trim().toLowerCase().split(/\s+/).filter((w) => w !== "");
  return voices
    .filter((v) => sex.value === "any" || v.sex === sex.value)
    .filter((v) => {
      const hay = `${v.name} ${v.description} ${traits(v)}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    // Their current voice first, then by name.
    .slice()
    .sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : a.name.localeCompare(b.name)));
});
</script>

<template>
  <!-- The voice studio (#1272): the slots the AI table casts from, designed here and kept any number at a time. -->
  <div class="flex flex-col gap-5" data-testid="admin-voices">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-heading-sm font-semibold text-foreground">
          <template v-if="slots">Custom voice slots: {{ slots.used }} of {{ slots.limit }} used</template>
          <template v-else>Voices</template>
        </h2>
        <p class="mt-0.5 text-caption text-muted-foreground italic">Designed voices each use one of your custom slots on ElevenLabs. Voices added from the Voice Library use none, so there is no limit to how many you add.</p>
        <p v-if="refusedNote" class="mt-1 text-caption text-muted-foreground" role="status" data-testid="voices-refused">{{ refusedNote }}</p>
      </div>
      <AppButton variant="primary" size="sm" :icon="IconAdd" label="New slot" @click="openNew" />
    </header>

    <BannerLoader v-if="voices.isPending.value" class="h-8" />
    <p v-else-if="voices.isError.value" role="alert" class="text-body text-destructive">The voices could not be read. Reload to try again.</p>
    <template v-else>
      <section v-for="group in groups" :key="group.id" class="rounded-lg border border-border bg-card p-4" :data-testid="`voice-group-${group.id}`">
        <h3 class="text-label-lg font-semibold text-foreground">{{ group.title }} <span class="font-normal text-muted-foreground">({{ group.items.length }})</span></h3>
        <p v-if="group.items.length === 0" class="mt-1 text-caption text-muted-foreground">{{ group.empty }}</p>
        <ul v-else class="mt-1 flex flex-col divide-y divide-border">
          <VoiceSlotRow
            v-for="v in group.items"
            :key="v.id"
            :voice="v"
            :playing="sample.playing.value === v.id"
            :loading="sample.loading.value === v.id"
            @listen="sample.toggle(v.id)"
            @edit="editingId = v.id"
            @design="editingId = v.id"
            @remove="removing = v"
          />
        </ul>
      </section>
      <p v-if="sample.problem.value" role="alert" class="text-body text-destructive">{{ sample.problem.value }}</p>
    </template>

    <VoiceAccountPanel :voices="account.data.value?.unregistered ?? []" :studio="studio" />
    <VoiceLibraryPanel :studio="studio" />

    <VoiceSlotEditor :open="editorOpen" :voice="editing" :studio="studio" @close="closeEditor" @kept="onKept" />

    <VoiceConfirmDialog
      :open="removing !== null"
      :title="`Remove ${removing?.name ?? 'this slot'}?`"
      message="Characters cast to this slot lose their voice until they are cast again."
      confirm-label="Remove slot"
      :check-label="removing && canDeleteFromService(removing) ? `Also delete from ${removing.service === 'inworld' ? 'Inworld' : 'ElevenLabs'}` : undefined"
      danger
      @confirm="(ticked) => removing && doRemove(removing, ticked)"
      @cancel="removing = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { canDeleteFromService, useVoiceStudio } from "@/composables/admin/useVoiceStudio";
import { useSpeechVoices, useVoiceSample } from "@/composables/voices/useSpeechVoices";
import { useToast } from "@/composables/useToast";
import { IconAdd } from "@/lib/icons";
import type { SpeechVoice } from "@/types/speechVoice.types";
import VoiceAccountPanel from "./VoiceAccountPanel.vue";
import VoiceConfirmDialog from "./VoiceConfirmDialog.vue";
import VoiceLibraryPanel from "./VoiceLibraryPanel.vue";
import VoiceSlotEditor from "./VoiceSlotEditor.vue";
import VoiceSlotRow from "./VoiceSlotRow.vue";

const toast = useToast();
const voices = useSpeechVoices();
const sample = useVoiceSample();
const studio = useVoiceStudio(sample);
const account = studio.account;
// Null when the stack has no ElevenLabs key: the count is then not shown at all.
const slots = computed(() => account.data.value?.slots ?? null);
/** Why part of the summary is missing: the key on file may not do it. Each part says which permission it needs. */
const refusedNote = computed(() => {
  const refused = account.data.value?.refused ?? [];
  const parts: string[] = [];
  if (refused.includes("elevenlabs-slots")) parts.push("the slot count needs User read");
  if (refused.includes("elevenlabs-voices")) parts.push("listing your ElevenLabs voices needs Voices read");
  if (refused.includes("inworld-voices")) parts.push("listing your Inworld voices needs a key that may list them");
  return parts.length === 0 ? null : `The key on file is not allowed some of this: ${parts.join("; ")}. Add it to the key in Admin > Providers.`;
});

const list = computed(() => voices.data.value ?? []);
const groups = computed(() => [
  { id: "app", title: "The app's own voices", empty: "No bound voices yet.", items: list.value.filter((v) => v.binding !== null) },
  { id: "design", title: "To design", empty: "Every slot has a voice.", items: list.value.filter((v) => v.binding === null && v.voice_id === null) },
  { id: "cast", title: "Cast pool", empty: "No voices in the pool yet.", items: list.value.filter((v) => v.binding === null && v.voice_id !== null && v.kind === "cast") },
  { id: "own", title: "Signature voices", empty: "No signature voices yet.", items: list.value.filter((v) => v.binding === null && v.voice_id !== null && v.kind === "own") },
]);

// The editor is open for a saved slot (`editingId`) or a new one (`creating`).
const editingId = ref<string | null>(null);
const creating = ref(false);
const editing = computed(() => list.value.find((v) => v.id === editingId.value) ?? null);
const editorOpen = computed(() => creating.value || editing.value !== null);
function openNew(): void {
  creating.value = true;
}
function closeEditor(): void {
  creating.value = false;
  editingId.value = null;
}
/** A voice kept as a new slot while writing a new one: the new slot now exists, so the editor opens on it. */
function onKept(voice: SpeechVoice): void {
  if (creating.value) {
    creating.value = false;
    editingId.value = voice.id;
  }
}

const removing = ref<SpeechVoice | null>(null);
async function doRemove(slot: SpeechVoice, fromService: boolean): Promise<void> {
  removing.value = null;
  try {
    await studio.remove.mutateAsync({ slot, fromService });
    toast.success(`${slot.name} removed.`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "The slot could not be removed.");
  }
}
</script>

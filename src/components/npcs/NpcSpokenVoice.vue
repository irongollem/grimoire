<template>
  <section v-if="aiOn" class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3.5" data-testid="npc-spoken-voice">
    <p class="text-label-lg font-semibold text-muted-foreground">SPOKEN VOICE</p>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <template v-if="current">
          <p class="text-body font-semibold text-foreground" data-testid="voice-name">{{ current.name }}</p>
          <p class="text-caption text-muted-foreground">{{ current.description }}</p>
        </template>
        <template v-else>
          <p class="text-body font-semibold text-foreground" data-testid="voice-name">Cast at the table</p>
          <p class="text-caption text-muted-foreground">
            The table picks a voice that fits the first time they speak, and keeps it. You can change it here afterwards.
          </p>
        </template>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <AppButton
          v-if="current"
          variant="outline"
          size="sm"
          :icon="playing === current.id ? IconStop : IconPlay"
          :loading="loading === current.id"
          :label="playing === current.id ? 'Stop' : 'Listen'"
          @click="sample.toggle(current.id)"
        />
        <AppButton
          variant="outline"
          size="sm"
          :label="changing ? 'Done' : 'Change'"
          :disabled="saving"
          @click="changing = !changing"
        />
      </div>
    </div>

    <p v-if="problem" class="text-caption text-destructive" role="alert">{{ problem }}</p>

    <div v-if="changing" class="flex flex-wrap items-center gap-2">
      <EntityCombobox
        :model-value="current?.id ?? ''"
        :options="options"
        placeholder="Pick a voice…"
        :match-text="(o: VoiceOption) => `${o.name} ${o.detail}`"
        @update:model-value="pick"
      >
        <template #option="{ opt }">
          <span class="font-medium">{{ opt.name }}</span>
          <span v-if="opt.detail" class="text-caption text-muted-foreground">{{ opt.detail }}</span>
        </template>
      </EntityCombobox>
      <AppButton
        v-if="npc.speech_voice_id !== null"
        variant="ghost"
        size="sm"
        label="Let the table cast"
        :disabled="saving"
        @click="write(null)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useUpdateNpc } from "@/composables/npcs/useNpcs";
import { useSpeechVoices, useVoiceSample } from "@/composables/voices/useSpeechVoices";
import { useToast } from "@/composables/useToast";
import { IconPlay, IconStop } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import type { Npc } from "@/types/npc.types";

// Which voice reads this character aloud at the AI table (#1272). It saves itself on every pick, like the reveal
// control: the sheet's Save/Cancel editor is not involved.

const { npc } = defineProps<{ npc: Pick<Npc, "id" | "speech_voice_id"> }>();

interface VoiceOption {
  id: string;
  name: string;
  detail: string;
}

const toast = useToast();
// Only where the campaign has AI on: the voice is heard at the AI table and nowhere else, so elsewhere the control
// would be a choice that does nothing. Off, it renders nothing and the registry is never read.
const campaignStore = useCampaignStore();
const aiOn = computed(() => campaignStore.isAiEnabled);
const { data: voices } = useSpeechVoices(aiOn);
const update = useUpdateNpc();
const sample = useVoiceSample();
const { playing, loading } = sample;
const problem = computed(() => sample.problem.value);

const changing = ref(false);
const saving = computed(() => update.isPending.value);

// Only a filled, active slot can be spoken in; a slot that is only planned or was retired is not offered.
const usable = computed(() => (voices.value ?? []).filter((v) => v.active && v.voice_id !== null && v.service !== null));
const options = computed<VoiceOption[]>(() =>
  usable.value.map((v) => ({ id: v.id, name: v.name, detail: [v.sex, v.age].filter((part) => part !== null).join(", ") })),
);
// A retired or unreadable slot reads as uncast: the table will recast.
const current = computed(() => usable.value.find((v) => v.id === npc.speech_voice_id) ?? null);

async function write(slotId: string | null): Promise<void> {
  try {
    await update.mutateAsync({ id: npc.id, update: { speech_voice_id: slotId } });
  } catch (error) {
    toast.error(toast.fromError(error, "That voice could not be saved."));
    return;
  }
  changing.value = false;
}

function pick(slotId: string): void {
  void write(slotId === "" ? null : slotId);
}
</script>

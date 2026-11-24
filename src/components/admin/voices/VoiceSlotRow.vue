<template>
  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" :data-testid="`voice-slot-${voice.id}`">
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-body font-semibold text-foreground">
        {{ voice.name }}
        <span v-if="!voice.active" class="ml-1 text-label font-normal text-ink-caution">inactive</span>
      </span>
      <span v-if="voice.binding" class="text-caption text-foreground" data-testid="voice-binding">{{ BINDING_LABEL[voice.binding] }}</span>
      <span class="truncate text-caption text-muted-foreground">{{ detail }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <AppButton
        v-if="voice.voice_id !== null"
        variant="ghost"
        size="sm"
        :icon="playing ? IconPause : IconPlay"
        :label="playing ? 'Stop' : 'Listen'"
        :loading="loading"
        @click="emit('listen')"
      />
      <AppButton variant="ghost" size="sm" :icon="IconEdit" label="Edit" @click="emit('edit')" />
      <AppButton variant="ghost" size="sm" :icon="IconGenerate" label="Design" @click="emit('design')" />
      <!-- A bound slot is the app's own voice: the code asks for it by name, so it is refilled, never removed. -->
      <AppButton v-if="voice.binding === null" variant="ghost" size="sm" :icon="IconDelete" label="Remove" @click="emit('remove')" />
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { BINDING_LABEL } from "@/composables/admin/useVoiceStudio";
import { IconDelete, IconEdit, IconGenerate, IconPause, IconPlay } from "@/lib/icons";
import type { SpeechVoice } from "@/types/speechVoice.types";

const { voice } = defineProps<{ voice: SpeechVoice; playing: boolean; loading: boolean }>();
const emit = defineEmits<{ (e: "listen"): void; (e: "edit"): void; (e: "design"): void; (e: "remove"): void }>();

const SERVICE_LABEL = { elevenlabs: "ElevenLabs", inworld: "Inworld" } as const;
const ORIGIN_LABEL = { stock: "stock voice", designed: "designed here", library: "from the library", imported: "imported" } as const;

const detail = computed(() => {
  const parts: string[] = [];
  const who = [voice.sex, voice.age].filter((p) => p !== null).join(", ");
  if (who) parts.push(who);
  if (voice.voice_id === null) parts.push("no voice yet");
  else {
    parts.push(ORIGIN_LABEL[voice.origin]);
    if (voice.service) parts.push(SERVICE_LABEL[voice.service]);
  }
  return parts.join(" · ");
});
</script>

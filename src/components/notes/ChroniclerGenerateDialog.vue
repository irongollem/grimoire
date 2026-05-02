<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @click.self="emit('close')"
    >
      <div class="bg-card rounded-lg border border-border p-5 max-w-lg w-full mx-4 flex flex-col gap-4">
        <h3 class="font-cinzel text-sm font-bold tracking-wider">Generate Scene Illustration</h3>

        <!-- Cost warning — compact single line -->
        <div class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex gap-2 items-start">
          <span class="text-amber-500 shrink-0 text-xs mt-px">⚠</span>
          <p class="font-fell text-xs text-amber-600 dark:text-amber-400 leading-snug">
            Image generation costs roughly <strong>$0.20–0.35 (square)</strong> or <strong>$0.40–0.65 (landscape)</strong> per image, and rises with each reference portrait included.
          </p>
        </div>

        <!-- Scene prompt -->
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Scene prompt</label>
          <MentionTextarea
            v-model="scenePrompt"
            :rows="6"
            placeholder="Describe the scene… use @Name to reference characters, e.g. @Aria and @Thorin face the @Dragon in the ruins."
            :items="mentionItems"
            :disabled="generating"
          />
        </div>

        <!-- Resolved entities -->
        <div v-if="scenePrompt.trim()" class="flex flex-col gap-1.5">
          <span class="font-cinzel text-xs text-muted-foreground tracking-wide">Resolved characters</span>
          <div v-if="resolvedEntities.length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="e in resolvedEntities"
              :key="e.label"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-fell"
              :class="e.portraitUrl
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground'"
            >
              <span class="text-[10px]">{{ e.portraitUrl ? '▣' : '◻' }}</span>
              {{ e.label }}
            </span>
          </div>
          <p v-else-if="hasMentions" class="font-fell text-xs text-muted-foreground italic">
            No @mentions matched known characters — generating from description only.
          </p>
        </div>

        <!-- Shape picker -->
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Shape</label>
          <div class="flex gap-1.5">
            <button
              v-for="s in SHAPES"
              :key="s.value"
              type="button"
              class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors"
              :class="size === s.value
                ? 'border-primary bg-primary/10 text-primary font-semibold'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'"
              @click="size = s.value"
            >
              <span class="font-cinzel text-xs">{{ s.label }}</span>
              <span class="font-fell text-[10px] opacity-60">{{ s.cost }}</span>
            </button>
          </div>
        </div>

        <!-- Error -->
        <p v-if="error" class="font-fell text-xs text-destructive">{{ error }}</p>

        <!-- Actions -->
        <div class="flex gap-2 justify-end">
          <button
            type="button"
            class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            :disabled="generating"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            :disabled="generating || !scenePrompt.trim()"
            @click="generate"
          >
            <Sparkles class="h-3 w-3" :class="generating ? 'animate-pulse' : ''" />
            {{ generating ? 'Generating…' : 'Generate' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Sparkles } from "lucide-vue-next";
import { parseSceneEntities, generateChroniclerImage } from "@/ai/useChroniclerImageGeneration";
import { useCreateChroniclerImage } from "@/composables/useChroniclerImages";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import type { ChroniclerSize } from "@/types/chronicler.types";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import { useEntityMentionItems } from "@/composables/useEntityMentionItems";

const props = defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  generated: [url: string];
}>();

const SHAPES: { label: string; value: ChroniclerSize; cost: string }[] = [
  { label: "Square",    value: "1024x1024",  cost: "~$0.20–0.35" },
  { label: "Landscape", value: "1536x1024",  cost: "~$0.40–0.65" },
];

const scenePrompt = ref("");
const size        = ref<ChroniclerSize>("1024x1024");
const generating  = ref(false);
const error       = ref("");

watch(() => props.visible, (v) => {
  if (v) {
    scenePrompt.value = "";
    error.value = "";
  }
});

const { mentionItems, partyMembers, npcs, monsters } = useEntityMentionItems();

const resolvedEntities = computed(() =>
  parseSceneEntities(
    scenePrompt.value,
    npcs.value,
    monsters.value,
    partyMembers.value,
    campaignStore.activeCampaign?.group_portrait_url,
  ),
);

const hasMentions = computed(() => /@[A-Za-z]/.test(scenePrompt.value));

const campaignStore = useCampaignStore();
const { activeCampaignId } = storeToRefs(campaignStore);
const { user } = storeToRefs(useAuthStore());
const { mutateAsync: createImage } = useCreateChroniclerImage();

async function generate() {
  if (!activeCampaignId.value || !scenePrompt.value.trim() || !user.value) return;
  generating.value = true;
  error.value = "";
  try {
    const url = await generateChroniclerImage({
      sceneText: scenePrompt.value,
      entities:  resolvedEntities.value,
      size:      size.value,
    });
    await createImage({
      campaign_id: activeCampaignId.value,
      user_id:     user.value!.id,
      image_url:   url,
      prompt:      scenePrompt.value.slice(0, 500),
      size:        size.value,
    });
    emit("generated", url);
    emit("close");
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Generation failed.";
  } finally {
    generating.value = false;
  }
}
</script>

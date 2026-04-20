<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @click.self="emit('close')"
    >
      <div class="bg-card rounded-lg border border-border p-5 max-w-sm w-full mx-4 flex flex-col gap-4">
        <h3 class="font-cinzel text-sm font-bold tracking-wider">Generate Scene Illustration</h3>

        <!-- Cost warning -->
        <div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2">
          <span class="text-amber-500 shrink-0 mt-0.5">⚠</span>
          <p class="font-fell text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
            These generations are significantly more costly than other AI features.
            Each scene image costs roughly <strong>$0.20–0.35 (square)</strong> or
            <strong>$0.40–0.65 (landscape)</strong>, and rises with each reference portrait included.
          </p>
        </div>

        <!-- Reference entities -->
        <div v-if="entities.length > 0" class="font-fell text-xs text-muted-foreground leading-relaxed">
          <span class="font-semibold">References:</span>
          {{ entities.map(e => e.label).join(', ') }}
          <span class="opacity-60 ml-1">
            ({{ portraitCount }} with portrait · {{ entities.length - portraitCount }} text-only)
          </span>
        </div>
        <div v-else class="font-fell text-xs text-muted-foreground italic">
          No @-mentioned entities — generating from scene description only.
        </div>

        <!-- Shape picker -->
        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Shape</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="s in SHAPES"
              :key="s.value"
              type="button"
              class="flex flex-col items-center gap-1 rounded-md border px-3 py-2 transition-colors"
              :class="size === s.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'"
              @click="size = s.value"
            >
              <span class="font-cinzel text-xs font-semibold">{{ s.label }}</span>
              <span class="font-fell text-[10px] opacity-70">{{ s.cost }}</span>
            </button>
          </div>
        </div>

        <!-- Style hint -->
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Style hint <span class="opacity-50">(optional)</span></label>
          <input
            v-model="styleHint"
            type="text"
            placeholder="dramatic, torchlit, low angle…"
            class="field-input text-sm"
            :disabled="generating"
          />
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
            :disabled="generating"
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
import { ref, computed } from "vue";
import { Sparkles } from "lucide-vue-next";
import { generateChroniclerImage, type ResolvedEntity } from "@/ai/useChroniclerImageGeneration";
import { useCreateChroniclerImage } from "@/composables/useChroniclerImages";
import { useCampaignStore } from "@/stores/campaign";
import { storeToRefs } from "pinia";
import type { ChroniclerSize } from "@/types/chronicler.types";

const props = defineProps<{
  visible: boolean;
  sceneText: string;
  entities: ResolvedEntity[];
}>();

const emit = defineEmits<{
  close: [];
  generated: [url: string];
}>();

const SHAPES: { label: string; value: ChroniclerSize; cost: string }[] = [
  { label: "Square",    value: "1024x1024",  cost: "~$0.20–0.35" },
  { label: "Landscape", value: "1536x1024",  cost: "~$0.40–0.65" },
];

const size      = ref<ChroniclerSize>("1024x1024");
const styleHint = ref("");
const generating = ref(false);
const error      = ref("");

const portraitCount = computed(() => props.entities.filter((e) => e.portraitUrl).length);

const { activeCampaignId } = storeToRefs(useCampaignStore());
const { mutateAsync: createImage } = useCreateChroniclerImage();

async function generate() {
  if (!activeCampaignId.value) return;
  generating.value = true;
  error.value = "";
  try {
    const url = await generateChroniclerImage({
      sceneText: props.sceneText,
      entities:  props.entities,
      size:      size.value,
      styleHint: styleHint.value,
    });
    await createImage({
      campaign_id: activeCampaignId.value,
      image_url:   url,
      prompt:      props.sceneText.slice(0, 500),
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

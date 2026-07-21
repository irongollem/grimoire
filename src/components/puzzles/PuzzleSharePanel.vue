<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <IconShare class="size-3.5 text-muted-foreground shrink-0" />
        <span class="text-label-lg font-semibold text-muted-foreground">Player Share</span>
      </div>
      <!-- Share toggle -->
      <button
        type="button"
        class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
        :class="shareState.is_shared ? 'bg-primary' : 'bg-muted border border-border'"
        @click="emit('toggle-share')"
      >
        <span
          class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
          :class="shareState.is_shared ? 'translate-x-4.5' : 'translate-x-0.5'"
        />
      </button>
    </div>
    <div class="p-4 space-y-3">
      <p v-if="!shareState.is_shared" class="font-fell text-xs text-muted-foreground italic">
        Toggle sharing to make this puzzle visible to players in your campaign.
      </p>
      <template v-else>
        <p class="font-fell text-xs text-muted-foreground">
          Shared with players in your campaign. Revealed hints: {{ shareState.shared_hints.length }} / {{ totalHints }}
        </p>

        <!-- Read aloud -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
            Read-Aloud Text
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(players will see this)</span>
          </label>
          <textarea
            v-model="shareState.read_aloud"
            rows="3"
            placeholder="Read this aloud as the party enters the room…"
            class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            @blur="emit('save-share-state')"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconShare } from "@/lib/icons";

defineProps<{
  shareState: {
    is_shared: boolean;
    shared_hints: number[];
    read_aloud: string | null;
  };
  totalHints: number;
}>();

const emit = defineEmits<{
  (e: "toggle-share"): void;
  (e: "save-share-state"): void;
}>();
</script>

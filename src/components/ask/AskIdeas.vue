<template>
  <div class="flex flex-col gap-3">
    <p class="text-eyebrow uppercase text-muted-foreground">Familiar · Ideas</p>
    <article v-for="(idea, i) in ideas" :key="i" class="flex flex-col gap-1.5 border border-border bg-background/40 px-3 py-2.5" data-testid="ask-idea">
      <h3 class="text-body font-bold text-foreground">{{ idea.title }}</h3>
      <ul class="flex flex-col gap-1">
        <li v-for="(line, l) in idea.lines" :key="l" class="flex items-start gap-2 text-body">
          <!-- Canon is what the campaign already says; a new idea is Grimoire's own. Both are named in words. -->
          <span
            class="mt-0.5 inline-flex shrink-0 items-center gap-1 text-eyebrow uppercase"
            :class="line.canon ? 'text-ink-info' : 'text-ink-arcane'"
          >
            <span class="size-1.5 rotate-45" :class="line.canon ? 'bg-tone-info' : 'border border-tone-arcane'" aria-hidden="true" />
            {{ line.canon ? "Canon" : "New idea" }}
          </span>
          <span class="min-w-0 flex-1">
            {{ line.text }}
            <template v-for="ref in withRoutes(line.refs)" :key="`${ref.type}:${ref.id}`">
              {{ " " }}
              <RouterLink v-if="ref.route !== null" :to="ref.route" class="underline underline-offset-2 hover:text-primary">{{ ref.name }}</RouterLink>
              <span v-else class="underline underline-offset-2">{{ ref.name }}</span>
              <span class="ml-0.5 text-caption-sm text-muted-foreground">{{ RECORD_KIND_LABEL[ref.type] }}</span>
            </template>
          </span>
        </li>
      </ul>
      <AppButton
        v-if="idea.handoff"
        variant="outline"
        size="sm"
        class="self-start"
        :label="handoffLabel(idea.handoff.generator)"
        :disabled="handedOff.includes(i)"
        @click="emit('hand-off', i)"
      />
    </article>
  </div>
</template>

<script setup lang="ts">
/** Brainstorm ideas, each line tagged Canon or New idea, refs as links, and a handoff to the generator that makes it. */
import { RouterLink } from "vue-router";
import { askGenerator, type AskIdea, type AskRecordRef } from "@edge-shared/agent/askContract";
import { askRecordRoute, RECORD_KIND_LABEL } from "@/composables/ask/askRecordRoute";
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{ ideas: AskIdea[]; handedOff: number[] }>();
const emit = defineEmits<{ "hand-off": [index: number] }>();

/** Each ref with its route, resolved once: a kind with no page of its own (a beat, a room) is shown as plain text. */
function withRoutes(refs: AskRecordRef[]) {
  return refs.map((ref) => ({ ...ref, route: askRecordRoute(ref) }));
}

function handoffLabel(generatorId: string): string {
  const noun = askGenerator(generatorId)?.noun ?? "record";
  return `Make this ${/^(NPC|[aeiou])/i.test(noun) ? "an" : "a"} ${noun}`;
}
</script>

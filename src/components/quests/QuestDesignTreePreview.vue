<template>
  <section class="space-y-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-4">
    <div>
      <h2 class="font-cinzel text-lg font-bold text-foreground">{{ tree.title }}</h2>
      <p class="mt-1 text-body text-muted-foreground">{{ tree.summary }}</p>
    </div>

    <ol class="space-y-3">
      <li v-for="(beat, i) in beats" :key="beat.key" class="space-y-1.5 border-l-2 border-border/60 pl-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="font-cinzel text-2xs text-primary shrink-0">{{ i + 1 }}.</span>
          <span class="font-semibold text-body text-foreground">{{ beat.title }}</span>
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ beat.kind }}</span>
          <span
            v-if="changeBadge(beat.key)"
            class="rounded bg-tone-info/15 px-1.5 py-0.5 text-label uppercase text-ink-info"
          >{{ changeBadge(beat.key) }}</span>
        </div>
        <p v-if="beat.dmContentPlain" class="line-clamp-2 text-caption text-muted-foreground">{{ beat.dmContentPlain }}</p>
        <p v-if="forksByBeat.get(beat.key)?.length" class="text-caption text-muted-foreground/80">
          → {{ forksByBeat.get(beat.key)!.join(" / ") }}
        </p>
      </li>
    </ol>

    <p v-if="diff.removedBeatTitles.length" class="text-caption text-muted-foreground/60">
      Removed: {{ diff.removedBeatTitles.join(", ") }}
    </p>

    <div v-if="tree.objectives.length" class="space-y-1.5">
      <p class="text-label-lg font-semibold text-muted-foreground">Objectives</p>
      <ul class="space-y-1">
        <li
          v-for="(objective, i) in tree.objectives"
          :key="objective.description"
          class="flex items-start gap-2 text-caption text-muted-foreground"
        >
          <QuestObjectiveStatusMark :status="objectiveStatuses[i]!" />
          <span class="flex-1">
            {{ objective.description }}
            <span v-if="beatTitleByKey.get(objective.raised_by ?? '')" class="text-muted-foreground/60">
              — raised by {{ beatTitleByKey.get(objective.raised_by ?? "") }}
            </span>
          </span>
        </li>
      </ul>
    </div>

    <div v-if="tree.tags.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="tag in tree.tags"
        :key="tag"
        class="rounded-full border border-border bg-muted px-2 py-0.5 text-caption-sm text-muted-foreground"
      >{{ tag }}</span>
    </div>

    <GeneratedEntityChips :entities="entities" @navigate="(entity) => emit('navigate', entity)" />
  </section>
</template>

<script setup lang="ts">
/**
 * The right-hand read-only render of a quest-designer turn's tree (#873).
 * Deliberately built on the same pure plan functions the write path uses
 * (planSpineBeats/planSpineRoutes/deriveObjectiveStatuses from
 * src/lib/quests/spine.ts) so this can never show a beat, route or objective
 * status that createFromHook would then silently drop or resolve differently.
 */
import { computed } from "vue";
import { planSpineBeats, planSpineRoutes, deriveObjectiveStatuses } from "@/lib/quests/spine";
import QuestObjectiveStatusMark from "@/components/quests/QuestObjectiveStatusMark.vue";
import GeneratedEntityChips from "@/components/common/GeneratedEntityChips.vue";
import type { ResolvedEntity } from "@/ai/resolveGeneratedEntities";
import type { QuestDesignTree, QuestDesignDiff } from "@/lib/quests/designer";

const { tree, diff, entities } = defineProps<{
  tree: QuestDesignTree;
  diff: QuestDesignDiff;
  entities: ResolvedEntity[];
}>();

const emit = defineEmits<{ navigate: [entity: ResolvedEntity] }>();

const beats = computed(() => planSpineBeats(tree.beats));
const routes = computed(() => planSpineRoutes(beats.value, tree.routes));
const objectiveStatuses = computed(() => deriveObjectiveStatuses(tree.objectives, beats.value));

const beatTitleByKey = computed(() => new Map(beats.value.map((b) => [b.key, b.title])));

/** Outgoing route targets' titles per source beat key, in route order — a
 *  beat with two or more is a fork; one is just what comes next. */
const forksByBeat = computed(() => {
  const map = new Map<string, string[]>();
  for (const route of routes.value) {
    const targetTitle = beatTitleByKey.value.get(route.to);
    if (!targetTitle) continue;
    const existing = map.get(route.from) ?? [];
    existing.push(targetTitle);
    map.set(route.from, existing);
  }
  return map;
});

function changeBadge(beatKey: string): string | null {
  const status = diff.beats[beatKey];
  if (status === "added") return "new";
  if (status === "changed") return "changed";
  return null;
}
</script>

<template>
  <DashboardWidget title="Conditions" :count="conditions.length" to="/rules?tab=screen">
    <ul class="divide-y divide-border/50">
      <li v-for="condition in conditions" :key="condition.id">
        <!--
          A plain button rather than `AppButton`: this is a full-width row of
          clickable text with no chrome of its own — no padding recipe, no
          border, no radius — which is the documented case for a raw element.
          An AppButton here would draw a control where the design wants a list.
        -->
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/30"
          :aria-expanded="expandedId === condition.id"
          @click="toggle(condition.id)"
        >
          <span class="font-cinzel text-caption font-semibold text-foreground">
            {{ condition.name }}
          </span>
          <component
            :is="IconChevronDown"
            class="size-3.5 shrink-0 text-muted-foreground transition-transform"
            :class="expandedId === condition.id && 'rotate-180'"
          />
        </button>

        <Transition v-bind="drawerTransition()">
          <div v-show="expandedId === condition.id" class="px-3 pb-2">
            <ul class="space-y-1">
              <li
                v-for="(effect, index) in condition.effects"
                :key="index"
                class="font-fell text-caption text-muted-foreground"
              >
                {{ effect }}
              </li>
            </ul>
            <!-- Some patched entries carry prose rather than a parsed bullet
                 list; showing the raw description is better than a blank drawer. -->
            <p
              v-if="condition.effects.length === 0"
              class="font-fell text-caption text-muted-foreground whitespace-pre-line"
            >
              {{ condition.description }}
            </p>
          </div>
        </Transition>
      </li>
    </ul>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * The sixteen conditions, on the board (#764).
 *
 * The single most-consulted page of a paper DM screen, and in Grimoire it was
 * reachable only by leaving the dashboard for `/rules`. Names are always
 * visible so the card is scannable at a glance; the rules text is one tap
 * away, because sixteen full condition descriptions is a document, not a card.
 *
 * One open at a time, deliberately. An accordion that lets every row open at
 * once turns a fixed-height card into an unpredictable one, and the widget's
 * whole job is to sit in a grid cell without moving the widgets under it.
 *
 * Edition-aware through `useRuleset()`, and read through `getConditions()`
 * rather than the `srdConditions2014`/`2024` data modules — those are baked
 * per edition and the patches in `conditionPatches.ts` are applied on the way
 * out, so reading the raw modules would silently skip them.
 */
import { computed, ref } from "vue";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import { useRuleset } from "@/composables/useRuleset";
import { getConditions } from "@/rules/conditions";
import { IconChevronDown } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";

const { ruleset } = useRuleset();

const conditions = computed(() => getConditions(ruleset.value));

/** `null` for none open — the card's resting state, and the compact one. */
const expandedId = ref<string | null>(null);

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border" :class="toneClasses.border">
    <AppButton
      variant="menu"
      size="body"
      block
      class="min-h-12 gap-2 px-3 py-2"
      :class="toneClasses.bg"
      :aria-expanded="open"
      @click="open = !open"
    >
      <template v-if="icon" #icon>
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          :class="toneClasses.iconWrap"
        >
          <component :is="icon" class="h-4 w-4" aria-hidden="true" />
        </span>
      </template>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-cinzel text-body font-bold text-foreground">{{ title }}</span>
        <span v-if="caption" class="block truncate text-caption text-muted-foreground">{{ caption }}</span>
      </span>
      <IconChevronDown
        class="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200"
        :class="open && 'rotate-180'"
        aria-hidden="true"
      />
    </AppButton>
    <Transition v-bind="drawerTransition()">
      <div v-show="open" class="border-t px-3 pt-3 pb-3" :class="toneClasses.border">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * A collapsible "fold row" — icon · bold title · small caption · chevron, a
 * 48px header that discloses its content on tap (#872, "Quest Phone Frames",
 * frame 7's `.foldrow`). Shared by the run cockpit's DM-notes / held-payoff /
 * session rows (story C), the beat page (story B) and the site handoff
 * (story S) — one recipe rather than three copies of the same disclosure.
 *
 * `v-show`, not `v-if`, for the body: the same reason `NpcAccordionSection`
 * uses it — several callers wrap a panel that holds live state (the session
 * panel's disabled buttons, a held-payoff dispatch in flight), and rebuilding
 * it on every open would be wrong even where it wouldn't be visibly wrong.
 * `drawerTransition()` collapses the row's own border with the height, so the
 * rule under the header is never left hanging over nothing at rest.
 */
import { computed, type Component } from "vue";
import { drawerTransition } from "@/lib/motion";
import { IconChevronDown } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";

const { title, caption, icon, tone = "muted" } = defineProps<{
  title: string;
  caption?: string;
  icon?: Component;
  tone?: "muted" | "caution";
}>();
const open = defineModel<boolean>("open", { required: true });

const TONE_CLASSES = {
  muted: { border: "border-border", bg: "bg-card", iconWrap: "bg-primary/10 text-primary" },
  caution: { border: "border-tone-caution/50", bg: "bg-tone-caution/5", iconWrap: "bg-tone-caution/15 text-ink-caution" },
} as const;
const toneClasses = computed(() => TONE_CLASSES[tone]);
</script>

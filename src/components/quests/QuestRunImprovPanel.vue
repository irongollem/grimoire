<template>
  <section class="space-y-3 rounded-xl border border-tone-caution/40 bg-card p-3" aria-label="Improvise story beat">
    <div class="flex items-center gap-2">
      <div class="flex-1">
        <h2 class="font-cinzel text-sm font-bold text-foreground">Improvise a beat</h2>
        <p class="text-caption text-muted-foreground">Jot down what happened; the rest can wait until after the session.</p>
      </div>
      <AppButton label="Close" size="xs" variant="subtle" @click="emit('close')" />
    </div>

    <!--
      One field, and it is the only required one (#824).

      This used to ask for a title AND a reason before the button would enable,
      on a form that also shows kind, DM lead, reveal copy and two checkboxes —
      to be filled with the table waiting. Asked what he would actually do, the
      maintainer said: "make a note but not fill every field there, then try and
      get it sorted later." Everything below the fold is that "later", and the
      beat is already flagged for review by `is_improvised`, so nothing is lost
      by leaving it blank now.
    -->
    <AppInput v-model="title" placeholder="What just happened?" autofocus @keyup.enter="submit" />

    <div class="flex items-center justify-between gap-2">
      <AppButton
        :label="detailsOpen ? 'Hide details' : 'Add details'"
        size="xs"
        variant="ghost"
        :aria-expanded="detailsOpen"
        @click="detailsOpen = !detailsOpen"
      />
      <AppButton label="Capture & run" size="sm" variant="primary" :disabled="!title.trim()" @click="submit" />
    </div>

    <Transition v-bind="drawerTransition()">
      <div v-show="detailsOpen" class="space-y-2">
        <AppSelect v-model="kind">
          <option value="neutral">Story moment</option>
          <option value="social">Social</option>
          <option value="combat">Combat</option>
          <option value="explore">Explore</option>
          <option value="discovery">Discovery</option>
        </AppSelect>
        <!--
          Still offered, no longer demanded. The database now falls back to the
          title when this is blank, so the transition log keeps a reason on every
          jump without asking for the same answer twice.
        -->
        <AppInput v-model="reason" placeholder="Why did the story detour? (defaults to the title)" />
        <AppInput v-model="dmLead" placeholder="One-line DM note" />
        <AppInput v-model="revealText" placeholder="Player reveal copy" />
        <AppCheckbox v-model="pushReturn" label-role="caption" label="Offer a return to the current beat" />
        <AppCheckbox v-model="keepEdge" label-role="caption" label="Keep an “Improvised” edge in the authored graph" />
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { drawerTransition } from "@/lib/motion";

const emit = defineEmits<{ close: []; submit: [value: { title: string; kind: string; reason: string; dmLead: string; revealText: string; pushReturn: boolean; keepEdge: boolean }] }>();
const title = ref("");
const kind = ref("neutral");
const reason = ref("");
const dmLead = ref("");
const revealText = ref("");
const pushReturn = ref(true);
const keepEdge = ref(false);
const detailsOpen = ref(false);

function submit() {
  if (!title.value.trim()) return;
  emit("submit", {
    title: title.value.trim(),
    kind: kind.value,
    reason: reason.value.trim(),
    dmLead: dmLead.value.trim(),
    revealText: revealText.value.trim(),
    pushReturn: pushReturn.value,
    keepEdge: keepEdge.value,
  });
}
</script>

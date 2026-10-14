<template>
  <section class="rounded-lg border border-border bg-card">
    <div class="px-4 py-3">
      <AppButton
        variant="ghost"
        size="sm"
        :label="open ? 'Hide outreach email template' : 'Outreach email template'"
        :aria-expanded="open"
        @click="open = !open"
      />
    </div>
    <Transition v-bind="drawerTransition()">
      <div v-show="open" class="px-4 pb-4 space-y-3 border-t border-border pt-3">
        <p class="text-caption text-muted-foreground">
          The Email button on each account opens this in your own mail app, with the placeholders
          filled in for that account. It is saved in this browser only.
        </p>
        <AppInput v-model="draft.subject" size="body" tone="muted" placeholder="Subject" />
        <!-- Native <textarea> on purpose: the body goes into a mailto: link as
             plain text, so a rich editor would hand the mail app markup. -->
        <textarea
          v-model="draft.body"
          rows="14"
          aria-label="Email body"
          :class="cn(fieldVariants({ tone: 'muted', size: 'body' }), 'w-full resize-y')"
        />
        <ul class="space-y-1">
          <li v-for="p in OUTREACH_PLACEHOLDERS" :key="p.token" class="text-caption text-muted-foreground">
            <code class="text-foreground">{{ p.token }}</code> {{ p.meaning }}
          </li>
        </ul>
        <div class="flex flex-wrap items-center gap-2">
          <AppButton variant="primary" size="sm" label="Save" :disabled="!dirty" @click="save" />
          <AppButton variant="subtle" size="sm" label="Reset to default" @click="reset" />
          <p v-if="saved" class="text-caption text-muted-foreground" role="status">Saved</p>
        </div>
        <div class="rounded-md border border-border bg-muted/30 p-3 space-y-1">
          <p class="text-label text-muted-foreground">Preview for a sample account</p>
          <p class="text-body font-semibold text-foreground">{{ preview.subject }}</p>
          <p class="text-body text-foreground whitespace-pre-wrap">{{ preview.body }}</p>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
/**
 * Admin → Users: the wording of the outreach email. The tab owns the saved
 * template (`model`); this edits a draft of it and hands back a saved copy.
 */
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { fieldVariants } from "@/components/common/controls/fieldVariants";
import { drawerTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  DEFAULT_OUTREACH_TEMPLATE,
  OUTREACH_PLACEHOLDERS,
  renderOutreach,
  type OutreachTemplate,
} from "@/lib/admin/outreachEmail";

const model = defineModel<OutreachTemplate>({ required: true });
const emit = defineEmits<{ (e: "save", template: OutreachTemplate): void; (e: "reset"): void }>();

const open = ref(false);
const saved = ref(false);
const draft = reactive<OutreachTemplate>({ ...model.value });

watch(model, (next) => {
  draft.subject = next.subject;
  draft.body = next.body;
});

const dirty = computed(() => draft.subject !== model.value.subject || draft.body !== model.value.body);

// A fixed sample, so the preview does not change underneath the editor.
const SAMPLE = { display_name: "Mira", created_at: "2026-05-03T10:00:00Z", last_active_at: "2026-06-20T10:00:00Z" };
const preview = computed(() => renderOutreach(draft, SAMPLE));

function save() {
  model.value = { subject: draft.subject, body: draft.body };
  emit("save", { subject: draft.subject, body: draft.body });
  saved.value = true;
}

function reset() {
  draft.subject = DEFAULT_OUTREACH_TEMPLATE.subject;
  draft.body = DEFAULT_OUTREACH_TEMPLATE.body;
  emit("reset");
  saved.value = false;
}

watch(draft, () => {
  saved.value = false;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="close"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          class="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[90dvh]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bug-report-title"
        >
          <!-- Header -->
          <div
            class="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0"
          >
            <div
              class="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
              :class="
                isBug
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-gold-500/15 text-gold-400'
              "
            >
              <IconBug v-if="isBug" class="h-4 w-4" />
              <IconLightbulb v-else class="h-4 w-4" />
            </div>
            <div class="flex-1 min-w-0">
              <h2
                id="bug-report-title"
                class="font-cinzel text-sm font-bold text-foreground tracking-wide"
              >
                {{ isBug ? "Report a Bug" : "Request a Feature" }}
              </h2>
              <p class="text-caption text-muted-foreground mt-0.5">
                Your report opens a GitHub issue for the development team.
              </p>
            </div>
            <button
              class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Close"
              @click="close"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>

          <!-- Success state -->
          <div
            v-if="submitted"
            class="px-5 py-10 flex flex-col items-center gap-3 text-center"
          >
            <div
              class="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 text-green-400"
            >
              <IconCircleCheck class="h-6 w-6" />
            </div>
            <h3
              class="font-cinzel text-sm font-bold text-foreground tracking-wide"
            >
              {{ isBug ? "Bug Reported!" : "Feature Requested!" }}
            </h3>
            <p
              class="text-body text-muted-foreground max-w-xs leading-relaxed"
            >
              Thank you — issue #{{ issueNumber }} has been filed and the
              development team will look into it.
            </p>
            <AppButton variant="subtle" size="sm" label="Close" class="mt-2" @click="close" />
          </div>

          <!-- Form -->
          <form
            v-else
            class="overflow-y-auto flex-1 flex flex-col"
            @submit.prevent="submit"
          >
            <div class="px-5 py-4 space-y-4 flex-1">
              <!-- Type picker -->
              <div class="space-y-1.5">
                <label
                  class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                >
                  What kind of report?
                </label>
                <div
                  class="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Report type"
                >
                  <AppButton
                    v-for="opt in KIND_OPTIONS"
                    :key="opt.value"
                    role="radio"
                    :aria-checked="kind === opt.value"
                    variant="subtle"
                    size="md"
                    :active="kind === opt.value"
                    :icon="opt.icon"
                    icon-size="md"
                    :label="opt.label"
                    @click="kind = opt.value"
                  />
                </div>
                <p class="text-caption-sm text-muted-foreground">
                  {{
                    isBug
                      ? "Something is broken or not working as it should."
                      : "An idea or improvement you'd like to see added."
                  }}
                </p>
              </div>

              <!-- Where (both types) -->
              <div class="space-y-1.5">
                <label
                  class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                >
                  Where in the app?
                  <span
                    v-if="!isBug"
                    class="font-fell text-muted-foreground normal-case tracking-normal font-normal"
                    >(optional)</span
                  >
                </label>
                <AppInput
                  v-model="form.where"
                  type="text"
                  :required="isBug"
                  size="body"
                  placeholder="e.g. Encounter tracker, NPC detail page…"
                />
              </div>

              <!-- Bug-specific fields -->
              <template v-if="isBug">
                <div class="space-y-1.5">
                  <label
                    class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                  >
                    What were you doing?
                  </label>
                  <textarea
                    v-model="form.action"
                    required
                    rows="2"
                    placeholder="Describe the steps that led to the bug…"
                    class="w-full px-3 py-2 rounded-md bg-background border border-border text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                  />
                </div>

                <div class="space-y-1.5">
                  <label
                    class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                  >
                    What did you expect?
                  </label>
                  <textarea
                    v-model="form.expected"
                    required
                    rows="2"
                    placeholder="What should have happened…"
                    class="w-full px-3 py-2 rounded-md bg-background border border-border text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                  />
                </div>

                <div class="space-y-1.5">
                  <label
                    class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                  >
                    What actually happened?
                  </label>
                  <textarea
                    v-model="form.actual"
                    required
                    rows="2"
                    placeholder="Describe what went wrong…"
                    class="w-full px-3 py-2 rounded-md bg-background border border-border text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                  />
                </div>
              </template>

              <!-- Feature-specific fields -->
              <template v-else>
                <div class="space-y-1.5">
                  <label
                    class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                  >
                    What would you like to see?
                  </label>
                  <textarea
                    v-model="form.summary"
                    required
                    rows="2"
                    placeholder="Describe the feature or improvement…"
                    class="w-full px-3 py-2 rounded-md bg-background border border-border text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                  />
                </div>

                <div class="space-y-1.5">
                  <label
                    class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                  >
                    What problem would it solve?
                  </label>
                  <textarea
                    v-model="form.problem"
                    required
                    rows="2"
                    placeholder="Why is this useful? What does it make easier…"
                    class="w-full px-3 py-2 rounded-md bg-background border border-border text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                  />
                </div>
              </template>

              <!-- Screenshot -->
              <div class="space-y-1.5">
                <label
                  class="font-cinzel text-xs font-semibold text-foreground tracking-wide"
                >
                  Screenshot
                  <span
                    class="font-fell text-muted-foreground normal-case tracking-normal font-normal"
                    >(optional)</span
                  >
                </label>
                <div
                  v-if="screenshotPreview"
                  class="relative rounded-md overflow-hidden border border-border bg-background"
                >
                  <img
                    :src="screenshotPreview"
                    alt="Screenshot preview"
                    class="w-full max-h-40 object-contain"
                  />
                  <button
                    type="button"
                    class="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-card/90 border border-border text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Remove screenshot"
                    @click="clearScreenshot"
                  >
                    <IconClose class="h-3 w-3" />
                  </button>
                </div>
                <label
                  v-else
                  class="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-caption text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
                >
                  <IconAddImage class="h-4 w-4 shrink-0" />
                  <span>Add screenshot</span>
                  <input
                    ref="fileInputRef"
                    type="file"
                    accept="image/*"
                    class="sr-only"
                    @change="handleFileChange"
                  />
                </label>
              </div>
            </div>

            <!-- Footer -->
            <div
              class="flex items-center gap-3 px-5 py-4 border-t border-border shrink-0"
            >
              <p v-if="error" class="flex-1 text-caption text-destructive">
                {{ error }}
              </p>
              <div v-else class="flex-1" />
              <AppButton variant="subtle" size="sm" label="Cancel" @click="close" />
              <AppButton
                type="submit"
                variant="primary"
                size="sm"
                :loading="submitting"
                :label="submitting ? 'Submitting…' : isBug ? 'Submit Report' : 'Submit Request'"
              />
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IconAddImage,
  IconBug,
  IconCircleCheck,
  IconClose,
  IconLightbulb,
} from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { supabase } from "@/lib/supabase";

type ReportKind = "bug" | "feature";

const KIND_OPTIONS = [
  { value: "bug", label: "Bug", icon: IconBug },
  { value: "feature", label: "Feature request", icon: IconLightbulb },
] as const;

const open = defineModel<boolean>({ required: true });

const kind = ref<ReportKind>("bug");
const isBug = computed(() => kind.value === "bug");

const form = ref({
  where: "",
  action: "",
  expected: "",
  actual: "",
  summary: "",
  problem: "",
});
const screenshotPreview = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const submitting = ref(false);
const submitted = ref(false);
const error = ref("");
const issueNumber = ref<number | null>(null);

function close() {
  open.value = false;
  setTimeout(reset, 200);
}

function reset() {
  kind.value = "bug";
  form.value = {
    where: "",
    action: "",
    expected: "",
    actual: "",
    summary: "",
    problem: "",
  };
  screenshotPreview.value = null;
  submitting.value = false;
  submitted.value = false;
  error.value = "";
  issueNumber.value = null;
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  compressImage(file).then((dataUrl) => {
    screenshotPreview.value = dataUrl;
  });
}

function clearScreenshot() {
  screenshotPreview.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
}

// Resize to max 1200px wide and compress to JPEG to keep the payload small.
function compressImage(
  file: File,
  maxWidth = 1200,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = URL.createObjectURL(file);
  });
}

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    // No identity is sent: the issue this becomes is filed on a public repo, and
    // the reporter is recorded server-side from the JWT instead (#633). The
    // filename went with it — it only ever named a storage object, and the
    // screenshot no longer becomes one (#634).
    const body = isBug.value
      ? {
          kind: "bug" as const,
          where: form.value.where,
          action: form.value.action,
          expected: form.value.expected,
          actual: form.value.actual,
          screenshot: screenshotPreview.value ?? undefined,
        }
      : {
          kind: "feature" as const,
          where: form.value.where,
          summary: form.value.summary,
          problem: form.value.problem,
          screenshot: screenshotPreview.value ?? undefined,
        };
    const { data, error: fnError } = await supabase.functions.invoke(
      "create-bug-report",
      { body },
    );
    if (fnError) throw fnError;
    issueNumber.value = (data as { issueNumber: number })?.issueNumber ?? null;
    submitted.value = true;
  } catch (e) {
    error.value = "Something went wrong — please try again.";
    console.error("Bug report submit error:", e);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>

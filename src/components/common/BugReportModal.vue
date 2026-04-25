<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="modelValue"
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
          <div class="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/15 text-destructive shrink-0">
              <Bug class="h-4 w-4" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 id="bug-report-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide">
                Report a Bug
              </h2>
              <p class="font-fell text-xs text-muted-foreground mt-0.5">
                Your report opens a GitHub issue for the development team.
              </p>
            </div>
            <button
              class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Close"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Success state -->
          <div v-if="submitted" class="px-5 py-10 flex flex-col items-center gap-3 text-center">
            <div class="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 text-green-400">
              <CircleCheck class="h-6 w-6" />
            </div>
            <h3 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Bug Reported!</h3>
            <p class="font-fell text-sm text-muted-foreground max-w-xs leading-relaxed">
              Thank you — issue #{{ issueNumber }} has been filed and the development team will look into it.
            </p>
            <button
              class="mt-2 px-4 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
              @click="close"
            >
              Close
            </button>
          </div>

          <!-- Form -->
          <form v-else class="overflow-y-auto flex-1 flex flex-col" @submit.prevent="submit">
            <div class="px-5 py-4 space-y-4 flex-1">
              <div class="space-y-1.5">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  Where in the app?
                </label>
                <input
                  v-model="form.where"
                  type="text"
                  required
                  placeholder="e.g. Encounter tracker, NPC detail page…"
                  class="w-full px-3 py-2 rounded-md bg-background border border-border text-sm font-fell text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>

              <div class="space-y-1.5">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  What were you doing?
                </label>
                <textarea
                  v-model="form.action"
                  required
                  rows="2"
                  placeholder="Describe the steps that led to the bug…"
                  class="w-full px-3 py-2 rounded-md bg-background border border-border text-sm font-fell text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                />
              </div>

              <div class="space-y-1.5">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  What did you expect?
                </label>
                <textarea
                  v-model="form.expected"
                  required
                  rows="2"
                  placeholder="What should have happened…"
                  class="w-full px-3 py-2 rounded-md bg-background border border-border text-sm font-fell text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                />
              </div>

              <div class="space-y-1.5">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  What actually happened?
                </label>
                <textarea
                  v-model="form.actual"
                  required
                  rows="2"
                  placeholder="Describe what went wrong…"
                  class="w-full px-3 py-2 rounded-md bg-background border border-border text-sm font-fell text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 resize-none"
                />
              </div>

              <!-- Screenshot -->
              <div class="space-y-1.5">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  Screenshot
                  <span class="font-fell text-muted-foreground normal-case tracking-normal font-normal">(optional)</span>
                </label>
                <div v-if="screenshotPreview" class="relative rounded-md overflow-hidden border border-border bg-background">
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
                    <X class="h-3 w-3" />
                  </button>
                </div>
                <label
                  v-else
                  class="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-xs font-fell text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
                >
                  <ImagePlus class="h-4 w-4 shrink-0" />
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
            <div class="flex items-center gap-3 px-5 py-4 border-t border-border shrink-0">
              <p v-if="error" class="flex-1 font-fell text-xs text-destructive">{{ error }}</p>
              <div v-else class="flex-1" />
              <button
                type="button"
                class="px-4 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
                @click="close"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="submitting"
                class="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Loader2 v-if="submitting" class="h-3 w-3 animate-spin" />
                <span>{{ submitting ? "Submitting…" : "Submit Report" }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { X, Bug, ImagePlus, Loader2, CircleCheck } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [val: boolean] }>();

const auth = useAuthStore();

const form = ref({ where: "", action: "", expected: "", actual: "" });
const screenshotFile = ref<File | null>(null);
const screenshotPreview = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const submitting = ref(false);
const submitted = ref(false);
const error = ref("");
const issueNumber = ref<number | null>(null);

function close() {
  emit("update:modelValue", false);
  setTimeout(reset, 200);
}

function reset() {
  form.value = { where: "", action: "", expected: "", actual: "" };
  screenshotFile.value = null;
  screenshotPreview.value = null;
  submitting.value = false;
  submitted.value = false;
  error.value = "";
  issueNumber.value = null;
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  screenshotFile.value = file;
  compressImage(file).then((dataUrl) => {
    screenshotPreview.value = dataUrl;
  });
}

function clearScreenshot() {
  screenshotFile.value = null;
  screenshotPreview.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
}

// Resize to max 1200px wide and compress to JPEG to keep the payload small.
function compressImage(file: File, maxWidth = 1200, quality = 0.85): Promise<string> {
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
    const submittedBy = auth.membership?.display_name || auth.userEmail || undefined;
    const { data, error: fnError } = await supabase.functions.invoke("create-bug-report", {
      body: {
        where: form.value.where,
        action: form.value.action,
        expected: form.value.expected,
        actual: form.value.actual,
        screenshot: screenshotPreview.value ?? undefined,
        screenshotName: screenshotFile.value?.name,
        submittedBy,
      },
    });
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
  transition: transform 0.15s ease, opacity 0.15s ease;
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

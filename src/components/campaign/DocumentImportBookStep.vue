<template>
  <div class="space-y-4">
    <p v-if="books.length === 0 && !booksLoading" class="text-body text-muted-foreground italic">
      This campaign has no Scriptorium book yet. Write one in the Scriptorium, then take it apart here.
    </p>

    <template v-else>
      <div class="space-y-1">
        <label class="block text-eyebrow font-semibold text-muted-foreground" for="import-book-pick">Book *</label>
        <AppSelect id="import-book-pick" v-model="bookId" tone="filled" size="body" weight="normal" block>
          <option value="">Choose a book…</option>
          <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title }}</option>
        </AppSelect>
      </div>

      <div v-if="bookId" class="space-y-2">
        <LoadingSpinner v-if="chaptersLoading" />
        <p v-else-if="chapters.length === 0" class="text-caption text-muted-foreground italic">This book has no chapters.</p>
        <template v-else>
          <div class="flex items-center justify-between">
            <span class="text-eyebrow font-semibold text-muted-foreground">Chapters to read</span>
            <AppButton variant="link" size="inline" :label="allTicked ? 'Clear' : 'Tick all'" @click="toggleAll" />
          </div>
          <div class="rounded-md border border-border divide-y divide-border">
            <div v-for="chapter in chapters" :key="chapter.id" class="px-3 py-2">
              <AppCheckbox
                :model-value="ticked.has(chapter.id)"
                size="md"
                :label="chapter.title.trim() || 'Untitled chapter'"
                @update:model-value="(on) => tick(chapter.id, on)"
              />
            </div>
          </div>
        </template>
      </div>

      <DocumentImportSizeNote
        v-if="selected.length > 0 || bookId"
        :char-count="size.charCount"
        :page-count="size.pageCount"
        :validation="size.validation"
        empty-hint="Tick a chapter to see its page count and cost."
      />
      <p v-if="namesError" class="text-caption text-destructive">
        The names of the things this book links to could not be read, so it cannot be imported right now.
      </p>

      <div>
        <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">Name *</label>
        <AppInput v-model="displayName" tone="muted" size="body" />
      </div>

      <AppCheckbox v-model="rightsAttested" size="md" label="I have the right to use this material." />
      <AppCheckbox v-model="ownWriting" size="md" label="This is my own writing" />
      <p class="-mt-2 text-caption text-muted-foreground">
        Kept word for word. Leave it off for a published book you copied into the Scriptorium: its scenes are put in other words, in full.
      </p>
      <p class="text-caption text-muted-foreground">
        Things the book links to are not made again: the import finds them by name and links to them.
      </p>

      <p v-if="submitError" class="text-caption text-destructive">{{ submitError }}</p>

      <div class="flex justify-end pt-2">
        <AppButton
          variant="primary"
          size="md"
          label="Start import"
          :icon="IconGenerate"
          :loading="createImport.isPending.value"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The "a book from your Scriptorium" source of the document importer (#1226 story 7, frame 10): pick a book, tick
 * its chapters, and they are read as the text of one import. Like the paste step it is self-contained and runs its
 * own `useCreateDocumentImport` mutation through the `text` source, so nothing about the staging row changes and the
 * parent swaps this step for the pending view by itself once the row exists.
 *
 * What a book's blocks become (a link a name, a secret kept, a cover dropped) and what the selection costs are
 * `bookSource.ts`; the names a link points at are read by `useBookEmbedNames`.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import DocumentImportSizeNote from "@/components/campaign/DocumentImportSizeNote.vue";
import { IconGenerate } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateDocumentImport } from "@/composables/campaign/useDocumentImport";
import { useBookEmbedNames } from "@/composables/campaign/useBookEmbedNames";
import { useBookChaptersFull } from "@/scriptorium/composables/useScriptoriumChapters";
import { useScriptoriumDocuments } from "@/scriptorium/composables/useScriptorium";
import { bookImportName, bookSelectionSize, embedRefsOf, importableBooks, type BookChapterSource } from "@/lib/documentImport/bookSource";

const toast = useToast();
const campaign = useCampaignStore();
const { isPro } = useSubscription();
const createImport = useCreateDocumentImport();

// ── The book and its chapters ────────────────────────────────────────────

const documents = useScriptoriumDocuments();
const booksLoading = computed(() => documents.isLoading.value);
const books = computed(() => {
  const campaignId = campaign.activeCampaignId;
  return campaignId ? importableBooks(documents.data.value ?? [], campaignId) : [];
});

const bookId = ref("");
const chaptersQuery = useBookChaptersFull(bookId);
const chaptersLoading = computed(() => !!bookId.value && chaptersQuery.isLoading.value);
const chapters = computed<BookChapterSource[]>(() => chaptersQuery.data.value ?? []);

const ticked = ref<ReadonlySet<string>>(new Set());
watch(
  () => chapters.value.map((chapter) => chapter.id).join(","),
  () => {
    // A book's chapters arrive ticked: taking a book apart is the common case, and unticking is one click.
    ticked.value = new Set(chapters.value.map((chapter) => chapter.id));
  },
);
const allTicked = computed(() => chapters.value.length > 0 && ticked.value.size === chapters.value.length);
function tick(id: string, on: boolean) {
  const next = new Set(ticked.value);
  if (on) next.add(id);
  else next.delete(id);
  ticked.value = next;
}
function toggleAll() {
  ticked.value = allTicked.value ? new Set() : new Set(chapters.value.map((chapter) => chapter.id));
}

const selected = computed(() => chapters.value.filter((chapter) => ticked.value.has(chapter.id)));

// ── What the selection reads as, and costs ───────────────────────────────

const namesQuery = useBookEmbedNames(() => embedRefsOf(selected.value));
const namesError = computed(() => namesQuery.isError.value);
const namesReady = computed(() => !namesQuery.isFetching.value && !namesQuery.isError.value);
const size = computed(() => bookSelectionSize(selected.value, namesQuery.data.value ?? new Map(), isPro.value));

// ── Name / rights / submit ───────────────────────────────────────────────

const bookTitle = computed(() => books.value.find((book) => book.id === bookId.value)?.title ?? "");
const displayName = ref("");
watch(bookTitle, (title) => {
  displayName.value = title ? bookImportName(title) : "";
});
const rightsAttested = ref(false);
// A book in the Scriptorium is the DM's own writing unless they say they copied a published one in.
const ownWriting = ref(true);
const submitError = ref<string | null>(null);

const canSubmit = computed(
  () =>
    size.value.charCount > 0 &&
    size.value.validation?.ok === true &&
    namesReady.value &&
    rightsAttested.value &&
    displayName.value.trim().length > 0 &&
    !createImport.isPending.value,
);

function resetForm() {
  bookId.value = "";
  displayName.value = "";
  rightsAttested.value = false;
  ownWriting.value = true;
  submitError.value = null;
}

async function submit() {
  if (!canSubmit.value) return;
  submitError.value = null;
  try {
    await createImport.mutateAsync({
      files: [],
      sourceKind: "text",
      sourceText: size.value.markdown,
      displayName: displayName.value.trim(),
      pageCount: size.value.pageCount,
      rightsAttested: rightsAttested.value,
      ownWriting: ownWriting.value,
    });
    resetForm();
  } catch (err) {
    submitError.value = toast.fromError(err, "Could not start the import.");
  }
}
</script>

<template>
  <div class="max-w-xl space-y-6">

    <!-- ── Phase: Categories ───────────────────────────────────────────────── -->
    <template v-if="phase === 'categories'">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Create World Bundle</h3>
        <p class="font-fell text-sm text-muted-foreground italic mt-1">
          Select which entity types to include. You'll choose specific entities from each category
          in the next steps.
        </p>
      </div>

      <div class="rounded-md border border-border divide-y divide-border">
        <div
          v-for="group in typeGroups"
          :key="group.label"
        >
          <p class="text-eyebrow font-semibold text-muted-foreground px-4 py-2 bg-muted/30">
            {{ group.label }}
          </p>
          <div class="px-4 py-3 space-y-2.5">
            <label
              v-for="type in group.types"
              :key="type.key"
              class="flex items-center gap-2.5 group"
              :class="isLocked(type.key) ? 'cursor-not-allowed' : 'cursor-pointer'"
            >
              <input
                type="checkbox"
                :checked="selectedCategories.has(type.key)"
                :disabled="isLocked(type.key)"
                class="h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring disabled:opacity-60"
                @change="toggleCategory(type.key)"
              />
              <span
                class="font-fell text-sm transition-colors"
                :class="isLocked(type.key) ? 'text-muted-foreground' : 'text-foreground group-hover:text-primary'"
              >
                {{ type.label }}
              </span>
              <span
                v-if="isLocked(type.key)"
                class="font-cinzel text-2xs tracking-wider text-primary/60"
              >
                required by Characters
              </span>
            </label>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2">
        <button
          class="flex items-center gap-2 px-4 py-2 font-cinzel text-xs font-semibold tracking-wider border border-border text-foreground rounded-md hover:bg-muted transition-colors"
          @click="importOpen = true"
        >
          <IconUpload class="h-3.5 w-3.5" />
          Import .grimoire
        </button>
        <button
          :disabled="selectedCategories.size === 0"
          class="flex items-center gap-2 px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="goToFirstPick"
        >
          Continue
          <IconChevronRight class="h-3.5 w-3.5" />
        </button>
      </div>
    </template>

    <!-- ── Phase: Entity Picker ────────────────────────────────────────────── -->
    <template v-else-if="phase === 'pick'">
      <!-- Progress header -->
      <div class="flex items-center gap-3">
        <button
          class="text-muted-foreground hover:text-foreground transition-colors"
          @click="goBack"
        >
          <IconChevronLeft class="h-4 w-4" />
        </button>
        <div>
          <p class="text-eyebrow font-semibold text-muted-foreground">
            Step {{ pickIndex + 2 }} of {{ orderedCategories.length + 2 }}
          </p>
          <h3 class="font-cinzel text-sm font-semibold text-foreground">
            {{ currentTypeDef?.label }}
          </h3>
        </div>
        <div class="ml-auto flex gap-1">
          <span
            v-for="(_, i) in orderedCategories"
            :key="i"
            class="h-1.5 w-5 rounded-full transition-colors"
            :class="i === pickIndex ? 'bg-primary' : i < pickIndex ? 'bg-primary/40' : 'bg-muted'"
          />
        </div>
      </div>

      <!-- IconSearch -->
      <div class="relative">
        <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          v-model="search"
          type="text"
          placeholder="Search…"
          class="w-full bg-muted border border-border rounded-md pl-8 pr-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Controls -->
      <div class="flex items-center justify-between">
        <span class="font-fell text-xs text-muted-foreground">
          <template v-if="pickerLoading">Loading…</template>
          <template v-else>
            {{ currentSelection.size }} of {{ pickerItems?.length ?? 0 }} selected
          </template>
        </span>
        <div class="flex gap-2">
          <button
            class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            @click="selectAll"
          >
            All
          </button>
          <span class="text-border">·</span>
          <button
            class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            @click="selectNone"
          >
            None
          </button>
        </div>
      </div>

      <!-- Entity list -->
      <div class="rounded-md border border-border overflow-hidden">
        <div v-if="pickerLoading" class="px-4 py-6 text-center">
          <p class="font-fell text-sm text-muted-foreground italic">Loading…</p>
        </div>
        <div v-else-if="!filteredItems.length" class="px-4 py-6 text-center">
          <p class="font-fell text-sm text-muted-foreground italic">
            {{ search ? "No results for your search." : "No entities found in this category." }}
          </p>
        </div>
        <div v-else class="max-h-72 overflow-y-auto divide-y divide-border">
          <label
            v-for="item in filteredItems"
            :key="item.id"
            class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input
              type="checkbox"
              :checked="currentSelection.has(item.id)"
              class="h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring shrink-0"
              @change="toggleEntity(item.id)"
            />
            <span class="font-fell text-sm text-foreground truncate">{{ item.label }}</span>
          </label>
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-end gap-2 pt-2">
        <button
          class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider border border-border text-muted-foreground hover:text-foreground rounded-md transition-colors"
          @click="goBack"
        >
          Back
        </button>
        <button
          class="flex items-center gap-2 px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          @click="goNext"
        >
          {{ isLastPick ? "Continue to Details" : "Next" }}
          <IconChevronRight class="h-3.5 w-3.5" />
        </button>
      </div>
    </template>

    <!-- ── Phase: Metadata + Export ────────────────────────────────────────── -->
    <template v-else-if="phase === 'metadata'">
      <div class="flex items-center gap-3">
        <button
          class="text-muted-foreground hover:text-foreground transition-colors"
          @click="goBack"
        >
          <IconChevronLeft class="h-4 w-4" />
        </button>
        <div>
          <p class="text-eyebrow font-semibold text-muted-foreground">
            Final step
          </p>
          <h3 class="font-cinzel text-sm font-semibold text-foreground">Bundle Details</h3>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">
            Bundle Name *
          </label>
          <input
            v-model="bundleName"
            type="text"
            placeholder="e.g. The Sunken Duchy"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">
            Description
          </label>
          <textarea
            v-model="bundleDescription"
            rows="2"
            placeholder="A brief description for whoever imports this bundle…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
      </div>

      <!-- Selection summary -->
      <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
        <p class="text-eyebrow font-semibold text-muted-foreground">
          Bundle Contents
        </p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <template v-for="type in orderedCategories" :key="type">
            <span class="font-fell text-xs text-muted-foreground">
              {{ typeDef(type)?.label }}
            </span>
            <span class="font-cinzel text-xs font-semibold text-foreground text-right">
              {{ entitySelections[type]?.size ?? 0 }}
            </span>
          </template>
        </div>
        <p class="font-fell text-xs text-muted-foreground italic pt-1">
          Player visibility flags and party-member links are cleared on import.
        </p>
      </div>

      <p v-if="exportError" class="font-fell text-xs text-destructive">{{ exportError }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <button
          class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider border border-border text-muted-foreground hover:text-foreground rounded-md transition-colors"
          @click="goBack"
        >
          Back
        </button>
        <label
          class="flex items-center gap-2 px-4 py-2 font-cinzel text-xs font-semibold tracking-wider border border-border text-foreground rounded-md hover:bg-muted transition-colors cursor-pointer"
          :class="{ 'opacity-50 pointer-events-none': isAttaching || !bundleName.trim() || totalSelected === 0 }"
          title="Embed the selected campaign data into a PDF you exported from Scriptorium, so importing that PDF populates a campaign"
        >
          <IconUpload class="h-3.5 w-3.5" />
          {{ isAttaching ? "Attaching…" : "Attach to PDF…" }}
          <input
            type="file"
            accept=".pdf,application/pdf"
            class="sr-only"
            :disabled="isAttaching || !bundleName.trim() || totalSelected === 0"
            @change="onAttachPdf"
          />
        </label>
        <button
          :disabled="isExporting || !bundleName.trim() || totalSelected === 0"
          class="flex items-center gap-2 px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="doExport"
        >
          <IconDownload class="h-3.5 w-3.5" />
          {{ isExporting ? "Exporting…" : "Export .grimoire" }}
        </button>
      </div>
    </template>

    <ImportBundleModal v-model="importOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef, watch } from "vue";
import { IconChevronLeft, IconChevronRight, IconDownload, IconSearch, IconUpload } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import {
  useExportWorldBundle,
  useEntityPickerItems,
  buildBundle,
  BUNDLE_ENTITY_TYPES,
} from "@/composables/useWorldBundle";
import type { BundleEntityKey } from "@/composables/useWorldBundle";
import ImportBundleModal from "@/components/campaign/ImportBundleModal.vue";

const campaignStore = useCampaignStore();
const authStore = useAuthStore();

// ── Wizard state ─────────────────────────────────────────────────────────────

type Phase = "categories" | "pick" | "metadata";
const phase = ref<Phase>("categories");
const pickIndex = ref(0);

const selectedCategories = shallowRef<Set<BundleEntityKey>>(new Set());
const entitySelections = shallowRef<Partial<Record<BundleEntityKey, Set<string>>>>({});

const bundleName = ref("");
const bundleDescription = ref("");
const importOpen = ref(false);
const exportError = ref<string | null>(null);
const search = ref("");

// ── Type helpers ──────────────────────────────────────────────────────────────

const typeGroups = computed(() => [
  {
    label: "Campaign Content",
    types: BUNDLE_ENTITY_TYPES.filter((t) => t.scope === "campaign"),
  },
  {
    label: "Your Library",
    types: BUNDLE_ENTITY_TYPES.filter((t) => t.scope === "library"),
  },
]);

function typeDef(key: BundleEntityKey) {
  return BUNDLE_ENTITY_TYPES.find((t) => t.key === key);
}

// Ordered list of selected categories (preserves BUNDLE_ENTITY_TYPES order)
const orderedCategories = computed<BundleEntityKey[]>(() =>
  BUNDLE_ENTITY_TYPES.map((t) => t.key).filter((k) => selectedCategories.value.has(k)),
);

const currentPickKey = computed<BundleEntityKey | null>(() =>
  phase.value === "pick" ? (orderedCategories.value[pickIndex.value] ?? null) : null,
);

const currentTypeDef = computed(() =>
  currentPickKey.value ? typeDef(currentPickKey.value) : null,
);

const isLastPick = computed(
  () => pickIndex.value === orderedCategories.value.length - 1,
);

// ── Entity picker query ───────────────────────────────────────────────────────

const campaignIdRef = computed(() => campaignStore.activeCampaignId);
const { data: pickerItems, isLoading: pickerLoading } = useEntityPickerItems(
  currentPickKey,
  campaignIdRef,
);

const filteredItems = computed(() => {
  const q = search.value.toLowerCase();
  return q
    ? (pickerItems.value ?? []).filter((i) => i.label.toLowerCase().includes(q))
    : (pickerItems.value ?? []);
});

// Current selection for the active pick step
const currentSelection = computed(() =>
  entitySelections.value[currentPickKey.value!] ?? new Set<string>(),
);

// Reset search when moving to a new type
watch(currentPickKey, () => { search.value = ""; });

// ── Category toggle ───────────────────────────────────────────────────────────

// Characters import as broken without their species + spells, so selecting
// Characters force-includes and hard-locks those categories.
const CHARACTER_DEPENDENCIES: BundleEntityKey[] = [
  "species", "spells", "custom_classes", "custom_subclasses",
];

function isLocked(key: BundleEntityKey): boolean {
  return CHARACTER_DEPENDENCIES.includes(key) && selectedCategories.value.has("party_members");
}

function toggleCategory(key: BundleEntityKey) {
  if (isLocked(key)) return; // hard-locked while Characters is selected
  const next = new Set(selectedCategories.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
    // Selecting Characters auto-includes their required dependencies.
    if (key === "party_members") {
      for (const dep of CHARACTER_DEPENDENCIES) next.add(dep);
    }
  }
  selectedCategories.value = next;
}

// ── Entity selection ──────────────────────────────────────────────────────────

function toggleEntity(id: string) {
  const key = currentPickKey.value!;
  const current = entitySelections.value[key] ?? new Set<string>();
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  entitySelections.value = { ...entitySelections.value, [key]: next };
}

function selectAll() {
  const key = currentPickKey.value!;
  entitySelections.value = {
    ...entitySelections.value,
    [key]: new Set((pickerItems.value ?? []).map((i) => i.id)),
  };
}

function selectNone() {
  const key = currentPickKey.value!;
  entitySelections.value = { ...entitySelections.value, [key]: new Set() };
}

const totalSelected = computed(() =>
  Object.values(entitySelections.value).reduce((sum, s) => sum + (s?.size ?? 0), 0),
);

// ── Navigation ────────────────────────────────────────────────────────────────

function goToFirstPick() {
  pickIndex.value = 0;
  phase.value = "pick";
}

function goNext() {
  if (isLastPick.value) {
    phase.value = "metadata";
  } else {
    pickIndex.value++;
  }
}

function goBack() {
  if (phase.value === "metadata") {
    pickIndex.value = orderedCategories.value.length - 1;
    phase.value = "pick";
  } else if (phase.value === "pick") {
    if (pickIndex.value > 0) {
      pickIndex.value--;
    } else {
      phase.value = "categories";
    }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

const { mutateAsync: runExport, isPending: isExporting } = useExportWorldBundle();
const isAttaching = ref(false);

/** Selected entities as a {type → ids} map, shared by .grimoire export + PDF attach. */
function currentSelectionMap(): Map<BundleEntityKey, string[]> {
  const selectionMap = new Map<BundleEntityKey, string[]>();
  for (const key of orderedCategories.value) {
    const sel = entitySelections.value[key];
    if (sel && sel.size > 0) selectionMap.set(key, [...sel]);
  }
  return selectionMap;
}

async function doExport() {
  const campaignId = campaignStore.activeCampaignId;
  if (!campaignId) return;
  exportError.value = null;
  try {
    await runExport({
      campaignId,
      name: bundleName.value.trim(),
      description: bundleDescription.value.trim(),
      author: authStore.user?.email ?? undefined,
      selection: currentSelectionMap(),
    });
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : "Export failed";
  }
}

/**
 * Embed the selected campaign data into a PDF the user exported from Scriptorium
 * (Phase E, #329) — interim flow: print → save the PDF, then attach the bundle
 * here and re-download a single shareable file.
 */
async function onAttachPdf(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow re-picking the same file
  const campaignId = campaignStore.activeCampaignId;
  if (!file || !campaignId) return;
  exportError.value = null;
  isAttaching.value = true;
  try {
    const bundle = await buildBundle({
      campaignId,
      name: bundleName.value.trim(),
      description: bundleDescription.value.trim(),
      author: authStore.user?.email ?? undefined,
      selection: currentSelectionMap(),
    });
    const { attachBundleToPdf } = await import("@/lib/scriptorium/campaignBundlePdf");
    const out = await attachBundleToPdf(new Uint8Array(await file.arrayBuffer()), bundle);
    const blob = new Blob([out as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.name.replace(/\.pdf$/i, "")}-grimoire.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : "Could not attach campaign data to the PDF";
  } finally {
    isAttaching.value = false;
  }
}
</script>

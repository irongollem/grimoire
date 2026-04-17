<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <Trash2 class="h-3.5 w-3.5" />Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <Pencil class="h-3.5 w-3.5" />Edit
      </button>
    </div>

    <!-- Identity card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex gap-4">
        <div class="shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
          <FocalImage
            v-if="background.image_url"
            :src="background.image_url"
            :alt="background.name"
            format="portrait"
            :focal-point="background.focal_point ?? null"
            class="w-full h-full"
          />
          <User2 v-else class="h-8 w-8 text-muted-foreground/30" />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <h1 class="font-cinzel text-xl font-bold text-foreground leading-tight">{{ background.name }}</h1>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-if="background.source_title || background.source"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ background.source_title ?? background.source }}</span>
          </div>
          <p
            v-if="background.open5e_import"
            class="font-fell text-xs text-muted-foreground italic"
          >
            Imported from Open5e
          </p>
        </div>
      </div>
    </div>

    <!-- Proficiencies card -->
    <div
      v-if="background.skill_proficiencies.length || background.tool_proficiencies.length || background.languages.length"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Proficiencies</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div v-if="background.skill_proficiencies.length">
          <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Skills</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="s in background.skill_proficiencies"
              :key="s"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ s }}</span>
          </div>
        </div>
        <div v-if="background.tool_proficiencies.length">
          <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Tools</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="t in background.tool_proficiencies"
              :key="t"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ t }}</span>
          </div>
        </div>
        <div v-if="background.languages.length">
          <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Languages</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="l in background.languages"
              :key="l"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ l }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tags card -->
    <div v-if="background.tags.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Tags</span>
      </div>
      <div class="p-4 flex flex-wrap gap-1">
        <span
          v-for="tag in background.tags"
          :key="tag"
          class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
        >{{ tag }}</span>
      </div>
    </div>

    <!-- Description card -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="background.description" />
      </div>
    </div>

    <!-- Equipment card -->
    <div v-if="hasEquipment" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Starting Equipment</span>
        <div class="flex items-center gap-2">
          <span
            v-if="grantDone"
            class="font-cinzel text-[10px] tracking-wider text-emerald-500"
          >Added!</span>
          <button
            v-if="hasCampaign"
            type="button"
            class="inline-flex items-center gap-1 font-cinzel text-[10px] tracking-wider text-primary hover:text-primary/80 transition-colors"
            @click="openLootbox"
          >
            <PackagePlus class="h-3.5 w-3.5" />
            Grant
          </button>
        </div>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <RichTextViewer :content="background.equipment" />

        <!-- Lootbox expansion -->
        <div v-if="lootboxOpen" class="flex flex-col gap-3 border-t border-border pt-3">
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Grant to</span>
            <EntityCombobox
              v-model="selectedMemberId"
              :options="memberOptions"
              placeholder="Party stash (unassigned)"
            />
          </label>

          <div class="flex flex-col gap-1.5">
            <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Items</span>
            <div
              v-for="(_, i) in lootboxItems"
              :key="i"
              class="flex items-center gap-2"
            >
              <input
                v-model.number="lootboxItems[i].quantity"
                type="number"
                min="1"
                class="w-14 shrink-0 bg-card border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                v-model="lootboxItems[i].name"
                type="text"
                class="flex-1 min-w-0 bg-card border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                @click="lootboxItems.splice(i, 1)"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <p v-if="lootboxItems.length === 0" class="font-fell text-xs text-muted-foreground italic">
              No items parsed — equipment may be stored as rich text. Edit the background to re-save in the new format.
            </p>
          </div>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              @click="lootboxOpen = false"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="granting || lootboxItems.length === 0"
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              @click="grantEquipment"
            >
              <LoadingSpinner v-if="granting" class="h-3.5 w-3.5" />
              Add to inventory
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Background feature card -->
    <div v-if="background.feature_name" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Feature</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <p class="font-cinzel text-sm font-bold text-foreground">{{ background.feature_name }}</p>
        <RichTextViewer v-if="background.feature_description" :content="background.feature_description" />
      </div>
    </div>

    <!-- Suggested characteristics card -->
    <div v-if="hasSuggestedCharacteristics" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Suggested Characteristics</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="background.suggested_characteristics" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Pencil, Trash2, User2, PackagePlus, X } from "lucide-vue-next";
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteBackground } from "@/composables/useBackgrounds";
import { useParty } from "@/composables/useParty";
import { useAddInventoryItem } from "@/composables/usePartyInventory";
import { useCampaignStore } from "@/stores/campaign";
import type { Background } from "@/types/background.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const props = defineProps<{ background: Background }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteBackground();
const campaign = useCampaignStore();
const { data: party } = useParty();
const { mutateAsync: addItem } = useAddInventoryItem();

// ── Content helpers ──────────────────────────────────────────────────────────

function hasContent(field: string | null | undefined): boolean {
  if (!field) return false;
  try {
    const doc = JSON.parse(field);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(field).trim().length > 0;
  }
}

/** Extract plain text from either a Tiptap JSON string or a raw prose string. */
function extractPlainText(field: string | null | undefined): string {
  if (!field) return "";
  try {
    const doc = JSON.parse(field);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join(" ");
  } catch {
    return field;
  }
}

const hasDescription = computed(() => hasContent(props.background.description));
const hasEquipment = computed(() => hasContent(props.background.equipment));
const hasSuggestedCharacteristics = computed(() => hasContent(props.background.suggested_characteristics));

// ── Delete ───────────────────────────────────────────────────────────────────

async function handleDelete() {
  const ok = await confirm(`Delete "${props.background.name}"? This cannot be undone.`, {
    title: "Delete Background",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/codex/backgrounds");
  await deleteMut.mutateAsync(props.background);
}

// ── Lootbox ──────────────────────────────────────────────────────────────────

const hasCampaign = computed(() => !!campaign.activeCampaignId);

const memberOptions = computed(() => [
  { id: "", name: "Party stash (unassigned)" },
  ...(party.value ?? []).map((m) => ({ id: m.id, name: m.name })),
]);

const lootboxOpen = ref(false);
const selectedMemberId = ref("");
const lootboxItems = ref<Array<{ name: string; quantity: number }>>([]);
const granting = ref(false);
const grantDone = ref(false);

function parseEquipmentItems(raw: string): Array<{ name: string; quantity: number }> {
  if (!raw.trim()) return [];
  let text = raw.trim().replace(/\.$/, "");
  // Normalise "X, and Y" and "X and Y" → split-friendly commas
  text = text.replace(/,\s*and\s+/g, ", ").replace(/\s+and\s+/g, ", ");
  return text
    .split(/,\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const qtyMatch = p.match(/^(\d+)\s+(.+)$/);
      if (qtyMatch) return { quantity: parseInt(qtyMatch[1]), name: qtyMatch[2] };
      const stripped = p.replace(/^(?:a|an|the|one|some)\s+/i, "");
      return { quantity: 1, name: stripped };
    });
}

function openLootbox() {
  const plain = extractPlainText(props.background.equipment);
  lootboxItems.value = parseEquipmentItems(plain);
  selectedMemberId.value = "";
  grantDone.value = false;
  lootboxOpen.value = true;
}

async function grantEquipment() {
  granting.value = true;
  try {
    for (const item of lootboxItems.value) {
      if (!item.name.trim() || item.quantity < 1) continue;
      await addItem({
        item_id: null,
        name: item.name,
        quantity: item.quantity,
        carried_by: selectedMemberId.value || null,
        location: "backpack",
        slot: null,
        is_container: false,
        container_id: null,
        is_attuned: false,
        is_equipped: false,
        notes: null,
        is_ruined: false,
      });
    }
    lootboxOpen.value = false;
    grantDone.value = true;
    setTimeout(() => { grantDone.value = false; }, 3000);
  } finally {
    granting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-10000 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        class="flex flex-col w-[min(51.25rem,95vw)] h-[min(36.25rem,90vh)] bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div class="flex items-center gap-2">
            <IconLibrary class="h-4 w-4 text-muted-foreground" />
            <h2 class="font-cinzel font-bold text-sm tracking-wide text-foreground">Art Library</h2>
          </div>
          <button
            type="button"
            class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <!-- Body: sidebar + grid -->
        <div class="flex flex-1 min-h-0">
          <!-- Category sidebar -->
          <aside class="w-44 shrink-0 border-r border-border overflow-y-auto py-2">
            <button
              v-for="cat in CATEGORIES"
              :key="cat.bucketKey"
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-2 font-cinzel text-xs tracking-wide transition-colors text-left"
              :class="
                activeCategory?.bucketKey === cat.bucketKey
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              "
              @click="selectCategory(cat)"
            >
              <component :is="cat.icon" class="h-3.5 w-3.5 shrink-0" />
              {{ cat.label }}
            </button>
          </aside>

          <!-- Image grid panel -->
          <div class="flex-1 overflow-y-auto p-3">
            <!-- No category selected yet -->
            <div
              v-if="!activeCategory"
              class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground"
            >
              <IconLibrary class="h-8 w-8 opacity-30" />
              <p class="text-body italic">Pick a category on the left.</p>
            </div>

            <!-- Loading skeleton -->
            <div v-else-if="isLoading" class="grid grid-cols-4 gap-2">
              <div
                v-for="n in 12"
                :key="n"
                class="aspect-square rounded-md bg-muted animate-pulse"
              />
            </div>

            <!-- Error -->
            <div
              v-else-if="loadError"
              class="flex items-center justify-center h-full text-destructive text-body italic"
            >
              {{ loadError }}
            </div>

            <!-- Empty state -->
            <div
              v-else-if="images.length === 0"
              class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground"
            >
              <component :is="activeCategory.icon" class="h-8 w-8 opacity-30" />
              <p class="text-body italic">No images uploaded here yet.</p>
            </div>

            <!-- Thumbnail grid -->
            <div v-else class="grid grid-cols-4 gap-2">
              <button
                v-for="img in images"
                :key="img.url"
                type="button"
                class="aspect-square rounded-md overflow-hidden border-2 border-transparent hover:border-primary focus:border-primary focus:outline-none transition-colors bg-muted"
                :title="img.name"
                @click="pick(img.url)"
              >
                <img
                  :src="img.thumbUrl"
                  :alt="img.name"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).src = img.url"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, type Component } from "vue";
import {
  IconClose, IconLibrary,
  IconUserRound, IconMonster, IconGem, IconGenerate,
  IconLocation, IconFaction, IconTrap, IconPuzzle,
  IconNote, IconScriptorium, IconStar, IconLoot,
} from "@/lib/icons";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { BUCKETS, variantPath, VARIANT_WIDTHS, type BucketKey } from "@/lib/storage";

// Variant files are anything containing `_w{width}` before either an extension (`.`)
// or another variant suffix (`_`). Catches `_w200.webp`, `_w200.png`, and historical
// recursive variants like `_w200_w300.png` from an old re-processing bug.
const VARIANT_FILE_RE = new RegExp(`_w(${VARIANT_WIDTHS.join("|")})(?=[._])`, "i");

interface ArtCategory {
  bucketKey: BucketKey;
  label: string;
  icon: Component;
}

interface ArtImage {
  name: string;
  url: string;
  thumbUrl: string;
}

const CATEGORIES: ArtCategory[] = [
  { bucketKey: "npcPortraits",    label: "NPC Art",         icon: IconUserRound   },
  { bucketKey: "monsterImages",   label: "Monster Art",     icon: IconMonster     },
  { bucketKey: "locationImages",  label: "Location Art",    icon: IconLocation    },
  { bucketKey: "chronicle",       label: "Chronicle",       icon: IconNote        },
  { bucketKey: "assetImages",     label: "Document Art",    icon: IconScriptorium },
  { bucketKey: "itemImages",      label: "Item Art",        icon: IconGem         },
  { bucketKey: "spellImages",     label: "Spell Art",       icon: IconGenerate    },
  { bucketKey: "factionImages",   label: "Faction Emblems", icon: IconFaction     },
  { bucketKey: "pantheonEmblems", label: "Pantheon Art",    icon: IconStar        },
  { bucketKey: "lootImages",      label: "Loot Art",        icon: IconLoot        },
  { bucketKey: "trapImages",      label: "Trap Art",        icon: IconTrap        },
  { bucketKey: "puzzleImages",    label: "Puzzle Art",      icon: IconPuzzle      },
];

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ select: [url: string]; close: [] }>();

const auth = useAuthStore();
const activeCategory = ref<ArtCategory | null>(null);
const images = ref<ArtImage[]>([]);
const isLoading = ref(false);
const loadError = ref<string | null>(null);

watch(
  () => props.show,
  (open) => {
    if (!open) return;
    // Re-open: reset to first category
    activeCategory.value = null;
    images.value = [];
    loadError.value = null;
    selectCategory(CATEGORIES[0]);
  },
);

async function selectCategory(cat: ArtCategory) {
  if (activeCategory.value?.bucketKey === cat.bucketKey) return;
  activeCategory.value = cat;
  images.value = [];
  loadError.value = null;
  isLoading.value = true;

  try {
    const userId = auth.user?.id;
    if (!userId) { isLoading.value = false; return; }

    const cfg = BUCKETS[cat.bucketKey];
    const { data, error } = await supabase.storage.from(cfg.id).list(userId, { limit: 1000 });
    if (error) { loadError.value = error.message; return; }

    const originals = (data ?? []).filter((f) => {
      if (!f.name || f.name.startsWith('.')) return false; // placeholders / hidden
      return !VARIANT_FILE_RE.test(f.name); // exclude _w200.webp etc.
    });
    images.value = originals.map((f) => {
      const path = userId + "/" + f.name;
      const url = supabase.storage.from(cfg.id).getPublicUrl(path).data.publicUrl;
      const thumbUrl = cfg.generateVariants
        ? supabase.storage.from(cfg.id).getPublicUrl(variantPath(path, 200)).data.publicUrl
        : url;
      return { name: f.name, url, thumbUrl };
    });
  } finally {
    isLoading.value = false;
  }
}

function pick(url: string) {
  emit("select", url);
  emit("close");
}
</script>

import { ref, watch } from "vue";
import { uploadToBucket } from "@/lib/storage";
import { toWebP } from "@/lib/mediaConvert";
import { getCurrentUser } from "@/lib/supabase";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";
import { useToast } from "@/composables/useToast";

/** What the table holds (`canon_entries_reference_images` check): more is refused by the database too. */
export const MAX_LOOK_PICTURES = 4;
/** Tokens scale with area and a look needs palette and manner, not detail; every AI picture carries these. */
export const LOOK_PICTURE_SIZE = 512;

/**
 * The pictures of a campaign's look: up to four, kept as style references. `persist` writes the whole list (the
 * caller creates the look entry first if it does not exist yet); a write that fails puts the old list back.
 */
export function useLookReferences(saved: () => readonly string[], persist: (urls: string[]) => Promise<void>) {
  const toast = useToast();
  const { ensureLikenessAck } = useLikenessGate();
  const images = ref<string[]>([...saved()]);
  const busy = ref(false);
  // Writes go one after another, so two quick removals cannot land out of order.
  let chain: Promise<void> = Promise.resolve();
  // A refetch landing between quick removals would put a removed picture back, so it waits for every write.
  let pendingWrites = 0;

  watch(saved, (next) => {
    if (!busy.value && pendingWrites === 0) images.value = [...next];
  });

  function write(next: string[]): Promise<void> {
    const before = images.value;
    images.value = next;
    pendingWrites += 1;
    const run = chain.then(() => persist(next)).catch((e: unknown) => {
      images.value = before;
      toast.error(e instanceof Error ? e.message : "Could not save the pictures.");
    }).finally(() => {
      pendingWrites -= 1;
    });
    chain = run;
    return run;
  }

  async function add(files: readonly File[]): Promise<void> {
    // Two adds at once would both count the same room and could write more than the table holds.
    if (busy.value) return;
    const pictures = files.filter((f) => f.type.startsWith("image/"));
    if (pictures.length === 0) return;
    const room = MAX_LOOK_PICTURES - images.value.length;
    if (pictures.length > room) {
      toast.error(room === 0
        ? `A look holds ${MAX_LOOK_PICTURES} pictures. Remove one to add another.`
        : `A look holds ${MAX_LOOK_PICTURES} pictures, so there is room for ${room} more. Choose fewer.`);
      return;
    }
    // The pictures may show real people.
    if (!(await ensureLikenessAck())) return;
    const user = getCurrentUser();
    if (!user) {
      toast.error("Sign in again to add pictures.");
      return;
    }
    busy.value = true;
    try {
      const urls: string[] = [];
      for (const file of pictures) {
        const small = await toWebP(file, LOOK_PICTURE_SIZE);
        const url = await uploadToBucket({ bucket: "assetImages", blob: small, path: `${user.id}/look-${crypto.randomUUID()}.webp`, contentType: "image/webp" });
        if (!url) throw new Error("A picture could not be uploaded.");
        urls.push(url);
      }
      await write([...images.value, ...urls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the pictures.");
    } finally {
      busy.value = false;
    }
  }

  /** Takes the picture off the look; the stored file stays, since other records may share it. */
  function remove(url: string): Promise<void> {
    return write(images.value.filter((u) => u !== url));
  }

  return { images, busy, add, remove };
}

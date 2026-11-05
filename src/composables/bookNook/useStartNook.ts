import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { captureImageGenerationContext, generateImage } from "@/ai/useImageGeneration";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import {
  BOOK_NOOKS_KEY,
  deleteBookNook,
  saveBookNook,
  useCreateBookNook,
} from "@/composables/bookNook/useBookNooks";
import { useShowNookAtPlace } from "@/composables/bookNook/useShowNookAtPlace";
import { newScene } from "@/lib/bookNook/edit";
import { uploadNookImage } from "@/lib/bookNook/upload";
import { getCurrentUser } from "@/lib/supabase";

/** The picture a painted room asks for: wide, like the screen a nook plays on. */
export const PAINTED_ROOM_SIZE = "1536x1024";

/**
 * Said to the painter so the room is only a room: a nook's cut-outs bring the people and the flames, and a
 * painted-in one would be a second, frozen copy of what moves.
 */
const EMPTY_ROOM = "An empty room seen from a little way in, wide view. No people and no creatures, and nothing that will move: no flames, smoke, banners, water or hanging things.";

/** The place a nook starts from or is shown at. */
export interface StartPlace {
  id: string;
  name: string;
  image_url: string | null;
}

/** The natural size of an image, which becomes the size of the nook's room. */
export function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) reject(new Error("The picture has no size."));
      else resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error("The picture could not be loaded."));
    img.src = src;
  });
}

/**
 * The three starts of a nook (frame 02a): from a place's picture (the nook is then shown there), from an upload,
 * or from a room painted for it. Each makes the nook row and lands in its studio: creating opens it, as New
 * handout does in the Scriptorium.
 */
export function useStartNook() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mutateAsync: createNook } = useCreateBookNook();
  const { mutateAsync: showAtPlace } = useShowNookAtPlace();
  const { costOf } = useAiCredits();
  const { requireCredits } = useOutOfCredits();
  const { imageCredits, imageIsByok } = useCampaignProviders();

  const starting = ref(false);
  const error = ref<string | null>(null);

  /** What painting a room costs on the campaign's image provider; null while the multiplier is unknown. */
  const paintCost = computed(() => imageCredits(costOf("entity_image", { size: PAINTED_ROOM_SIZE })));

  function open(id: string): Promise<unknown> {
    return router.push({ name: "book-nook-studio", params: { id } });
  }

  /** Runs one start, keeping a failure on screen instead of throwing it into a click handler. */
  async function guarded(run: () => Promise<string | null>): Promise<string | null> {
    if (starting.value) return null;
    starting.value = true;
    error.value = null;
    try {
      const id = await run();
      if (id) await open(id);
      return id;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "The nook could not be started.";
      return null;
    } finally {
      starting.value = false;
    }
  }

  /** A nook whose room is `url`, made and (when a place is given) shown there. */
  async function makeNook(title: string, url: string, place: StartPlace | null): Promise<string> {
    const size = await measureImage(url);
    const nook = await createNook({
      title,
      scene: newScene({ id: crypto.randomUUID(), title, room: { url, ...size } }),
      still_url: url,
    });
    if (place) await showAtPlace({ locationId: place.id, nookId: nook.id });
    return nook.id;
  }

  function startFromPicture(place: StartPlace): Promise<string | null> {
    return guarded(async () => {
      if (!place.image_url) throw new Error(`${place.name} has no picture to bring to life.`);
      return makeNook(place.name, place.image_url, place);
    });
  }

  /**
   * The row comes first because the image's path needs the nook's id; if the upload then fails the row is
   * deleted, so a failed start leaves no empty nook in the list.
   */
  function startFromUpload(file: File, title: string): Promise<string | null> {
    return guarded(async () => {
      const user = getCurrentUser();
      if (!user) throw new Error("You must be signed in to make a nook.");
      const local = URL.createObjectURL(file);
      let size: { width: number; height: number };
      try {
        size = await measureImage(local);
      } finally {
        URL.revokeObjectURL(local);
      }
      const row = await createNook({
        title,
        scene: newScene({ id: crypto.randomUUID(), title, room: { url: "", ...size } }),
      });
      try {
        const url = await uploadNookImage(file, row.id, user.id);
        await saveBookNook(row.id, row.rev, {
          scene: newScene({ id: row.id, title, room: { url, ...size } }),
          still_url: url,
        });
      } catch (e) {
        await deleteBookNook(row.id);
        throw e;
      } finally {
        await queryClient.invalidateQueries({ queryKey: [BOOK_NOOKS_KEY] });
      }
      return row.id;
    });
  }

  /** Paints an empty room from `subject`; shown at `place` when one is given. Null when the DM is out of credits. */
  function startFromPainted(place: StartPlace | null, subject: string): Promise<string | null> {
    return guarded(async () => {
      if (!requireCredits(paintCost.value, imageIsByok.value)) return null;
      const url = await generateImage({
        ...captureImageGenerationContext(),
        purpose: "location",
        subject: `${subject.trim()}. ${EMPTY_ROOM}`,
        size: PAINTED_ROOM_SIZE,
      });
      return makeNook(place?.name ?? (subject.trim().slice(0, 60) || "New nook"), url, place);
    });
  }

  return { starting, error, paintCost, startFromPicture, startFromUpload, startFromPainted };
}

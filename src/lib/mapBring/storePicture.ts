/**
 * Putting a Picture where it belongs (#1125 decision 6): a still goes to the image store; a moving map (GIF,
 * animated WebP or APNG, WebM, MP4) is kept on this device and only a WebP still of its first frame is uploaded.
 * Players, the Atlas and the printed handout see the still.
 */
import { detectMotion } from "@/lib/mapImport/motionDetect";
import { requestPersistence, saveLocalMap } from "@/lib/mapImport/localMedia";
import { posterFromAnimatedImage, posterFromVideo } from "@/lib/mapImport/posterFrame";
import type { MapMotion } from "@/types/location.types";

export interface StoredPicture {
  /** The uploaded still: the place's `map_url`. */
  mapUrl: string;
  /** What `map_motion` becomes: null for a still, and for a moving file this browser could not keep. */
  motion: MapMotion | null;
  /** The file moves but this browser would not store it; only the still was added. */
  couldNotKeepMoving: boolean;
}

/**
 * @param placeId     keys the local file; the place must already exist.
 * @param uploadStill uploads an image (it converts to WebP and caps its size), answering the public URL or null.
 * @param posterAt    the second of a video to take the still from (0: the first frame).
 */
export async function storePicture(
  file: File,
  placeId: string,
  uploadStill: (still: File) => Promise<string | null>,
  posterAt = 0,
): Promise<StoredPicture> {
  const kind = await detectMotion(file);
  if (kind === "still") {
    const mapUrl = await uploadStill(file);
    if (!mapUrl) throw new Error("The picture could not be uploaded.");
    return { mapUrl, motion: null, couldNotKeepMoving: false };
  }

  const poster = kind === "video" ? await posterFromVideo(file, posterAt) : await posterFromAnimatedImage(file);
  const mapUrl = await uploadStill(poster.poster);
  if (!mapUrl) throw new Error("The still of this moving map could not be uploaded.");
  const kept = await saveLocalMap(placeId, file);
  if (!kept) return { mapUrl, motion: null, couldNotKeepMoving: true };
  // Asked after the first save, when the browser has a reason to say yes.
  void requestPersistence();
  return {
    mapUrl,
    motion: { kind, file_name: file.name, mime: file.type, bytes: file.size, width: poster.width, height: poster.height },
    couldNotKeepMoving: false,
  };
}

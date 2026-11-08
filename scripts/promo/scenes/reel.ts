/**
 * What only a Reel adds to a scene: how long it is filmed, the lines over it and the sound under it. The app's
 * Book Nook plays the same scenes without any of it (src/lib/bookNook/scene.ts).
 */
import type { Scene } from "../../../src/lib/bookNook/scene.ts";

export interface ReelScene extends Scene {
  /** Seconds filmed for a Reel. */
  duration: number;
  /** The line shown over the picture in a Reel; none when absent. */
  caption?: string;
  /** Seconds into the shot the line shows, when it should arrive with the view rather than at the start. */
  captionAt?: [number, number];
  /** Seconds into the shot the Reel's cover is taken from; absent, the middle. */
  coverAt?: number;
  /** A second line, below the picture's middle, given its own time so the first can be read alone. */
  tagline?: { text: string; at: [number, number] };
  sound?: {
    /**
     * Everything heard: room sounds and the scene's own tune, mixed together; a scene has no brand theme. `src`
     * is an https URL (the soundboard library) or a file in the scene's art folder (a Lyria tune). A sound
     * loops under the whole shot, unless it names a `clip` (seconds of the file): then that cut plays once,
     * from `at` seconds into the shot, with short fades at its ends.
     */
    ambience: { src: string; gain: number; clip?: [number, number]; at?: number }[];
  };
}

/**
 * Whether a sound's clip lasts to the end of the shot, and so carries on past it into the loop's blend instead
 * of fading out. A microsecond of slack: a clip written as start + loop (Cup Town's song, 151 + 680/30) comes out
 * a hair short in floating point, and read strictly it faded out over its last 0.6 s, a stop at every loop.
 */
export function runsToEnd(at: number, clip: [number, number], length: number): boolean {
  return at + (clip[1] - clip[0]) >= length - 1e-6;
}

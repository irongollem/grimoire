// A CarPlay experiment, not a feature (7 Nov 2026): wireless CarPlay stutters
// whenever an <audio> element plays through the Web Audio graph, and Direct
// output (no graph) is clean. This plays a file the other way: fetched whole,
// decoded into an AudioBuffer and looped by an AudioBufferSourceNode, so no
// media element feeds the graph at all. If it is clean in the car, the stutter
// lives in the element-to-graph bridge (WebKit 221334), and decoded buffers are
// a way to keep the mixer in the car. Remove once the question is answered.
import { getAudioContext, primeAudioContext } from "@/lib/audio/audioContext";

let source: AudioBufferSourceNode | null = null;

export function isBufferedTestPlaying(): boolean {
  return source !== null;
}

/** Fetch, decode and loop `url` straight from the AudioContext. Call from a tap. */
export async function startBufferedTest(url: string): Promise<void> {
  stopBufferedTest();
  primeAudioContext();
  const ctx = getAudioContext();
  if (!ctx) throw new Error("This browser has no Web Audio");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the sound (${response.status})`);
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.connect(ctx.destination);
  node.start();
  source = node;
}

export function stopBufferedTest(): void {
  if (source === null) return;
  try {
    source.stop();
  } catch {
    // Already stopped.
  }
  source.disconnect();
  source = null;
}

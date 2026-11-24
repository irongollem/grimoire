import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useClipQueue, type VoicePlayer } from "./useClipQueue";

function manualPlayer() {
  const stopped: string[] = [];
  const player: VoicePlayer = (src) => ({ done: new Promise<void>(() => {}), stop: () => void stopped.push(src) });
  return { player, stopped };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("useClipQueue", () => {
  // Bug caught: one account running out of credits silencing the next account to sign in on the same tab, and the
  // first account's audio playing on after the switch.
  it("forgets the last account's refusals and stops its audio when another account signs in", async () => {
    const owner = ref<string | null>("a");
    const p = manualPlayer();
    const q = useClipQueue({ owner, player: p.player });
    await q.fetchClip(async () => new Response(JSON.stringify({ error: "insufficient_credits" }), { status: 402 }));
    expect(q.broke.value).toBe(true);
    q.enqueue([{ clip: Promise.resolve("clip-a"), voice: "x" }]);
    await tick();
    expect(q.speaking.value).toBe(true);

    owner.value = "b";
    await nextTick();
    expect(q.broke.value).toBe(false);
    expect(p.stopped).toEqual(["clip-a"]);
  });

  // Bug caught: two enqueues in the gap while the first clip is still being made starting two loops that play over
  // each other.
  it("plays one clip at a time when a second batch arrives while the first is still being made", async () => {
    const played: string[] = [];
    const finish: Array<() => void> = [];
    const player: VoicePlayer = (src) => {
      played.push(src);
      return { done: new Promise<void>((resolve) => finish.push(resolve)), stop: () => {} };
    };
    const q = useClipQueue({ owner: ref("a"), player });
    let make!: (src: string) => void;
    q.enqueue([{ clip: new Promise<string>((resolve) => (make = resolve)), voice: "x" }]);
    q.enqueue([{ clip: Promise.resolve("two"), voice: "x" }]);
    make("one");
    await tick();
    expect(played).toEqual(["one"]);
    finish[0]();
    await tick();
    expect(played).toEqual(["one", "two"]);
  });
});

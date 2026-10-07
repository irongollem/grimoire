/** One network request as an interval on a shared clock (any unit, as long as it is one unit). */
export interface Interval {
  start: number;
  end: number;
}

/**
 * Serial depth: the length of the longest chain of requests r1, r2, ... rk in
 * which every request starts at or after the previous one has finished
 * (`r[i+1].start >= r[i].end`).
 *
 * Why this and not "number of waves": it is the number of round trips the user
 * waits through back to back, whatever else runs in parallel. A page that fires
 * 40 requests at once has depth 1; one that fetches the session, then the
 * campaign, then the quests, each waiting on the last, has depth 3 even if it
 * only made 3 requests. With the fixed per-request delay of the profile,
 * `depth * delay` is the floor of the load time that no amount of parallelism
 * elsewhere can remove.
 *
 * Touching intervals (`start === previous end`) chain: a request issued in the
 * same instant another resolved is a dependent one.
 *
 * Longest chain is a longest-path problem on a DAG ordered by start time;
 * O(n^2) is fine for the few hundred requests of a page load.
 */
export function serialDepth(intervals: readonly Interval[]): number {
  return Math.max(0, ...chainPositions(intervals));
}

/**
 * For each interval, in input order, the length of the longest chain that ends
 * with it: 1 for a request that waited on nothing, k for one that came after a
 * chain of k - 1. `serialDepth` is the largest of these. Reported per request
 * (`apiWaves`) so a deep page shows which request sits at which link, which is
 * what tells a real data dependency from a component that only mounted late.
 */
export function chainPositions(intervals: readonly Interval[]): number[] {
  if (intervals.length === 0) return [];
  const order = intervals.map((_, index) => index).sort((a, b) => {
    const left = intervals[a];
    const right = intervals[b];
    if (left === undefined || right === undefined) return 0;
    return left.start - right.start || left.end - right.end;
  });
  const byStart = order.map((index) => intervals[index]);
  // best[i] = longest chain ending with byStart[i]. Any predecessor of i must
  // finish by byStart[i].start, which implies it started earlier (intervals are
  // non-negative length), so scanning only earlier indexes is complete.
  const best: number[] = [];
  for (let i = 0; i < byStart.length; i++) {
    const current = byStart[i];
    if (current === undefined) {
      best.push(0);
      continue;
    }
    let chain = 1;
    for (let j = 0; j < i; j++) {
      const earlier = byStart[j];
      const earlierBest = best[j];
      if (earlier === undefined || earlierBest === undefined) continue;
      if (earlier.end <= current.start && earlierBest + 1 > chain) chain = earlierBest + 1;
    }
    best.push(chain);
  }
  const positions: number[] = Array.from({ length: intervals.length }, () => 0);
  order.forEach((inputIndex, sortedIndex) => {
    positions[inputIndex] = best[sortedIndex] ?? 0;
  });
  return positions;
}

/**
 * Settled time: how long after the window opened the network went quiet.
 *
 * Walks requests in start order keeping the latest finish seen so far (the
 * "last activity"). The first request that starts at least `quietMs` after
 * everything before it finished means the network had been idle for `quietMs`,
 * so the page had settled at that last activity. Requests after that gap
 * (a poll, a late analytics beacon) are ignored on purpose. The gap before the
 * very first request is ignored too, because the window opens before the page
 * has had time to ask for anything.
 *
 * Returns ms from `windowStart`; 0 when nothing was requested.
 */
export function settledTime(intervals: readonly Interval[], windowStart: number, quietMs = 500): number {
  if (intervals.length === 0) return 0;
  const byStart = [...intervals].sort((a, b) => a.start - b.start);
  const first = byStart[0];
  if (first === undefined) return 0;
  let lastActivity = first.end;
  for (const request of byStart.slice(1)) {
    if (request.start - lastActivity >= quietMs) break;
    if (request.end > lastActivity) lastActivity = request.end;
  }
  return Math.max(0, lastActivity - windowStart);
}

// The slice of the Deno global that edge modules unit-tested under vitest
// touch (`Deno.env.get`), for `tsconfig.edge.json` only. The functions
// themselves are type-checked by Deno against the real runtime types; this file
// is never imported by a function, so Deno never sees it, and the app's own
// config does not include it, so client code still cannot reach for `Deno`.
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

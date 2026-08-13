# npm install scripts (`allowScripts`)

An install script is arbitrary code that runs on `npm ci`, on every developer
machine and in every CI job, before a single test executes. It is the most-used
supply-chain vector against JavaScript projects, so this repo reviews each one
rather than letting the tree decide.

The verdicts live in the `allowScripts` field of `package.json`. That field is
JSON and cannot carry comments, which is why the reasoning is here instead.
Maintain it with `npm approve-scripts` / `npm deny-scripts`, never by hand.

## The policy

**Exactly one package is allowed, and it is pinned to a version. Everything
else is denied by name.**

```jsonc
"allowScripts": {
  "esbuild@0.28.1": true,   // pinned: re-reviewed on every version change
  "core-js": false,         // name-only: a permanent judgment about the package
  "es5-ext": false,
  "vue-demi": false,
  "fsevents": false
}
```

The asymmetry is deliberate. A denial says *this package never needs to execute
here*, which is a property of the package and does not expire, so pinning it
would only produce a re-review every time an unrelated version bumps. The single
allow says *this specific version was examined and does execute native code*,
which is exactly the claim that should expire when the version changes.

## Why each verdict

**`esbuild` — allowed, pinned.** The only one that does real work. The published
tarball ships `bin/esbuild` as a 9.1 kB JavaScript shim; after `install.js` runs
it is a 10.1 MB native executable. The script resolves the platform binary
(`downloadedBinPath` → `installUsingNPM`) and then runs `validateBinaryVersion`
to catch a JS/native version skew, which otherwise fails later and much more
confusingly.

Worth knowing before anyone "simplifies" this: the build **passes without it**.
Vite resolves the binary straight from the `@esbuild/darwin-arm64` platform
package, and `npm ci --ignore-scripts` followed by `npm run verify` is green.
It is allowed anyway, because `install.js` is the fallback for npm failing to
place an optional platform package — a failure this repo has already been bitten
by, which is why `@rolldown/binding-darwin-arm64` sits in `optionalDependencies`
as a workaround for the same npm bug. Denying it would trade a safety net on
platforms that cannot be tested from a developer Mac for one shorter line.

**`vue-demi` — denied.** This one looks dangerous to deny and is not, so the
evidence matters. Its postinstall calls `switchVersion(3)`, which rewrites
`lib/index.cjs`, `lib/index.mjs` and `lib/index.d.ts` to target the installed
Vue major. But the published tarball already ships those three files **byte
identical to `lib/v3/*`**, so on a Vue 3 project the script copies a file over
itself. Verified twice: pristine tarball versus installed tree, and again after
`npm ci --ignore-scripts`, where `lib/index.mjs` was still identical to
`lib/v3/index.mjs`. It reaches the tree through `@tanstack/vue-query` and
`@vueuse/core`. The denial is safe **because this is a Vue 3 project** — that is
the condition to recheck, and nothing else.

**`fsevents` — denied.** It has no `install` or `postinstall` script and no
`binding.gyp` in its tarball; the six published files include a prebuilt
`fsevents.node`. Nothing ever compiles. npm flags it only from a stale
`hasInstallScript` flag in the registry metadata. It is also `os: ["darwin"]`,
so it never installs in CI at all.

**`@sentry/cli` — denied.** Arrived with `@sentry/vite-plugin` for source-map
upload (#644), and is the mirror image of the `esbuild` verdict — same
mechanism, opposite conclusion, so the difference is the point.

Its `postinstall` (`scripts/install.js`) downloads a platform binary to
`@sentry/cli/sentry-cli`. That is a *fallback*, not the primary path: the
package declares eight `optionalDependencies` (`@sentry/cli-darwin`,
`@sentry/cli-linux-x64`, …) that ship the binary directly, and `getBinaryPath()`
in `js/helper.js` reads

```js
let fallbackBinaryPath = getFallbackBinaryPath();
if (fs.existsSync(fallbackBinaryPath)) {
  // Since the fallback got installed, the optional dependencies likely didn't
  // get installed, so we just default to the fallback.
  return fallbackBinaryPath;
}
compatibleBinaryPath = require.resolve(`${packageName}/${subpath}`);
```

— the package's own comment saying the download only matters when npm failed to
place the platform package. Verified after install: no binary at
`node_modules/@sentry/cli/sentry-cli`, and `@sentry/cli-darwin/bin/sentry-cli`
present and used.

That is exactly the argument that got `esbuild` *allowed*, so why deny this one?
**Blast radius on failure.** A missing esbuild binary fails the build outright;
a missing sentry-cli binary fails only the source-map upload, which
`vite.config.ts` already handles with an `errorHandler` that warns and continues
— by design, because taking the frontend down over a map upload would be the
more expensive outage. The safety net esbuild needs, this does not.

**`core-js` (both 2.x and 3.x) and `es5-ext` — denied.** Cosmetic only.
`core-js` prints a funding banner; `es5-ext` broadcasts an anti-war message when
the machine's timezone is Russian. Neither writes anything the build reads.

## Maintaining it

`allowScripts` is **advisory in npm 11.x** — scripts still run and installs only
warn. A future npm release will block unreviewed scripts. That has a sharp
consequence: a wrong verdict here is invisible today and breaks later. Do not
validate a denial by observing a green build; read the package's tarball and
confirm the script changes nothing the build depends on, as above.

When `npm ci` warns that a package's scripts are unreviewed:

- **A new package appeared with an install script.** This is the signal the
  whole file exists to produce. Read what it does before approving it.
- **esbuild's pinned version changed** (Dependabot bumps it via Vite). Re-read
  nothing if only the version moved, and refresh the pin:

  ```sh
  npm approve-scripts esbuild
  ```

Never run `npm approve-scripts --all`. It clears the warning by approving
whatever happens to be in the tree, which converts this file from a review
record into a rubber stamp.

Related: `.github/dependabot.yml` drives the version bumps that make the esbuild
pin drift. See #707 for the original review.

/**
 * Import-graph rules for src/. Every rule is an `error` (epic #999 story 5.1):
 * the graph was brought to zero violations, so a new cycle or layer inversion
 * fails `npm run arch:graph` rather than joining a baseline.
 *
 *   npx depcruise src --config .dependency-cruiser.cjs
 *
 * tsPreCompilationDeps is false on purpose: dependency-cruiser then works on the
 * compiled JS, where `import type` and type-only specifiers are already erased, so
 * a type-only import can neither form a cycle nor trip a layer rule. That matches
 * what the bundler sees. (.vue files are compiled through @vue/compiler-sfc.)
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "A runtime import cycle makes module evaluation order fragile and blocks chunk splitting.",
      // `pathNot: "^$1$"` (a back-reference to the importing module's own path)
      // exempts a module importing itself: Vue needs that for a recursive
      // component (UsesAmountEditor renders itself). A cycle through any other
      // module is still reported.
      from: { path: "^(.+)$" },
      to: { circular: true, pathNot: "^$1$" },
    },
    {
      name: "lib-no-composables",
      severity: "error",
      comment: "src/lib is infrastructure below the Vue layer; composables depend on it, never the reverse.",
      from: { path: "^src/lib/" },
      to: { path: "^src/composables/" },
    },
    {
      name: "lib-no-stores",
      severity: "error",
      comment: "src/lib must not reach up into Pinia stores.",
      from: { path: "^src/lib/" },
      to: { path: "^src/stores/" },
    },
    {
      name: "stores-no-composables",
      severity: "error",
      comment: "Stores sit below composables; a store importing one inverts the layering.",
      from: { path: "^src/stores/" },
      to: { path: "^src/composables/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "node_modules|^dist|\\.(test|spec)\\.ts$|\\.generated\\.ts$",
    },
    tsConfig: { fileName: "tsconfig.app.json" },
    tsPreCompilationDeps: false,
    moduleSystems: ["es6", "cjs"],
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".vue", ".js", ".mjs", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
    },
    skipAnalysisNotInRules: false,
  },
};

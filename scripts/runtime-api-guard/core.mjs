/**
 * Pure detection and comparison. No filesystem, no process — see cli.mjs.
 */
import { parse } from "acorn";
import { PROBES } from "./probes.mjs";

/**
 * Visit every node of an ESTree tree.
 *
 * Hand-rolled rather than `acorn-walk`, which would be a second dependency for
 * fifteen lines. A generic walk also cannot miss a node type it has no visitor
 * for, which is the failure mode that matters here: a walker that silently
 * skips an unfamiliar construct produces a clean report about an incomplete
 * read, exactly the way graphify's missing SQL parser hid 448 files.
 */
function walk(node, visit) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "range") continue;
    walk(node[key], visit);
  }
}

/** A non-computed `a.b` whose property is a plain identifier. */
function staticProperty(node) {
  if (node.type !== "MemberExpression" || node.computed) return null;
  return node.property?.type === "Identifier" ? node.property.name : null;
}

/**
 * Names of the probed APIs this source uses.
 *
 * Detection is deliberately uneven, and the unevenness is the point:
 *
 *   static     matched on any `Namespace.member`, call or not, because the
 *              namespace makes a false positive vanishingly unlikely and
 *              because feature detection (`typeof AbortSignal.any`) reads the
 *              member without calling it — the very case worth seeing.
 *   prototype  matched only when the member is actually *called*, since
 *              `thing.at` as a bare property is far more likely to be someone
 *              else's field than Array.prototype.at.
 *   global     matched only as a call target, for the same reason.
 *   regexflag  read off the parsed literal's flags, so it cannot confuse a
 *              division with a regular expression.
 *
 * None of this makes the result authoritative about *risk* — `thing.at()` may
 * still be a user method. It makes it authoritative about *change*, which is
 * what the gate is built on.
 */
export function detectApis(source, probes = PROBES) {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowHashBang: true,
  });

  const statics = new Map();
  const prototypes = new Map();
  const globals = new Map();
  const regexFlags = new Map();
  for (const probe of probes) {
    if (probe.kind === "static") statics.set(`${probe.object}.${probe.property}`, probe.name);
    else if (probe.kind === "prototype") prototypes.set(probe.property, probe.name);
    else if (probe.kind === "global") globals.set(probe.identifier, probe.name);
    else if (probe.kind === "regexflag") regexFlags.set(probe.flag, probe.name);
  }

  const found = new Set();

  walk(ast, (node) => {
    if (node.type === "MemberExpression") {
      const property = staticProperty(node);
      if (property && node.object?.type === "Identifier") {
        const name = statics.get(`${node.object.name}.${property}`);
        if (name) found.add(name);
      }
      return;
    }

    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (callee?.type === "Identifier") {
        const name = globals.get(callee.name);
        if (name) found.add(name);
        return;
      }
      const property = callee ? staticProperty(callee) : null;
      if (property) {
        const name = prototypes.get(property);
        if (name) found.add(name);
      }
      return;
    }

    if (node.type === "Literal" && node.regex) {
      for (const [flag, name] of regexFlags) {
        if (node.regex.flags.includes(flag)) found.add(name);
      }
    }
  });

  return found;
}

/**
 * How the observed set differs from the approved one.
 *
 * `added` is a name nobody has ruled on: either the bundle gained a use of an
 * API old engines lack, or a new false positive needs recording. Either way a
 * person has to look, which is the whole mechanism.
 *
 * `stale` is an approved name the bundle no longer contains — a list entry to
 * delete, nothing more.
 */
export function compareToPinned(detected, pinnedNames) {
  const pinned = new Set(pinnedNames);
  const added = [...detected].filter((name) => !pinned.has(name)).sort();
  const stale = [...pinned].filter((name) => !detected.has(name)).sort();
  return { added, stale };
}

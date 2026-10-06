import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Prompt } from '../types'

// Each guard enforces a rule from CLAUDE.md that was written down because an
// agent kept breaking it. A refusal reaches the model as the tool's error, so
// every reason says what to do instead, not only what was wrong.

// The person's own last prompt: a push goes through only when it says "push".
const lastPrompt = atom({ plugin: 'grimoire-guards', key: 'lastPrompt' } as const, null as Prompt)

// A command only where one starts: a line's head, or after `;`, `&&`, `||`,
// `|` or `(`, behind env assignments and a runner. Anywhere else it is text,
// such as a commit message that mentions the command it guards against.
/** Match a regex command body at shell-like boundaries; this is a heuristic, not a shell parser. */
const command = (body: string) =>
  new RegExp(String.raw`(?:^|[;&|(])\s*(?:\w+=\S*\s+)*(?:(?:npx|bunx|rtk)\s+(?:-y\s+)?)?` + body, 'm')

// `supabase db push` applies every pending migration in the working tree,
// other sessions' unmerged ones included. Migrations apply from CI on push.
const DB_PUSH = command(String.raw`supabase\s+(?:-{1,2}\S+\s+)*db\s+push\b`)

// `Co-Authored-By: Claude Opus 5 (1M context) <...>`: git keys a co-author on
// the whole name, so the suffix forks one model into two contributors.
const SUFFIXED_TRAILER = /Co-Authored-By:[^\n<]*\([^\n)]*\)\s*</i

const GIT_PUSH = command(String.raw`git\s+(?:-[Cc]\s+\S+\s+)*push\b`)
const ASKS_TO_PUSH = /\bpush/i

/** Prefix a denial reason with the plugin name. */
const why = (reason: string) => `grimoire-guards: ${reason}`

/**
 * Register prompt tracking and tool guards for agents, migrations, commit
 * trailers, and pushes. Push checks use the last composer/bridge prompt's
 * text, matched by ASKS_TO_PUSH; other prompt origins leave it unchanged.
 * Denied calls return a reason instead of invoking the next handler.
 */
export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    // Only the person's own words count: typed here, or sent from their phone.
    // A notification, a peer session or another plugin cannot unlock a push.
    const kind = e.origin?.kind
    if (kind === 'composer' || kind === 'bridge') {
      await update($, lastPrompt, () => e.text)
    }

    return next(e)
  })

  // The Overseer Pattern: an Agent call without `model` inherits the session's,
  // so an unannotated Explore under a Fable session is Fable reading 2,000 files.
  on('tool.call', { tool: 'Agent' }, ($, e, next) =>
    e.subagent_type === 'fork' || e.model !== undefined
      ? next(e)
      : {
          deny: why(
            'every Agent call that is not a fork names its model (CLAUDE.md, Overseer Pattern). ' +
              'Pass model: "sonnet" (haiku for pure lookups; the top model only for an advisor consult).',
          ),
        },
  ).catch(($, e, next) => (next.called ? next(e) : { deny: why('the Agent guard failed.') }))

  // apply_migration stamps its own version, which never matches the local
  // file's, so `db push` diverges every time.
  on('tool.call', { tool: /^mcp__.*supabase.*__apply_migration$/ }, () => ({
    deny: why(
      'never apply a migration through the MCP. Create it with /new-migration <name>, ' +
        'write the SQL, and let CI apply it on push.',
    ),
  }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = e.command

    if (DB_PUSH.test(command)) {
      return {
        deny: why(
          'never run `supabase db push` by hand: it applies every pending migration in the ' +
            "working tree, other sessions' unmerged ones included. Migrations apply from CI on push.",
        ),
      }
    }

    if (/\bgit\b[^\n]*\bcommit\b/.test(command) && SUFFIXED_TRAILER.test(command)) {
      return {
        deny: why(
          'the Co-Authored-By trailer takes the model name only, no parenthetical ' +
            '(`Claude Opus 5`, not `Claude Opus 5 (1M context)`). Drop the suffix and commit again.',
        ),
      }
    }

    if (GIT_PUSH.test(command)) {
      const prompt = await read($, lastPrompt)
      if (prompt === null || !ASKS_TO_PUSH.test(prompt)) {
        return {
          deny: why(
            'never push unasked. Ask the user first; once their reply says "push", the push goes through.',
          ),
        }
      }
    }

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: why('the Bash guard failed.') }))
}

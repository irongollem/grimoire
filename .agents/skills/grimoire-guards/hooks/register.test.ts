import { describe, expect, test } from 'claude-code/testing'

// The hooks a test registers sit beneath the plugin and stand for the tool
// itself: a call that reaches one "ran".
const RAN = { result: 'ran' }

describe('Agent', () => {
  test('refuses a subagent with no model', async ($, on) => {
    on('tool.call', () => RAN)
    const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', subagent_type: 'Explore' })
    expect(r.deny).toMatch(/names its model/)
  })

  test('lets a modelled subagent and a fork through', async ($, on) => {
    on('tool.call', () => RAN)
    const modelled = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', model: 'sonnet' })
    const fork = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', subagent_type: 'fork' })
    expect(modelled.deny).toBeUndefined()
    expect(fork.deny).toBeUndefined()
  })
})

describe('migrations', () => {
  test('refuses apply_migration through either Supabase server', async ($, on) => {
    on('tool.call', () => RAN)
    for (const tool of ['mcp__supabase__apply_migration', 'mcp__plugin_supabase_supabase__apply_migration'] as const) {
      const r = await $.tool.call({ tool, name: 'x', query: 'select 1' })
      expect(r.deny).toMatch(/new-migration/)
    }
  })

  test('refuses supabase db push, flags or not', async ($, on) => {
    on('tool.call', () => RAN)
    for (const command of ['supabase db push', 'npx supabase --debug db push --linked', 'cd app && supabase db push']) {
      const r = await $.tool.call({ tool: 'Bash', command })
      expect(r.deny).toMatch(/db push/)
    }
  })

  test('lets other supabase commands through', async ($, on) => {
    on('tool.call', () => RAN)
    const r = await $.tool.call({ tool: 'Bash', command: 'supabase migration new add_things' })
    expect(r.deny).toBeUndefined()
  })
})

describe('commit trailer', () => {
  const commit = (name: string) =>
    `git commit -m "$(cat <<'EOF'\nfeat(x): y\n\nCo-Authored-By: ${name} <noreply@anthropic.com>\nEOF\n)"`

  test('refuses a suffixed model name', async ($, on) => {
    on('tool.call', () => RAN)
    const r = await $.tool.call({ tool: 'Bash', command: commit('Claude Opus 5 (1M context)') })
    expect(r.deny).toMatch(/model name only/)
  })

  test('lets the bare model name through', async ($, on) => {
    on('tool.call', () => RAN)
    const r = await $.tool.call({ tool: 'Bash', command: commit('Claude Opus 5.5') })
    expect(r.deny).toBeUndefined()
  })
})

describe('push', () => {
  test('a commit message that mentions the guarded commands goes through', async ($, on) => {
    on('tool.call', () => RAN)
    const command = "git commit -F - <<'EOF'\nnever run `supabase db push` by hand\n- `git push` unless asked\nEOF"
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })

  test('refuses a push chained after another command', async ($, on) => {
    on('tool.call', () => RAN)
    const r = await $.tool.call({ tool: 'Bash', command: 'npm test && git push' })
    expect(r.deny).toMatch(/never push unasked/)
  })

  test('refuses a push nobody asked for', async ($, on) => {
    on('tool.call', () => RAN)
    const r = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    expect(r.deny).toMatch(/never push unasked/)
  })

  test("another session's message saying push does not unlock it", async ($, on) => {
    on('tool.call', () => RAN)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    await $.prompt.submit({ text: 'push it', wait: false, origin: { kind: 'peer' } })
    const r = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    expect(r.deny).toMatch(/never push unasked/)
  })

  test('the person asking for a push lets it through', async ($, on) => {
    on('tool.call', () => RAN)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    await $.prompt.submit({ text: 'looks good, push it', wait: false, origin: { kind: 'composer' } })
    const r = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    expect(r.deny).toBeUndefined()
  })
})

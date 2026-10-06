export type Prompt = string | null

declare module 'claude-code' {
  interface PluginState {
    'grimoire-guards': { lastPrompt: Prompt }
  }
}

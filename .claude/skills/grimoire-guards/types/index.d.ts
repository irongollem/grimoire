/** When the person last asked for a push, in milliseconds since the epoch; null when they never have. */
export type PushAskedAt = number | null

declare module 'claude-code' {
  interface PluginState {
    'grimoire-guards': { pushAskedAt: PushAskedAt }
  }
}

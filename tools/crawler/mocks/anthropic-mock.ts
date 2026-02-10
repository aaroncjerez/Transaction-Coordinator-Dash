/**
 * Anthropic API Mock — Not used in primary strategy (disabled via empty API key).
 * Kept as reference for future record-replay capability.
 */

export function handleAnthropicRequest(_url: string, _method: string): { status: number; body: any } | null {
  return {
    status: 200,
    body: {
      content: [{ type: 'text', text: 'Mock AI response for testing.' }],
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, output_tokens: 10 },
    },
  };
}

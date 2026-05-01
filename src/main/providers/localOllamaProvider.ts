import { ollamaChatStream } from '../ollama'
import type { LocalOllamaStreamOptions, ProviderStreamChunk } from './types'

export async function* streamLocalOllama(
  options: LocalOllamaStreamOptions
): AsyncGenerator<ProviderStreamChunk> {
  yield* ollamaChatStream({
    model: options.model,
    messages: options.messages,
    signal: options.signal
  })
}

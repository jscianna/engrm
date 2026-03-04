import { encoding_for_model } from 'tiktoken';

let encoder = null;

function getEncoder() {
  if (!encoder) {
    encoder = encoding_for_model('gpt-4');
  }
  return encoder;
}

export function countTokens(text) {
  try {
    const enc = getEncoder();
    return enc.encode(text).length;
  } catch {
    // Fallback: rough estimate (4 chars per token)
    return Math.ceil(text.length / 4);
  }
}

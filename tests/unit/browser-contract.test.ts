import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../lib/sha256';

describe('browser-safe contract primitives', () => {
  it.each(['', '한글과 emoji 🧭', '# heading\r\nvalue\n'])('matches Node SHA-256 for %j', (value) => {
    expect(sha256Hex(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });
});

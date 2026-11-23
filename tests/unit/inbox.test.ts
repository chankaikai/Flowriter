import { describe, it, expect } from 'vitest'
import { formatInboxLine } from '../../src/shared/inbox'

describe('inbox', () => {
  const d = new Date(2026, 10, 24, 4, 5)
  it('formats a single line as a task item with timestamp', () => {
    expect(formatInboxLine('buy milk', d)).toBe('- [ ] 2026-11-24 04:05 buy milk\n')
  })
  it('keeps multi-line notes inside the list item', () => {
    expect(formatInboxLine('a\r\nb', d)).toBe('- [ ] 2026-11-24 04:05 a\n  b\n')
  })
  it('trims surrounding whitespace', () => {
    expect(formatInboxLine('  x \n', d)).toBe('- [ ] 2026-11-24 04:05 x\n')
  })
})

import { describe, it, expect } from 'vitest'
import { FEEDBACK_EMAIL } from '../../src/shared/update'
import { updateText } from '../../src/renderer/src/components/AboutPanel'

describe('update status text', () => {
  it('describes each state', () => {
    expect(updateText({ state: 'none' })).toContain('最新')
    expect(updateText({ state: 'available', version: '1.2.0' })).toContain('1.2.0')
    expect(updateText({ state: 'downloading', percent: 40 })).toContain('40%')
    expect(updateText({ state: 'error', message: 'x' })).toContain('x')
  })
  it('feedback address is set', () => {
    expect(FEEDBACK_EMAIL).toBe('kaikai122148@163.com')
  })
})

import { describe, it, expect } from 'vitest'
import { addNote, emptyNotes, isOrphan, parseNotes, removeNote, serializeNotes, updateNote } from '@/lib/notes'

describe('notes', () => {
  it('adds, edits and removes', () => {
    let f = addNote(emptyNotes(), 'a.md', '  hello world  ', ' check this ', 1)
    expect(f.files['a.md'][0].quote).toBe('hello world')
    expect(f.files['a.md'][0].text).toBe('check this')
    const id = f.files['a.md'][0].id
    f = updateNote(f, 'a.md', id, { done: true })
    expect(f.files['a.md'][0].done).toBe(true)
    f = removeNote(f, 'a.md', id)
    expect(f.files['a.md']).toBe(undefined)
  })
  it('round-trips and tolerates garbage', () => {
    const f = addNote(emptyNotes(), 'a.md', 'q', 't', 5)
    expect(parseNotes(serializeNotes(f)).files['a.md'][0].text).toBe('t')
    expect(parseNotes('not json').files).toEqual({})
    expect(parseNotes('').files).toEqual({})
    expect(parseNotes('{"files":{"a":[{"id":1},{"id":"x","text":"ok"}]}}').files['a'].length).toBe(1)
  })
  it('detects orphaned quotes ignoring markdown marks', () => {
    expect(isOrphan('some **bold** text', 'bold text')).toBe(false)
    expect(isOrphan('totally different', 'bold text')).toBe(true)
    expect(isOrphan('x', '')).toBe(false)
  })
})

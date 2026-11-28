import { describe, it, expect } from 'vitest'
import { parsePorcelain, isDocPath, validRemote, defaultCommitMessage } from '../../src/shared/gitSync'

describe('gitSync helpers', () => {
  it('parses porcelain -z including renames', () => {
    const out = ' M a.md\0?? assets/x.png\0R  new.md\0old.md\0'
    expect(parsePorcelain(out)).toEqual([
      { status: ' M', path: 'a.md' },
      { status: '??', path: 'assets/x.png' },
      { status: 'R ', path: 'new.md' }
    ])
  })
  it('docs mode keeps markdown and images, drops sidecars and secrets', () => {
    expect(isDocPath('notes/a.md')).toBe(true)
    expect(isDocPath('assets/clip.pdf')).toBe(true)
    expect(isDocPath('pic.PNG')).toBe(true)
    expect(isDocPath('a.md.inkwell')).toBe(false)
    expect(isDocPath('.git/config')).toBe(false)
    expect(isDocPath('backup.flowbak')).toBe(false)
    expect(isDocPath('src/app.ts')).toBe(false)
  })
  it('remote validation blocks option injection', () => {
    expect(validRemote('https://github.com/chankaikai/notes.git')).toBe(true)
    expect(validRemote('git@github.com:chankaikai/notes.git')).toBe(true)
    expect(validRemote('ssh://git@gitee.com/u/r.git')).toBe(true)
    expect(validRemote('--upload-pack=evil')).toBe(false)
    expect(validRemote('http://insecure.example/r.git')).toBe(false)
    expect(validRemote('https://a.com/r with space')).toBe(false)
    expect(validRemote('')).toBe(false)
  })
  it('default message has a timestamp', () => {
    expect(defaultCommitMessage(new Date(2026, 10, 28, 8, 5))).toBe('更新文件 2026-11-28 08:05')
  })
})

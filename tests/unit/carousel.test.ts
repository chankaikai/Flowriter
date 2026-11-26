import { describe, it, expect } from 'vitest'
import { CARD_LIMIT, cardFileName, splitCards } from '@/lib/carousel'
import { crc32, zipStore } from '../../src/shared/zip'

describe('carousel split', () => {
  it('splits on horizontal rules, ignoring fenced code and front matter', () => {
    const md = '---\ntitle: x\n---\n# 標題\n前言\n\n---\n\n第二張\n\n```\n---\nnot a rule\n```\n\n---\n第三張\n'
    const c = splitCards(md)
    expect(c.length).toBe(3)
    expect(c[0].cover).toBe(true)
    expect(c[0].title).toBe('標題')
    expect(c[1].md).toContain('not a rule')
    expect(c[2].md).toBe('第三張')
    expect(c.map((x) => x.index)).toEqual([0, 1, 2])
    expect(c.every((x) => x.total === 3)).toBe(true)
  })
  it('without rules, splits on ## and the part before is the cover', () => {
    const c = splitCards('# 大標\n\n簡介\n\n## 一\n內容一\n\n## 二\n內容二\n\n### 小節\n不另起一張')
    expect(c.length).toBe(3)
    expect(c[0].cover).toBe(true)
    expect(c[1].title).toBe('一')
    expect(c[2].md).toContain('### 小節')
  })
  it('a setext underline is not a rule; a single block is one card; empty gives none', () => {
    expect(splitCards('標題\n---\n內文').length).toBe(1)
    expect(splitCards('只有一段').length).toBe(1)
    expect(splitCards('   \n\n').length).toBe(0)
    expect(splitCards('## 開頭就是二級標題\n內容').length).toBe(1)
  })
  it('limits the number of cards', () => {
    const md = Array.from({ length: CARD_LIMIT + 10 }, (_, i) => `## ${i}\nx`).join('\n')
    expect(splitCards(md).length).toBe(CARD_LIMIT)
  })
  it('file names are zero padded', () => {
    expect(cardFileName('文章', 0, 8)).toBe('文章-01.png')
    expect(cardFileName('a', 11, 120)).toBe('a-012.png')
  })
})

describe('zipStore', () => {
  it('crc32 matches the known check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('writes a readable archive structure', () => {
    const z = zipStore([{ name: '卡-01.png', data: new Uint8Array([1, 2, 3]) }, { name: 'b.txt', data: new Uint8Array([]) }])
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    const eocd = z.length - 22
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50)
    expect(dv.getUint16(eocd + 10, true)).toBe(2)
    const cd = dv.getUint32(eocd + 16, true)
    expect(dv.getUint32(cd, true)).toBe(0x02014b50)
    expect(dv.getUint16(cd + 8, true) & 0x0800).toBe(0x0800) // UTF-8 檔名
  })
})

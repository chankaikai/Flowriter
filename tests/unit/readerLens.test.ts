import { describe, it, expect } from 'vitest'
import { abbrevsIn, explainedTerms, firstUnexplained, jumpyBlocks } from '@/lib/readerLens'

describe('reader lens: abbreviations', () => {
  it('finds all-caps abbreviations, skipping very common ones', () => {
    expect(abbrevsIn('我們用 RAG 與 LLM，輸出 JSON 和 PDF，版本 V2').map((h) => h.term)).toEqual(['RAG', 'LLM', 'V2'])
  })
  it('does not match inside words or lone letters', () => {
    expect(abbrevsIn('iPhone MacBook A B').length).toBe(0)
  })
  it('explained or linked terms are recognised', () => {
    const s = explainedTerms('RAG（檢索增強生成）；(LLM) 很強；[[MCP]] 見另一篇；FOO(bar)')
    expect([...s].sort()).toEqual(['FOO', 'LLM', 'MCP', 'RAG'])
  })
  it('only the first unexplained occurrence is reported, in order', () => {
    const r = firstUnexplained(['先講 RAG 和 LLM。', 'RAG 再次出現。', 'LLM（大型語言模型）已解釋', 'NLP 沒解釋'])
    expect(r.map((x) => x.hit.term)).toEqual(['RAG', 'NLP'])
    expect(r[0].block).toBe(0)
    expect(r[1].block).toBe(3)
  })
})

describe('reader lens: abrupt transitions', () => {
  const P = (text: string) => ({ type: 'paragraph' as const, text })
  const O = (text: string) => ({ type: 'other' as const, text })
  it('flags a connective paragraph with nothing to connect to', () => {
    expect(jumpyBlocks([O('標題'), P('但是這個方案有一個問題，我們需要重新考慮。')])).toEqual([1])
    expect(jumpyBlocks([P('短'), P('因此我們決定放棄。')])).toEqual([1])
    expect(jumpyBlocks([P('However, this is not enough to explain it.')])).toEqual([0])
  })
  it('does not flag when a real paragraph precedes it', () => {
    expect(jumpyBlocks([P('這個方案在小規模測試中表現良好，成本也低。'), P('但是放大之後出現了問題。')])).toEqual([])
    expect(jumpyBlocks([P('一般的開頭段落，沒有連接詞。')])).toEqual([])
  })
})

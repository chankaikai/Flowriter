import type { MusicLang, MusicRenderer } from './types'
import { createAbcRenderer } from './abcRenderer'
import { createJianpuRenderer } from './jianpuRender'
import { createVerovioRenderer } from './verovioRenderer'
import { createGongcheRenderer } from './gongcheRender'
import { createLilypondRenderer } from './lilypondRenderer'
import { createTabRenderer } from './tabRenderer'

import type { Transport } from './player'

/** transport() 回傳 null 代表這份譜目前沒有可播放的音符 */
export type Engine = MusicRenderer & { transport?(): Promise<Transport | null> }

/** 依圍欄語言建立對應的譜面引擎（編輯器預覽與匯出共用）。 */
export function createEngine(lang: MusicLang): Engine {
  switch (lang) {
    case 'abc': return createAbcRenderer()
    case 'tab': return createTabRenderer()
    case 'gongche': return createGongcheRenderer()
    case 'lilypond': return createLilypondRenderer()
    case 'mei':
    case 'xml': return createVerovioRenderer(lang)
    default: return createJianpuRenderer()
  }
}

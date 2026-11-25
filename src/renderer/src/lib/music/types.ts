/** 樂譜渲染器的共同介面（所有譜種共用）。 */
export type MusicRenderOptions = {
  /** "all" 或某個聲部 id。只對有多聲部的引擎有意義 */
  part: string
}

export type MusicRenderer = {
  render(source: string, mount: HTMLElement, options: MusicRenderOptions): Promise<void>
  destroy(): void
}

/** 圍欄語言 → 引擎。語言名是固定的，不要增加別名。 */
export const MUSIC_LANGS = ['abc', 'jianpu', 'tab', 'mei', 'xml', 'gongche', 'lilypond'] as const
export type MusicLang = (typeof MUSIC_LANGS)[number]

/** 這個階段已經實作的語言（其餘仍是普通代碼塊） */
export const ACTIVE_MUSIC_LANGS: readonly MusicLang[] = ['abc', 'jianpu', 'tab', 'mei', 'xml', 'gongche']

export const isMusicLang = (l: string): l is MusicLang => (ACTIVE_MUSIC_LANGS as readonly string[]).includes(l)

/** 防抖毫秒數：lilypond 800，其餘 200 */
export const musicDebounce = (l: MusicLang): number => (l === 'lilypond' ? 800 : 200)

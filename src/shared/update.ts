/** 自動更新狀態（主程序 → 渲染程序） */
export type UpdateState = 'idle' | 'dev' | 'checking' | 'none' | 'available' | 'downloading' | 'downloaded' | 'error'
export interface UpdateStatus {
  state: UpdateState
  /** 新版本號 */
  version?: string
  /** 下載進度 0–100 */
  percent?: number
  message?: string
}

/** 回饋信箱（說明與回饋） */
export const FEEDBACK_EMAIL = 'kaikai122148@163.com'
export const REPO_URL = 'https://github.com/chankaikai/Flowriter'

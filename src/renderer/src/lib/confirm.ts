import { trAuto } from '@/lib/i18n'
/** 確認對話框：第一行當標題，其餘當說明。取消回傳 false。 */
export function confirmBox(text: string, ok = '確定', cancel = '取消'): Promise<boolean> {
  const [message, ...rest] = trAuto(text).split('\n')
  return window.api.confirm({ message, detail: rest.join('\n').trim() || undefined, ok: trAuto(ok), cancel: trAuto(cancel) }).catch(() => false)
}

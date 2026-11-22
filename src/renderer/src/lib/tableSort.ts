/** 回傳排序後的列索引排列。數字欄位依數值排序，否則依文字（中文用 localeCompare）。穩定排序。 */
export function sortOrder(values: string[], dir: 'asc' | 'desc'): number[] {
  const nums = values.map((v) => {
    const t = v.replace(/[,，\s%¥$]/g, '')
    return t !== '' && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
  })
  const numeric = values.filter((v) => v.trim() !== '').length > 0 && values.every((v, i) => v.trim() === '' || !Number.isNaN(nums[i]))
  const idx = values.map((_, i) => i)
  const sign = dir === 'asc' ? 1 : -1
  idx.sort((a, b) => {
    let c: number
    if (numeric) {
      const x = Number.isNaN(nums[a]) ? Infinity : nums[a]
      const y = Number.isNaN(nums[b]) ? Infinity : nums[b]
      c = x === y ? 0 : x < y ? -1 : 1
    } else c = values[a].localeCompare(values[b], 'zh')
    return c * sign || a - b
  })
  return idx
}

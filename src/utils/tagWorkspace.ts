import type { TagItem } from '../api/tags'

export type TagUsageFilter = 'all' | 'used' | 'unused'
export type TagSort = 'usage-desc' | 'usage-asc' | 'name-asc' | 'name-desc'

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

export function tagUsage(tag: TagItem): number | null {
  return typeof tag.usageCount === 'number' && Number.isFinite(tag.usageCount) && tag.usageCount >= 0
    ? tag.usageCount
    : null
}

export function filterAndSortTags(tags: TagItem[], keyword: string, usage: TagUsageFilter, sort: TagSort): TagItem[] {
  const query = keyword.trim().toLocaleLowerCase()
  return tags.filter(tag => {
    const count = tagUsage(tag)
    return tag.name.toLocaleLowerCase().includes(query)
      && (usage === 'all' || (usage === 'used' ? count !== null && count > 0 : count === 0))
  }).sort((a, b) => {
    const byName = collator.compare(a.name, b.name) || a.id - b.id
    if (sort === 'name-asc') return byName
    if (sort === 'name-desc') return -byName
    const left = tagUsage(a), right = tagUsage(b)
    // Missing usage must never be presented as an unused tag ready for cleanup.
    if (left === null) return right === null ? byName : 1
    if (right === null) return -1
    return (sort === 'usage-desc' ? right - left : left - right) || byName
  })
}

export function validateTagName(name: string, tags: TagItem[], editingId?: number): string {
  const trimmed = name.trim()
  if (!trimmed) return '请输入标签名称'
  if (Array.from(trimmed).length > 50) return '标签名称不能超过 50 个字符'
  if (tags.some(tag => tag.id !== editingId && tag.name === trimmed)) return '已存在同名标签，请换一个名称'
  return ''
}

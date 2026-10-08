export interface TagItem {
  id: number
  name: string
  /** Number of videos carrying this tag; omitted by relation-only queries. */
  usageCount?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unwrap(response: unknown, fallback: string): unknown {
  if (isRecord(response) && 'code' in response) {
    if (response.code !== 200) {
      throw new Error(typeof response.message === 'string' && response.message.trim() ? response.message : fallback)
    }
    return response.data
  }
  return response
}

function readTag(value: unknown): TagItem {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || (value.id as number) <= 0 || typeof value.name !== 'string') {
    throw new Error('标签数据格式不正确，请刷新后重试')
  }
  if (value.usageCount != null && (!Number.isSafeInteger(value.usageCount) || (value.usageCount as number) < 0)) {
    throw new Error('标签关联视频数格式不正确，请刷新后重试')
  }
  return { id: value.id as number, name: value.name, ...(value.usageCount != null ? { usageCount: value.usageCount as number } : {}) }
}

export function normalizeTagList(response: unknown): TagItem[] {
  const value = unwrap(response, '标签加载失败')
  if (!Array.isArray(value)) throw new Error('标签列表格式不正确，请刷新后重试')
  return value.map(readTag)
}

/** The current create endpoint returns a status string, so resolve its ID before returning to callers. */
export async function resolveCreatedTag(
  response: unknown,
  name: string,
  findTags: (name: string) => Promise<TagItem[]>
): Promise<TagItem> {
  const value = unwrap(response, '标签创建失败')
  if (typeof value === 'string') {
    if (value.includes('已有同名')) throw new Error('已存在同名标签，请使用其他名称')
    if (value !== 'tag添加成功') throw new Error('标签创建失败，请检查名称后重试')
    try {
      const tag = (await findTags(name)).find(item => item.name === name)
      if (tag) return readTag(tag)
    } catch {
      throw new Error('标签已创建，但未能获取最新信息，请刷新列表后确认')
    }
    throw new Error('标签已创建，但未能获取最新信息，请刷新列表后确认')
  }
  const tag = readTag(value)
  if (tag.name !== name) throw new Error('返回的标签名称不一致，请刷新列表后确认')
  return tag
}

export function normalizeUpdatedTag(response: unknown, id: number, name: string): TagItem {
  const tag = readTag(unwrap(response, '标签更新失败'))
  if (tag.id !== id || tag.name !== name) throw new Error('返回的标签信息不一致，请刷新列表后确认')
  return tag
}

export function assertTagDeleted(response: unknown): void {
  const value = unwrap(response, '标签删除失败')
  // TagsController.deleteTag returns void. Any nonempty payload is unexpected.
  if (value !== null && value !== undefined && value !== '') throw new Error('删除结果异常，请刷新列表后确认')
}

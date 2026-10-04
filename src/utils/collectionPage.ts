/** The current collection API wraps an array and repeats COUNT(*) OVER() on each row. */
export function normalizeCollectionPage<T>(response: unknown): { records: T[]; total: number } {
  const envelope = response as any
  if (envelope?.code != null && envelope.code !== 200) throw new Error(envelope.message || '合集加载失败')
  const payload = envelope?.data ?? envelope
  const records = Array.isArray(payload) ? payload : payload?.records ?? payload?.data
  if (!Array.isArray(records)) throw new Error('合集列表格式不正确')
  const total = Number(envelope?.total ?? payload?.total ?? records[0]?.total ?? records.length)
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('合集总数格式不正确')
  return { records, total }
}

export async function verifyResumeIdentity(
  file: File,
  expected: { fileName: string; fileSize: number; fileHash?: string },
  hash: (file: File, signal: AbortSignal) => Promise<string>,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  if (file.name !== expected.fileName || file.size !== expected.fileSize) {
    throw new Error('所选文件与原任务名称或大小不匹配')
  }
  const actual = await hash(file, signal)
  signal.throwIfAborted()
  if (expected.fileHash && actual !== expected.fileHash) {
    throw new Error('文件内容已改变，不能续传。请选择原文件，或将此文件作为新任务上传')
  }
  return actual
}

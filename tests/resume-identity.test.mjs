import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyResumeIdentity } from '../src/utils/resumeIdentity.ts'

const hash = async file => createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')
test('resume accepts identical content and rejects changed content with identical name and size', async () => {
  const original = new File(['abcd'], 'clip.mp4')
  const expected = { fileName: original.name, fileSize: original.size, fileHash: await hash(original) }
  assert.equal(await verifyResumeIdentity(new File(['abcd'], 'clip.mp4'), expected, hash, new AbortController().signal), expected.fileHash)
  await assert.rejects(verifyResumeIdentity(new File(['abce'], 'clip.mp4'), expected, hash, new AbortController().signal), /内容已改变/)
})
test('cancelling during hashing prevents attaching even when hashing finishes later', async () => {
  const controller = new AbortController()
  const file = new File(['abcd'], 'clip.mp4')
  await assert.rejects(verifyResumeIdentity(file, { fileName: file.name, fileSize: file.size }, async () => {
    controller.abort()
    return hash(file)
  }, controller.signal), { name: 'AbortError' })
})

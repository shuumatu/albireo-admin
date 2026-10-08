import test from 'node:test'
import assert from 'node:assert/strict'
import { assertTagDeleted, normalizeTagList, normalizeUpdatedTag, resolveCreatedTag } from '../src/utils/tagResponse.ts'

test('HTTP 200 duplicate and failed create messages are not treated as success', async () => {
  for (const response of ['已有同名tag', '添加失败', '添加失败: duplicate key', '', { code: 500, message: '保存失败', data: null }]) {
    await assert.rejects(resolveCreatedTag(response, '旅行', () => assert.fail('failed creates must not look up a tag')))
  }
})

test('legacy create success resolves the exact tag, not a fuzzy search match', async () => {
  const tag = { id: 12, name: '旅行', usageCount: 0 }
  assert.deepEqual(await resolveCreatedTag('tag添加成功', '旅行', async keyword => {
    assert.equal(keyword, '旅行')
    return [{ id: 11, name: '旅行日记' }, tag]
  }), tag)
  await assert.rejects(resolveCreatedTag('tag添加成功', '旅行', async () => [{ id: 11, name: '旅行日记' }]), /标签已创建/)
  await assert.rejects(resolveCreatedTag('tag添加成功', '旅行', async () => { throw new Error('offline') }), /标签已创建/)
})

test('structured create responses preserve the ID required by video tag editing', async () => {
  const tag = { id: 12, name: '旅行', usageCount: 0 }
  assert.deepEqual(await resolveCreatedTag(tag, '旅行', () => assert.fail('structured response needs no second request')), tag)
  assert.deepEqual(await resolveCreatedTag({ code: 200, data: tag }, '旅行', () => assert.fail('wrapped tag needs no second request')), tag)
  await assert.rejects(resolveCreatedTag({ id: 12, name: '风景' }, '旅行', async () => []), /不一致/)
})

test('a malformed tag list or business error cannot silently become an empty library', () => {
  for (const response of [null, {}, { code: 500, message: '加载失败' }, [{ id: 1, name: '旅行', usageCount: -1 }], [{ name: '旅行' }]]) {
    assert.throws(() => normalizeTagList(response))
  }
  assert.deepEqual(normalizeTagList([{ id: 1, name: '旅行', usageCount: null }]), [{ id: 1, name: '旅行' }])
  assert.deepEqual(normalizeTagList({ code: 200, data: [] }), [])
})

test('updates require a matching tag and deletes reject error bodies even on HTTP 200', () => {
  const tag = { id: 12, name: '旅行', usageCount: 4 }
  assert.deepEqual(normalizeUpdatedTag(tag, 12, '旅行'), tag)
  for (const response of ['已有同名tag', { code: 500, message: '失败' }, { ...tag, id: 13 }, { ...tag, name: '风景' }]) {
    assert.throws(() => normalizeUpdatedTag(response, 12, '旅行'))
  }
  for (const response of [undefined, null, '', { code: 200, data: null }]) assert.doesNotThrow(() => assertTagDeleted(response))
  for (const response of ['删除失败', false, { code: 500, message: '删除失败', data: null }, { error: '失败' }]) {
    assert.throws(() => assertTagDeleted(response))
  }
})

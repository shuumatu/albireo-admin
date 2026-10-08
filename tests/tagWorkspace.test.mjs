import test from 'node:test'
import assert from 'node:assert/strict'
import { filterAndSortTags, tagUsage, validateTagName } from '../src/utils/tagWorkspace.ts'

const tags = [
  { id: 1, name: '旅行', usageCount: 12 },
  { id: 2, name: '待整理', usageCount: 0 },
  { id: 3, name: 'Unknown' },
  { id: 4, name: '100% Travel', usageCount: 2 },
]

test('cleanup never treats missing, null or invalid counts as unused', () => {
  const source = [...tags, { id: 5, name: '空', usageCount: null }, { id: 6, name: '异常', usageCount: -1 }]
  assert.deepEqual(filterAndSortTags(source, '', 'unused', 'usage-asc').map(tag => tag.id), [2])
  assert.equal(tagUsage({ id: 7, name: '未知', usageCount: NaN }), null)
})

test('search is trimmed and case-insensitive, with literal percent characters', () => {
  assert.deepEqual(filterAndSortTags(tags, ' TRAVEL ', 'used', 'usage-desc').map(tag => tag.id), [4])
  assert.deepEqual(filterAndSortTags(tags, '%', 'all', 'name-asc').map(tag => tag.id), [4])
})

test('usage ordering spans the full result set and leaves the source untouched', () => {
  assert.deepEqual(filterAndSortTags(tags, '', 'all', 'usage-desc').map(tag => tag.id), [1, 4, 2, 3])
  assert.deepEqual(filterAndSortTags(tags, '', 'all', 'usage-asc').map(tag => tag.id), [2, 4, 1, 3])
  assert.deepEqual(tags.map(tag => tag.id), [1, 2, 3, 4])
})

test('name validation trims input and excludes the edited record from duplicates', () => {
  assert.equal(validateTagName('  ', tags), '请输入标签名称')
  assert.equal(validateTagName('  旅行  ', tags), '已存在同名标签，请换一个名称')
  assert.equal(validateTagName('  旅行  ', tags, 1), '')
  assert.equal(validateTagName('🙂'.repeat(50), tags), '')
  assert.equal(validateTagName('字'.repeat(51), tags), '标签名称不能超过 50 个字符')
})

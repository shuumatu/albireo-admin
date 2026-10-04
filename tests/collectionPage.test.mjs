import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCollectionPage } from '../src/utils/collectionPage.ts'

test('wrapped SQL window count controls pagination, not the number of loaded rows', () => {
  const rows = [{ id: 13, total: 27 }, { id: 14, total: 27 }]
  assert.deepEqual(normalizeCollectionPage({ code: 200, data: rows }), { records: rows, total: 27 })
})
test('empty collection response has a zero total', () => {
  assert.deepEqual(normalizeCollectionPage({ code: 200, data: [] }), { records: [], total: 0 })
})
test('standard page envelopes retain their total when the page is empty', () => {
  assert.deepEqual(normalizeCollectionPage({ records: [], total: 24 }), { records: [], total: 24 })
  assert.deepEqual(normalizeCollectionPage({ data: [], total: 24 }), { records: [], total: 24 })
})
test('service errors and malformed pages are not displayed as an empty collection library', () => {
  assert.throws(() => normalizeCollectionPage({ code: 500, data: null }))
  assert.throws(() => normalizeCollectionPage({ records: 'invalid', total: 12 }))
  assert.throws(() => normalizeCollectionPage({ records: [], total: -1 }))
})

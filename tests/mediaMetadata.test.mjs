import test from 'node:test'
import assert from 'node:assert/strict'
import exifr from 'exifr'
import { extractGps, extractMetadata, normalizeCaptureDate, readCaptureDate } from '../src/utils/mediaMetadata.ts'

test('EXIF offsets, subseconds and strict calendar validation', () => {
  assert.equal(normalizeCaptureDate('2024:02:29 12:34:56\0', '+0530', '123456'), '2024-02-29T12:34:56.123456+05:30')
  assert.equal(normalizeCaptureDate('2024-02-29T12:34:56.25Z', '-07:00'), '2024-02-29T12:34:56.25Z')
  assert.equal(normalizeCaptureDate('2024:02:29 12:34:56'), '2024-02-29T12:34:56')
  for (const value of ['0000:00:00 00:00:00', '2023:02:29 12:00:00', '2024:04:31 12:00:00', '2024:01:01 24:00:00', '2024:01:01 12:00:00+18:01']) {
    assert.equal(normalizeCaptureDate(value), null, value)
  }
})

test('invalid higher-priority dates do not block EXIF, XMP or IPTC fallbacks', () => {
  assert.equal(readCaptureDate([{ DateTimeOriginal: '0000:00:00 00:00:00', CreateDate: '2024:10:01 08:20:00', OffsetTimeDigitized: '+08:00' }]), '2024-10-01T08:20:00+08:00')
  assert.equal(readCaptureDate([{ CreateDate: '2025:01:01 10:00:00' }, { DateTimeOriginal: '2024-10-01T08:20:00Z' }]), '2024-10-01T08:20:00Z')
  assert.equal(readCaptureDate([{ DateCreated: '20241001', TimeCreated: '082000-0730' }]), '2024-10-01T08:20:00-07:30')
})

test('GPS accepts south/west DMS, XMP degree/minutes, zero and below-sea-level altitude', () => {
  assert.deepEqual(extractGps({ GPSLatitude: [33, 30, 0], GPSLatitudeRef: 'S', GPSLongitude: [70, 15, 0], GPSLongitudeRef: 'W', GPSAltitude: '23/2', GPSAltitudeRef: 1 }), { latitude: -33.5, longitude: -70.25, altitude: -11.5 })
  assert.deepEqual(extractGps({ GPSLatitude: '0,0N', GPSLongitude: '0,0E', GPSAltitude: 0, GPSAltitudeRef: '0' }), { latitude: 0, longitude: 0, altitude: 0 })
  assert.deepEqual(extractGps({ GPSLatitude: '33,30S', GPSLongitude: '70,15W', GPSAltitude: 20, GPSAltitudeRef: 'Below sea level' }), { latitude: -33.5, longitude: -70.25, altitude: -20 })
  assert.deepEqual(extractGps({ latitude: -33.5, longitude: 70.25, altitude: -10 }), { latitude: -33.5, longitude: 70.25, altitude: -10 })
})

test('bad GPS or altitude cannot invalidate the capture date or otherwise valid coordinates', async () => {
  for (const latitude of [NaN, Infinity, 91, [20, 60, 0], 'unknown', '20,10E']) assert.equal(extractGps({ GPSLatitude: latitude, GPSLongitude: 10 }), null)
  assert.deepEqual(extractGps({ latitude: 0, longitude: 0, GPSAltitude: 'broken' }), { latitude: 0, longitude: 0, altitude: null })
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
  const result = await extractMetadata(file, async (_, options) => options.tiff ? { exif: { DateTimeOriginal: '2024:01:01 12:00:00', OffsetTimeOriginal: '+08:00' }, gps: { GPSLatitude: NaN } } : undefined)
  assert.equal(result.dateTime, '2024-01-01T12:00:00+08:00')
  assert.equal(result.gpsData, null)
})

test('invalid or incomplete raw GPS cannot be rescued by guessed derived coordinates', () => {
  for (const tags of [
    { GPSLatitude: [33, 30, 0], GPSLongitude: [70, 15, 0], latitude: 33.5, longitude: 70.25 },
    { GPSLatitude: 91, GPSLongitude: 10, latitude: 31, longitude: 10 },
    { GPSLatitude: 31, longitude: 10 },
    { GPSLatitude: 31, GPSLatitudeRef: '?', GPSLongitude: 10, latitude: 31, longitude: 10 },
  ]) assert.equal(extractGps(tags), null)
  assert.equal(normalizeCaptureDate('1904-01-01T00:00:00Z'), null)
})

test('a damaged EXIF segment does not discard XMP data', async () => {
  const result = await extractMetadata(new File(['x'], 'photo.jpg'), async (_, options) => {
    if (options.tiff) throw new Error('damaged EXIF')
    if (options.xmp) return { exif: { DateTimeOriginal: '2024-06-01T12:30:00Z', GPSLatitude: '33,30S', GPSLongitude: '70,15W' } }
  })
  assert.deepEqual(result, { dateTime: '2024-06-01T12:30:00Z', dateTimeSource: 'exif', gpsData: { latitude: -33.5, longitude: -70.25, altitude: null } })
})

test('missing dates and timezone-less originals are left for the server, never replaced by lastModified', async () => {
  const file = new File(['x'], 'photo.jpg', { lastModified: 1780000000000 })
  assert.deepEqual(await extractMetadata(file, async () => undefined), { gpsData: null, dateTime: null })
  const result = await extractMetadata(file, async (_, options) => options.tiff ? { exif: { DateTimeOriginal: '2024:01:01 12:00:00', CreateDate: '2025-01-01T00:00:00Z' } } : undefined)
  assert.equal(result.dateTime, null)
  assert.equal(result.dateTimeSource, undefined)
  const video = await extractMetadata(new File(['x'], 'video.MOV'), async () => { throw new Error('video must be parsed on server') })
  assert.deepEqual(video, { gpsData: null, dateTime: null })
})

function jpegSegment(marker, payload) {
  const header = Buffer.alloc(4)
  header[0] = 0xff
  header[1] = marker
  header.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([header, payload])
}

test('actual exifr reads an XMP-only JPEG with a timezone and southern/western coordinates', async () => {
  const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:DateTimeOriginal="2024-06-01T12:30:00+05:30" exif:GPSLatitude="33,30S" exif:GPSLongitude="70,15W" /></rdf:RDF></x:xmpmeta>'
  const bytes = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xe1, Buffer.from(`http://ns.adobe.com/xap/1.0/\0${xmp}`)), Buffer.from([0xff, 0xd9])])
  // Node uses Buffer because exifr's browser FileReader is not available in this test environment.
  const result = await extractMetadata(new File([bytes], 'xmp.jpg'), (_, options) => exifr.parse(bytes, options))
  assert.deepEqual(result, { dateTime: '2024-06-01T12:30:00+05:30', dateTimeSource: 'exif', gpsData: { latitude: -33.5, longitude: -70.25, altitude: null } })
})

function exifJpeg() {
  const ascii = value => ({ type: 2, count: value.length + 1, bytes: Buffer.from(`${value}\0`) })
  const rational = values => {
    const bytes = Buffer.alloc(values.length * 8)
    values.forEach(([numerator, denominator], index) => { bytes.writeUInt32LE(numerator, index * 8); bytes.writeUInt32LE(denominator, index * 8 + 4) })
    return { type: 5, count: values.length, bytes }
  }
  const blocks = [
    [[0x8769, { type: 4, count: 1, pointer: 1 }], [0x8825, { type: 4, count: 1, pointer: 2 }]],
    [[0x9003, ascii('2024:06:01 12:30:00')], [0x9011, ascii('+05:30')], [0x9291, ascii('125')]],
    [[1, ascii('S')], [2, rational([[33, 1], [30, 1], [0, 1]])], [3, ascii('W')], [4, rational([[70, 1], [15, 1], [0, 1]])], [5, { type: 1, count: 1, bytes: Buffer.from([1]) }], [6, rational([[23, 2]])]],
  ]
  let size = 8
  const offsets = blocks.map(block => { const start = size; size += 2 + block.length * 12 + 4; return start })
  const header = Buffer.alloc(size)
  header.write('II')
  header.writeUInt16LE(42, 2)
  header.writeUInt32LE(8, 4)
  const tails = []
  blocks.forEach((block, blockIndex) => {
    header.writeUInt16LE(block.length, offsets[blockIndex])
    block.forEach(([tag, value], index) => {
      const pos = offsets[blockIndex] + 2 + index * 12
      header.writeUInt16LE(tag, pos)
      header.writeUInt16LE(value.type, pos + 2)
      header.writeUInt32LE(value.count, pos + 4)
      if (value.pointer !== undefined) header.writeUInt32LE(offsets[value.pointer], pos + 8)
      else if (value.bytes.length <= 4) value.bytes.copy(header, pos + 8)
      else { header.writeUInt32LE(size, pos + 8); tails.push(value.bytes); size += value.bytes.length }
    })
  })
  const payload = Buffer.concat([Buffer.from('Exif\0\0'), header, ...tails])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xe1, payload), Buffer.from([0xff, 0xd9])])
}

test('actual exifr retains EXIF offsets/subseconds and GPS hemisphere/altitude references', async () => {
  const bytes = exifJpeg()
  const result = await extractMetadata(new File([bytes], 'exif.jpg'), (_, options) => exifr.parse(bytes, options))
  assert.deepEqual(result, { dateTime: '2024-06-01T12:30:00.125+05:30', dateTimeSource: 'exif', gpsData: { latitude: -33.5, longitude: -70.25, altitude: -11.5 } })
})

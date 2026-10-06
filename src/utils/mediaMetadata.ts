import exifr from 'exifr'

type Tags = Record<string, unknown>

export interface MediaMetadata {
  gpsData: { latitude: number; longitude: number; altitude: number | null } | null
  dateTime: string | null
  dateTimeSource?: 'exif'
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim() : null
}

/** Keep camera wall time intact; a missing offset is resolved by the server's configured zone. */
export function normalizeCaptureDate(value: unknown, offset?: unknown, subsecond?: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(raw)
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null
  const calendar = new Date(0)
  calendar.setUTCFullYear(year, month - 1, day)
  calendar.setUTCHours(hour, minute, second, 0)
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null
  if (year === 1904 && month === 1 && day === 1 && hour === 0 && minute === 0 && second === 0 && !Number(match[7] || 0)) return null

  let zone = match[8] || text(offset) || ''
  if (zone.toUpperCase() === 'Z') zone = 'Z'
  else if (zone) {
    const parts = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone)
    if (!parts || Number(parts[2]) > 18 || Number(parts[3] || 0) > 59 || (Number(parts[2]) === 18 && Number(parts[3] || 0) !== 0)) return null
    zone = `${parts[1]}${parts[2]}:${parts[3] || '00'}`
  }
  const sub = match[7] || text(subsecond)
  const fraction = sub && /^\d{1,9}$/.test(sub) ? `.${sub}` : ''
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${fraction}${zone}`
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  // TIFF BYTE values (notably GPSAltitudeRef) are Uint8Array when value translation is disabled.
  if (value instanceof Uint8Array && value.length === 1) return value[0]
  if (typeof value === 'object' && value !== null && 'numerator' in value && 'denominator' in value) {
    const numerator = numeric(value.numerator), denominator = numeric(value.denominator)
    return numerator !== null && denominator !== null && denominator !== 0 ? numerator / denominator : null
  }
  const raw = text(value)
  if (!raw) return null
  const fraction = /^([+-]?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(raw)
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2])
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) && Number.isFinite(Number(raw)) ? Number(raw) : null
}

function coordinate(value: unknown, reference: unknown, axis: 'lat' | 'lon'): number | null {
  let direction = text(reference)?.toUpperCase() || ''
  let parts: unknown[] | null = Array.isArray(value) ? value : null
  let decimal = numeric(value)
  if (typeof value === 'string' && decimal === null) {
    let raw = value.trim()
    const suffix = /([NSEW])$/i.exec(raw)
    if (suffix) {
      const embedded = suffix[1].toUpperCase()
      if (direction && embedded !== direction) return null
      direction = embedded
      raw = raw.slice(0, -1).trim()
    }
    if (!/^[+\-\d.,\s°'"′″]+$/.test(raw)) return null
    parts = raw.split(/[,\s°'"′″]+/).filter(Boolean)
  }
  if (parts) {
    if (parts.length < 1 || parts.length > 3) return null
    if (parts.length > 1 && !direction) return null
    const numbers = parts.map(numeric)
    if (numbers.some(part => part === null)) return null
    const [degrees, minutes = 0, seconds = 0] = numbers as number[]
    if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return null
    decimal = Math.sign(degrees || 1) * (Math.abs(degrees) + minutes / 60 + seconds / 3600)
  }
  if (decimal === null) return null
  if (direction) {
    if (!(axis === 'lat' ? ['N', 'S'] : ['E', 'W']).includes(direction)) return null
    decimal = Math.abs(decimal) * (direction === 'S' || direction === 'W' ? -1 : 1)
  }
  return Math.abs(decimal) <= (axis === 'lat' ? 90 : 180) ? (decimal === 0 ? 0 : decimal) : null
}

export function extractGps(tags: Tags): MediaMetadata['gpsData'] {
  // Prefer the original coordinates: exifr's derived values assume absent direction tags mean north/east.
  const hasRaw = tags.GPSLatitude != null || tags.GPSLongitude != null
  const latitude = hasRaw ? coordinate(tags.GPSLatitude, tags.GPSLatitudeRef, 'lat') : coordinate(tags.latitude, undefined, 'lat')
  const longitude = hasRaw ? coordinate(tags.GPSLongitude, tags.GPSLongitudeRef, 'lon') : coordinate(tags.longitude, undefined, 'lon')
  if (latitude === null || longitude === null) return null
  let altitude = numeric(tags.GPSAltitude) ?? numeric(tags.altitude)
  if (altitude !== null && tags.GPSAltitudeRef != null) {
    const ref = numeric(tags.GPSAltitudeRef)
    const description = text(tags.GPSAltitudeRef)?.toLowerCase()
    if (ref === 1 || description === 'below sea level') altitude = -Math.abs(altitude)
    else if (ref === 0 || description === 'above sea level') altitude = Math.abs(altitude)
    else altitude = null
  }
  return { latitude, longitude, altitude }
}

function groups(output: unknown): Tags[] {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return []
  const root = output as Tags
  return [root, ...Object.values(root).filter((value): value is Tags => !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date))]
}

const DATE_FIELDS = [
  ['DateTimeOriginal', 'OffsetTimeOriginal', 'SubSecTimeOriginal'],
  ['DateCreated', '', ''],
  ['CreateDate', 'OffsetTimeDigitized', 'SubSecTimeDigitized'],
  ['DateTimeDigitized', 'OffsetTimeDigitized', 'SubSecTimeDigitized'],
  ['CreationDate', '', ''],
  ['DateTime', 'OffsetTime', 'SubSecTime'],
  ['ModifyDate', 'OffsetTime', 'SubSecTime'],
] as const

/** Select the first valid capture timestamp, retaining field priority across EXIF and XMP. */
export function readCaptureDate(records: Tags[]): string | null {
  for (const [key, offset, subsecond] of DATE_FIELDS) {
    for (const record of records) {
      let value = record[key]
      if (key === 'DateCreated' && /^\d{8}$/.test(String(value)) && typeof record.TimeCreated === 'string') {
        const date = String(value), time = record.TimeCreated
        value = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.replace(/^(\d{2})(\d{2})(\d{2})/, '$1:$2:$3')}`
      }
      const parsed = normalizeCaptureDate(value, record[offset], record[subsecond])
      if (parsed) return parsed
    }
  }
  return null
}

/** Separate passes prevent one damaged segment from discarding the other metadata sources. */
export async function extractMetadata(
  file: File,
  parse: typeof exifr.parse = exifr.parse,
): Promise<MediaMetadata> {
  const empty: MediaMetadata = { gpsData: null, dateTime: null }
  // MP4/MOV container dates and ISO 6709 locations are parsed from the original by the server.
  if (file.type.startsWith('video/') || /\.(mp4|mov|m4v|avi|mkv|webm|wmv|flv)$/i.test(file.name)) return empty
  const base = { reviveValues: false, translateValues: false, mergeOutput: false, sanitize: false, ifd1: false, icc: false }
  const results = await Promise.allSettled([
    parse(file, { ...base, tiff: true, xmp: false, iptc: false, gps: true }),
    parse(file, { ...base, tiff: false, xmp: true, iptc: false }),
    parse(file, { ...base, tiff: false, xmp: false, iptc: true }),
  ])
  const records = results.flatMap(result => result.status === 'fulfilled' ? groups(result.value) : [])
  const gpsData = records.map(extractGps).find(gps => gps !== null) ?? null
  const captureDate = readCaptureDate(records)
  // Never convert a timezone-less date with the browser timezone, or use filesystem modification time.
  // Let the server extract it using processing.metadata.default-time-zone after upload.
  const dateTime = captureDate && /(?:Z|[+-]\d{2}:\d{2})$/.test(captureDate) ? captureDate : null
  return { gpsData, dateTime, ...(dateTime ? { dateTimeSource: 'exif' as const } : {}) }
}

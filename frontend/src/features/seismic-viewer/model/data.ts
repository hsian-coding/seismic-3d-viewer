import type { SeismicEvent } from './types'

const DAY = 86_400_000
const NOW = Date.now()

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(random: () => number) {
  const u = Math.max(random(), Number.EPSILON)
  const v = Math.max(random(), Number.EPSILON)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const placeNames = [
  'Hualien Offshore',
  'Longitudinal Valley',
  'Yilan Plain',
  'Ryukyu Forearc',
  'Taitung Shelf',
  'Central Range',
  'Luzon Arc',
]

export function generateEvents(count = 4200): SeismicEvent[] {
  const random = mulberry32(9212024)
  const events: SeismicEvent[] = []

  for (let index = 0; index < count; index += 1) {
    const cluster = random()
    let longitude: number
    let latitude: number
    let depthKm: number

    if (cluster < 0.52) {
      const alongArc = random()
      latitude = 21.7 + alongArc * 3.4 + gaussian(random) * 0.12
      longitude = 120.95 + alongArc * 0.95 + gaussian(random) * 0.18
      depthKm = Math.max(3, 12 + alongArc * 95 + gaussian(random) * 14)
    } else if (cluster < 0.82) {
      longitude = 121.4 + random() * 2.2 + gaussian(random) * 0.16
      latitude = 23.7 + random() * 1.5 + gaussian(random) * 0.12
      depthKm = Math.max(5, 18 + (longitude - 121.4) * 60 + gaussian(random) * 20)
    } else {
      longitude = 119.7 + random() * 4.1
      latitude = 21.4 + random() * 4
      depthKm = 5 + Math.pow(random(), 1.8) * 250
    }

    const magnitude = Math.min(7.4, 1.1 + Math.pow(random(), 3.8) * 6.3)
    const ageDays = Math.pow(random(), 1.35) * 180

    events.push({
      id: `TW-${String(index + 1).padStart(6, '0')}`,
      longitude,
      latitude,
      depthKm: Math.min(depthKm, 300),
      magnitude,
      timestamp: NOW - ageDays * DAY,
      place: placeNames[Math.floor(random() * placeNames.length)],
      quality: 0.62 + random() * 0.37,
    })
  }

  return events.sort((a, b) => a.timestamp - b.timestamp)
}

export function parseCsv(text: string): SeismicEvent[] {
  const rows = text.trim().split(/\r?\n/)
  if (rows.length < 2) return []
  const headers = rows[0].split(',').map((value) => value.trim().toLowerCase())
  const indexOf = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1
  const lonIndex = indexOf('longitude', 'lon')
  const latIndex = indexOf('latitude', 'lat')
  const depthIndex = indexOf('depth', 'depthkm', 'depth_km')
  const magnitudeIndex = indexOf('magnitude', 'mag')
  const timeIndex = indexOf('time', 'timestamp', 'date')
  const placeIndex = indexOf('place', 'location')

  if ([lonIndex, latIndex, depthIndex, magnitudeIndex, timeIndex].some((index) => index < 0)) {
    throw new Error('CSV requires longitude, latitude, depth, magnitude, and time columns.')
  }

  return rows.slice(1).flatMap((row, rowIndex) => {
    const values = row.split(',').map((value) => value.trim())
    const timestamp = Number.isFinite(Number(values[timeIndex]))
      ? Number(values[timeIndex])
      : Date.parse(values[timeIndex])
    const event: SeismicEvent = {
      id: `CSV-${String(rowIndex + 1).padStart(6, '0')}`,
      longitude: Number(values[lonIndex]),
      latitude: Number(values[latIndex]),
      depthKm: Number(values[depthIndex]),
      magnitude: Number(values[magnitudeIndex]),
      timestamp,
      place: placeIndex >= 0 ? values[placeIndex] : 'Imported event',
      quality: 1,
    }
    return Object.values(event).some((value) => typeof value === 'number' && !Number.isFinite(value)) ? [] : [event]
  })
}

export const faultLines = [
  [[120.72, 22.2], [120.88, 22.7], [121.02, 23.25], [121.18, 23.85], [121.34, 24.45], [121.55, 25.1]],
  [[121.55, 23.2], [121.85, 23.65], [122.2, 24.0], [122.65, 24.3], [123.2, 24.55]],
  [[120.15, 22.4], [120.45, 22.7], [120.62, 23.2], [120.76, 23.8], [120.85, 24.4]],
]

export const stations = [
  { name: 'TPE', longitude: 121.56, latitude: 25.04 },
  { name: 'HWA', longitude: 121.61, latitude: 23.98 },
  { name: 'TTN', longitude: 121.15, latitude: 22.76 },
  { name: 'CHY', longitude: 120.45, latitude: 23.48 },
  { name: 'ILA', longitude: 121.75, latitude: 24.76 },
]

import type { ColorField, ColorTable, SeismicEvent } from './types'

export const COLOR_TABLES: Record<ColorTable, string[]> = {
  inferno: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4'],
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  cividis: ['#00204c', '#424086', '#7b7b78', '#bcae5a', '#ffea46'],
  iceFire: ['#21366b', '#5d95be', '#e8e1c1', '#d8805e', '#7f202a'],
  grayscale: ['#151817', '#70756f', '#f3efe1'],
}

function parseHex(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function toHex(value: number) {
  return Math.round(value).toString(16).padStart(2, '0')
}

export function interpolateColorTable(value: number, table: ColorTable) {
  const stops = COLOR_TABLES[table]
  const scaled = Math.max(0, Math.min(1, value)) * (stops.length - 1)
  const lowerIndex = Math.min(stops.length - 2, Math.floor(scaled))
  const localValue = scaled - lowerIndex
  const low = parseHex(stops[lowerIndex])
  const high = parseHex(stops[lowerIndex + 1])
  return `#${toHex(low.r + (high.r - low.r) * localValue)}${toHex(low.g + (high.g - low.g) * localValue)}${toHex(low.b + (high.b - low.b) * localValue)}`
}

export function scalarValue(event: SeismicEvent, field: ColorField, minTime: number, maxTime: number) {
  if (field === 'depth') return Math.max(0, Math.min(1, event.depthKm / 300))
  if (field === 'magnitude') return Math.max(0, Math.min(1, (event.magnitude - 1) / 6.5))
  return Math.max(0, Math.min(1, (event.timestamp - minTime) / Math.max(1, maxTime - minTime)))
}

export function scalarColorHex(event: SeismicEvent, field: ColorField, table: ColorTable, minTime: number, maxTime: number) {
  return interpolateColorTable(scalarValue(event, field, minTime, maxTime), table)
}

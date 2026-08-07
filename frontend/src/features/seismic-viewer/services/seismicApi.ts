import { tableFromIPC } from 'apache-arrow'
import type { ProfileTrace, SeismicEvent } from '../model/types'

const API_ROOT = import.meta.env.VITE_API_URL ?? '/api/v1'

export interface EventQuery {
  catalogId: string
  minLongitude?: number
  maxLongitude?: number
  minLatitude?: number
  maxLatitude?: number
  minMagnitude?: number
  maxDepthKm?: number
  startTime?: number
  endTime?: number
  limit?: number
}

function queryString(query: EventQuery) {
  const params = new URLSearchParams()
  const mapping: Record<string, string | number | undefined> = {
    min_longitude: query.minLongitude,
    max_longitude: query.maxLongitude,
    min_latitude: query.minLatitude,
    max_latitude: query.maxLatitude,
    min_magnitude: query.minMagnitude,
    max_depth_km: query.maxDepthKm,
    start_time_ms: query.startTime,
    end_time_ms: query.endTime,
    limit: query.limit,
  }
  Object.entries(mapping).forEach(([key, value]) => value !== undefined && params.set(key, String(value)))
  return params.toString()
}

function decodeEvents(buffer: ArrayBuffer): SeismicEvent[] {
  const table = tableFromIPC(new Uint8Array(buffer))
  const column = (name: string) => table.getChild(name)
  const ids = column('event_id')
  const longitude = column('longitude')
  const latitude = column('latitude')
  const depth = column('depth_km')
  const magnitude = column('magnitude')
  const timestamp = column('timestamp_ms')
  const place = column('place')
  const quality = column('quality')

  return Array.from({ length: table.numRows }, (_, index) => ({
    id: String(ids?.get(index) ?? index),
    longitude: Number(longitude?.get(index) ?? 0),
    latitude: Number(latitude?.get(index) ?? 0),
    depthKm: Number(depth?.get(index) ?? 0),
    magnitude: Number(magnitude?.get(index) ?? 0),
    timestamp: Number(timestamp?.get(index) ?? 0),
    place: String(place?.get(index) ?? ''),
    quality: Number(quality?.get(index) ?? 0),
  }))
}

async function fetchArrow(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { Accept: 'application/vnd.apache.arrow.stream', ...init?.headers } })
  if (!response.ok) throw new Error(`Seismic API request failed: ${response.status}`)
  return decodeEvents(await response.arrayBuffer())
}

export function fetchEvents(query: EventQuery, signal?: AbortSignal) {
  return fetchArrow(`${API_ROOT}/catalogs/${encodeURIComponent(query.catalogId)}/events?${queryString(query)}`, { signal })
}

export function fetchProfile(catalogId: string, profile: ProfileTrace, signal?: AbortSignal) {
  return fetchArrow(`${API_ROOT}/catalogs/${encodeURIComponent(catalogId)}/profiles`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_longitude: profile.startLongitude,
      start_latitude: profile.startLatitude,
      end_longitude: profile.endLongitude,
      end_latitude: profile.endLatitude,
      width_km: profile.widthKm,
    }),
  })
}

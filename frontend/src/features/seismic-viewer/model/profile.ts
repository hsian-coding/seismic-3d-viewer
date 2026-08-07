import type { ProfileTrace, SeismicEvent } from './types'

const KM_PER_DEGREE = 111.32

export interface ProfileProjection {
  event: SeismicEvent
  alongKm: number
  offsetKm: number
}

export function profileLengthKm(trace: ProfileTrace) {
  const meanLatitude = (trace.startLatitude + trace.endLatitude) / 2
  const longitudeScale = KM_PER_DEGREE * Math.cos((meanLatitude * Math.PI) / 180)
  const eastKm = (trace.endLongitude - trace.startLongitude) * longitudeScale
  const northKm = (trace.endLatitude - trace.startLatitude) * KM_PER_DEGREE
  return Math.hypot(eastKm, northKm)
}

export function projectEventToProfile(event: SeismicEvent, trace: ProfileTrace): ProfileProjection | null {
  const meanLatitude = (trace.startLatitude + trace.endLatitude) / 2
  const longitudeScale = KM_PER_DEGREE * Math.cos((meanLatitude * Math.PI) / 180)
  const segmentEast = (trace.endLongitude - trace.startLongitude) * longitudeScale
  const segmentNorth = (trace.endLatitude - trace.startLatitude) * KM_PER_DEGREE
  const lengthSquared = segmentEast ** 2 + segmentNorth ** 2
  if (lengthSquared < 1) return null

  const eventEast = (event.longitude - trace.startLongitude) * longitudeScale
  const eventNorth = (event.latitude - trace.startLatitude) * KM_PER_DEGREE
  const fraction = (eventEast * segmentEast + eventNorth * segmentNorth) / lengthSquared
  if (fraction < 0 || fraction > 1) return null

  const length = Math.sqrt(lengthSquared)
  const offsetKm = Math.abs(eventEast * segmentNorth - eventNorth * segmentEast) / length
  if (offsetKm > trace.widthKm / 2) return null

  return { event, alongKm: fraction * length, offsetKm }
}

export function eventsWithinProfile(events: SeismicEvent[], trace: ProfileTrace) {
  return events.flatMap((event) => {
    const projection = projectEventToProfile(event, trace)
    return projection ? [projection] : []
  })
}

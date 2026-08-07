/// <reference lib="webworker" />

import { tableFromIPC } from 'apache-arrow'

const workerScope = self as DedicatedWorkerGlobalScope

export interface ArrowColumnBatch {
  eventIds: string[]
  places: string[]
  longitude: Float64Array
  latitude: Float64Array
  depthKm: Float32Array
  magnitude: Float32Array
  timestampMs: Float64Array
  quality: Float32Array
}

workerScope.onmessage = (message: MessageEvent<ArrayBuffer>) => {
  const table = tableFromIPC(new Uint8Array(message.data))
  const batch: ArrowColumnBatch = {
    eventIds: [],
    places: [],
    longitude: new Float64Array(table.numRows),
    latitude: new Float64Array(table.numRows),
    depthKm: new Float32Array(table.numRows),
    magnitude: new Float32Array(table.numRows),
    timestampMs: new Float64Array(table.numRows),
    quality: new Float32Array(table.numRows),
  }
  const get = (name: string, index: number) => table.getChild(name)?.get(index)
  for (let index = 0; index < table.numRows; index += 1) {
    batch.eventIds.push(String(get('event_id', index) ?? index))
    batch.places.push(String(get('place', index) ?? ''))
    batch.longitude[index] = Number(get('longitude', index) ?? 0)
    batch.latitude[index] = Number(get('latitude', index) ?? 0)
    batch.depthKm[index] = Number(get('depth_km', index) ?? 0)
    batch.magnitude[index] = Number(get('magnitude', index) ?? 0)
    batch.timestampMs[index] = Number(get('timestamp_ms', index) ?? 0)
    batch.quality[index] = Number(get('quality', index) ?? 0)
  }
  workerScope.postMessage(batch, {
    transfer: [
      batch.longitude.buffer, batch.latitude.buffer, batch.depthKm.buffer,
      batch.magnitude.buffer, batch.timestampMs.buffer, batch.quality.buffer,
    ],
  })
}

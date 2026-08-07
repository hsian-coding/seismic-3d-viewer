export type ColorField = 'depth' | 'magnitude' | 'time'
export type ColorTable = 'inferno' | 'viridis' | 'cividis' | 'iceFire' | 'grayscale'
export type CameraPreset = 'perspective' | 'top' | 'east' | 'north' | 'reset'

export interface SeismicEvent {
  id: string
  longitude: number
  latitude: number
  depthKm: number
  magnitude: number
  timestamp: number
  place: string
  quality: number
}

export interface FilterState {
  minMagnitude: number
  maxDepth: number
  startTime: number
  endTime: number
}

export interface LayerState {
  events: boolean
  surface: boolean
  faults: boolean
  stations: boolean
}

export interface ViewSettings {
  colorField: ColorField
  colorTable: ColorTable
  verticalExaggeration: number
  pointScale: number
  layers: LayerState
}

export interface ProfileTrace {
  startLongitude: number
  startLatitude: number
  endLongitude: number
  endLatitude: number
  widthKm: number
}

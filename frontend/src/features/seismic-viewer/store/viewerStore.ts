import { create } from 'zustand'
import type { CameraPreset } from '../model/types'

interface ViewerStore {
  cameraPreset: CameraPreset
  setCameraPreset: (cameraPreset: CameraPreset) => void
}

export const useViewerStore = create<ViewerStore>((set) => ({
  cameraPreset: 'perspective',
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
}))

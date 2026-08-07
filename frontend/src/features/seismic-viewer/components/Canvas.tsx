import { Canvas as FiberCanvas } from '@react-three/fiber'
import { Grid, OrbitControls, Stats } from '@react-three/drei'
import { useCallback, type ReactNode } from 'react'
import * as THREE from 'three'

interface SeismicCanvasProps {
  children?: ReactNode
  showStats?: boolean
}

/** React Three Fiber foundation for incrementally migrating scene layers. */
export function SeismicCanvas({ children, showStats = false }: SeismicCanvasProps) {
  const initializeScene = useCallback(({ scene }: { scene: THREE.Scene }) => {
    if (scene.userData.tectonInitialized) return
    scene.userData.tectonInitialized = true
    scene.background = new THREE.Color('#242629')
    scene.add(new THREE.HemisphereLight('#dedbd2', '#202225', 1.6))
    const key = new THREE.DirectionalLight('#ffc36d', 2.3)
    key.position.set(-180, 300, 220)
    scene.add(key)
  }, [])

  return (
    <FiberCanvas
      camera={{ position: [180, 150, 220], fov: 39, near: 0.5, far: 3500 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={initializeScene}
    >
      <Grid args={[520, 520]} cellSize={20} cellColor="#505359" sectionSize={100} sectionColor="#8b8f94" fadeDistance={850} infiniteGrid />
      {children}
      <OrbitControls makeDefault enableDamping dampingFactor={0.065} minDistance={35} maxDistance={1600} />
      {showStats && <Stats className="r3f-stats" />}
    </FiberCanvas>
  )
}

export default SeismicCanvas

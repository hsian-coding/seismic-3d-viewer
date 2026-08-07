import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { faultLines, stations } from '../model/data'
import { scalarColorHex } from '../model/palette'
import type { CameraPreset, SeismicEvent, ViewSettings } from '../model/types'

const ORIGIN = { longitude: 121.65, latitude: 23.65 }
const KM_PER_LATITUDE = 111.32
const KM_PER_LONGITUDE = KM_PER_LATITUDE * Math.cos((ORIGIN.latitude * Math.PI) / 180)

export interface SceneViewportHandle {
  capture: () => void
  setCamera: (preset: CameraPreset) => void
}

interface SceneViewportProps {
  events: SeismicEvent[]
  settings: ViewSettings
  selectedId: string | null
  onSelect: (event: SeismicEvent | null) => void
  onHover: (event: SeismicEvent | null, point: { x: number; y: number } | null) => void
  onFps: (fps: number) => void
}

function project(longitude: number, latitude: number, depthKm = 0, exaggeration = 1) {
  return new THREE.Vector3(
    (longitude - ORIGIN.longitude) * KM_PER_LONGITUDE,
    -depthKm * exaggeration,
    -(latitude - ORIGIN.latitude) * KM_PER_LATITUDE,
  )
}

export const SceneViewport = forwardRef<SceneViewportHandle, SceneViewportProps>(function SceneViewport(
  { events, settings, selectedId, onSelect, onHover, onFps },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const dataRootRef = useRef<THREE.Group | null>(null)
  const eventMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const eventIndexRef = useRef<SeismicEvent[]>(events)
  const callbacksRef = useRef({ onSelect, onHover, onFps })

  callbacksRef.current = { onSelect, onHover, onFps }

  const setCamera = (preset: CameraPreset) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const views: Record<CameraPreset, [number, number, number]> = {
      perspective: [360, 285, 390],
      reset: [360, 285, 390],
      top: [0, 650, 0.01],
      east: [620, -70, 0],
      north: [0, -70, 620],
    }
    const [x, y, z] = views[preset]
    camera.position.set(x, y, z)
    controls.target.set(0, -80, 0)
    camera.up.set(0, 1, 0)
    controls.update()
  }

  useImperativeHandle(ref, () => ({
    setCamera,
    capture: () => {
      const renderer = rendererRef.current
      const scene = sceneRef.current
      const camera = cameraRef.current
      if (!renderer || !scene || !camera) return
      renderer.render(scene, camera)
      const anchor = document.createElement('a')
      anchor.download = `tecton-${new Date().toISOString().slice(0, 10)}.png`
      anchor.href = renderer.domElement.toDataURL('image/png')
      anchor.click()
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#242629')
    scene.fog = new THREE.FogExp2('#242629', 0.00105)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(39, host.clientWidth / host.clientHeight, 0.5, 3500)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.065
    controls.zoomToCursor = true
    controls.minDistance = 35
    controls.maxDistance = 1600
    controlsRef.current = controls
    setCamera('perspective')

    scene.add(new THREE.HemisphereLight('#dedbd2', '#202225', 1.6))
    const key = new THREE.DirectionalLight('#ffc36d', 2.3)
    key.position.set(-180, 300, 220)
    scene.add(key)

    const dataRoot = new THREE.Group()
    dataRootRef.current = dataRoot
    scene.add(dataRoot)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const hitTest = (clientX: number, clientY: number) => {
      const mesh = eventMeshRef.current
      if (!mesh) return null
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(mesh, false)[0]
      if (!hit || hit.instanceId === undefined) return null
      return eventIndexRef.current[hit.instanceId] ?? null
    }

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const event = hitTest(pointerEvent.clientX, pointerEvent.clientY)
      renderer.domElement.style.cursor = event ? 'crosshair' : 'grab'
      callbacksRef.current.onHover(event, event ? { x: pointerEvent.clientX, y: pointerEvent.clientY } : null)
    }
    const handleClick = (pointerEvent: MouseEvent) => callbacksRef.current.onSelect(hitTest(pointerEvent.clientX, pointerEvent.clientY))
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('click', handleClick)

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = host.clientHeight
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    })
    resizeObserver.observe(host)

    let animationFrame = 0
    let frames = 0
    let sampleStarted = performance.now()
    const animate = (now: number) => {
      animationFrame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      frames += 1
      if (now - sampleStarted >= 1000) {
        callbacksRef.current.onFps(Math.round((frames * 1000) / (now - sampleStarted)))
        frames = 0
        sampleStarted = now
      }
    }
    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const root = dataRootRef.current
    if (!root) return

    root.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose())
        else child.material.dispose()
      }
    })
    root.clear()
    eventMeshRef.current = null
    eventIndexRef.current = events

    if (settings.layers.surface) {
      const surfaceGeometry = new THREE.PlaneGeometry(520, 520, 1, 1)
      const surfaceMaterial = new THREE.MeshStandardMaterial({
        color: '#383b3f',
        roughness: 0.88,
        metalness: 0.04,
        transparent: true,
        opacity: 0.84,
        side: THREE.DoubleSide,
      })
      const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
      surface.rotation.x = -Math.PI / 2
      surface.position.y = 0.35
      root.add(surface)

      const grid = new THREE.GridHelper(520, 26, '#8b8f94', '#505359')
      grid.position.y = 0.7
      ;(grid.material as THREE.Material).transparent = true
      ;(grid.material as THREE.Material).opacity = 0.68
      root.add(grid)
    }

    if (settings.layers.faults) {
      faultLines.forEach((fault) => {
        const points = fault.map(([longitude, latitude]) => project(longitude, latitude, -1, settings.verticalExaggeration))
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        const material = new THREE.LineBasicMaterial({ color: '#d96a3e', transparent: true, opacity: 0.78 })
        root.add(new THREE.Line(geometry, material))
      })
    }

    if (settings.layers.stations) {
      const geometry = new THREE.ConeGeometry(3.2, 9, 4)
      const material = new THREE.MeshStandardMaterial({ color: '#d7cbb0', emissive: '#756d59', emissiveIntensity: 0.35 })
      const mesh = new THREE.InstancedMesh(geometry, material, stations.length)
      const matrix = new THREE.Matrix4()
      stations.forEach((station, index) => {
        const point = project(station.longitude, station.latitude, -4, settings.verticalExaggeration)
        matrix.makeTranslation(point.x, point.y, point.z)
        mesh.setMatrixAt(index, matrix)
      })
      root.add(mesh)
    }

    if (settings.layers.events && events.length) {
      const geometry = new THREE.IcosahedronGeometry(1, 1)
      const material = new THREE.MeshStandardMaterial({
        roughness: 0.46,
        metalness: 0.08,
        emissive: '#3f190c',
        emissiveIntensity: 0.18,
      })
      const mesh = new THREE.InstancedMesh(geometry, material, events.length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      const matrix = new THREE.Matrix4()
      const quaternion = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      const minTime = events[0].timestamp
      const maxTime = events[events.length - 1].timestamp

      events.forEach((event, index) => {
        const position = project(event.longitude, event.latitude, event.depthKm, settings.verticalExaggeration)
        const selected = event.id === selectedId
        const magnitudeScale = settings.pointScale * (0.65 + Math.pow(event.magnitude, 1.45) * 0.24) * (selected ? 1.65 : 1)
        scale.setScalar(magnitudeScale)
        matrix.compose(position, quaternion, scale)
        mesh.setMatrixAt(index, matrix)
        mesh.setColorAt(index, selected ? new THREE.Color('#fff6cf') : new THREE.Color(scalarColorHex(event, settings.colorField, settings.colorTable, minTime, maxTime)))
      })

      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      root.add(mesh)
      eventMeshRef.current = mesh
    }
  }, [events, settings, selectedId])

  return <div ref={hostRef} className="scene-host" aria-label="Interactive three-dimensional seismic event view" />
})

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  BarChart3,
  Box,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock3,
  Command,
  Crosshair,
  Database,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileUp,
  Gauge,
  Layers3,
  ListFilter,
  Map,
  Mountain,
  Palette,
  PanelLeftClose,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  Search,
  Table2,
  Triangle,
  X,
} from 'lucide-react'
import { faultLines, generateEvents, parseCsv, stations } from '../model/data'
import { COLOR_TABLES, scalarColorHex } from '../model/palette'
import { eventsWithinProfile, profileLengthKm } from '../model/profile'
import { SceneViewport, type SceneViewportHandle } from './SceneViewport'
import type { CameraPreset, ColorField, ColorTable, FilterState, LayerState, ProfileTrace, SeismicEvent, ViewSettings } from '../model/types'

const DAY = 86_400_000
const INITIAL_EVENTS = generateEvents()
const INITIAL_TIME = { min: INITIAL_EVENTS[0].timestamp, max: INITIAL_EVENTS[INITIAL_EVENTS.length - 1].timestamp }

type ToolMode = 'data' | 'layers' | 'filters' | 'appearance' | 'analysis'
type WorkspaceView = 'volume' | 'map' | 'section' | 'table'

const colorLabels: Record<ColorField, { label: string; min: string; max: string }> = {
  depth: { label: 'Hypocentral depth', min: '0 km', max: '300 km' },
  magnitude: { label: 'Moment magnitude', min: 'M 1.0', max: 'M 7.5' },
  time: { label: 'Event recency', min: 'Older', max: 'Recent' },
}

const toolMeta: Record<ToolMode, { label: string; description: string }> = {
  data: { label: 'Data', description: 'Catalog source, search, and import' },
  layers: { label: 'Layers', description: 'Scene visibility and rendering order' },
  filters: { label: 'Filters', description: 'Constrain the active event catalog' },
  appearance: { label: 'Appearance', description: 'Scalar mapping and glyph properties' },
  analysis: { label: 'Analysis', description: 'Catalog statistics and ranked events' },
}

const viewMeta: Record<WorkspaceView, { label: string; icon: ReactNode }> = {
  volume: { label: '3D Volume', icon: <Box size={14} /> },
  map: { label: 'Map', icon: <Map size={14} /> },
  section: { label: 'Section', icon: <ScanLine size={14} /> },
  table: { label: 'Table', icon: <Table2 size={14} /> },
}

function formatDate(timestamp: number, includeTime = false) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: includeTime ? undefined : 'numeric',
    hour: includeTime ? '2-digit' : undefined,
    minute: includeTime ? '2-digit' : undefined,
    hour12: false,
  }).format(timestamp)
}

function downloadText(name: string, text: string, type = 'text/csv') {
  const anchor = document.createElement('a')
  anchor.download = name
  anchor.href = URL.createObjectURL(new Blob([text], { type }))
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

function App() {
  const sceneRef = useRef<SceneViewportHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [events, setEvents] = useState(INITIAL_EVENTS)
  const [datasetName, setDatasetName] = useState('Taiwan Regional / Synthetic')
  const [selected, setSelected] = useState<SeismicEvent | null>(null)
  const [hovered, setHovered] = useState<{ event: SeismicEvent; point: { x: number; y: number } } | null>(null)
  const [fps, setFps] = useState(60)
  const [playing, setPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [windowDays, setWindowDays] = useState(45)
  const [notice, setNotice] = useState<string | null>('Synthetic regional catalog loaded')
  const [search, setSearch] = useState('')
  const [activeTool, setActiveTool] = useState<ToolMode>('layers')
  const [contextOpen, setContextOpen] = useState(true)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('volume')
  const [timelineExpanded, setTimelineExpanded] = useState(true)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [profileTrace, setProfileTrace] = useState<ProfileTrace | null>(null)

  const timeExtent = useMemo(() => ({
    min: Math.min(...events.map((event) => event.timestamp)),
    max: Math.max(...events.map((event) => event.timestamp)),
  }), [events])

  const [filters, setFilters] = useState<FilterState>({
    minMagnitude: 1,
    maxDepth: 300,
    startTime: INITIAL_TIME.max - 45 * DAY,
    endTime: INITIAL_TIME.max,
  })

  const [settings, setSettings] = useState<ViewSettings>({
    colorField: 'depth',
    colorTable: 'inferno',
    verticalExaggeration: 1.15,
    pointScale: 1,
    layers: { events: true, surface: true, faults: true, stations: true },
  })

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setFilters((current) => {
        const step = DAY * 1.5 * playbackSpeed
        const endTime = current.endTime + step > timeExtent.max ? timeExtent.min + windowDays * DAY : current.endTime + step
        return { ...current, endTime, startTime: endTime - windowDays * DAY }
      })
    }, 120)
    return () => window.clearInterval(timer)
  }, [playing, playbackSpeed, timeExtent, windowDays])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (event.key === '/' && !typing) {
        event.preventDefault()
        setActiveTool('data')
        setContextOpen(true)
        window.setTimeout(() => searchInputRef.current?.focus(), 0)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setHovered(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      setWorkspaceView('map')
      setContextOpen(false)
      setTimelineExpanded(false)
    }
  }, [])

  const filteredEvents = useMemo(() => events.filter((event) => (
    event.magnitude >= filters.minMagnitude
    && event.depthKm <= filters.maxDepth
    && event.timestamp >= filters.startTime
    && event.timestamp <= filters.endTime
    && (!search || `${event.id} ${event.place}`.toLowerCase().includes(search.toLowerCase()))
  )), [events, filters, search])

  useEffect(() => {
    if (selected && !filteredEvents.some((event) => event.id === selected.id)) setSelected(null)
  }, [filteredEvents, selected])

  const histogram = useMemo(() => {
    const buckets = Array.from({ length: 64 }, () => 0)
    const span = Math.max(1, timeExtent.max - timeExtent.min)
    events.forEach((event) => {
      const index = Math.min(buckets.length - 1, Math.floor(((event.timestamp - timeExtent.min) / span) * buckets.length))
      buckets[index] += 1
    })
    const max = Math.max(...buckets)
    return buckets.map((value) => value / max)
  }, [events, timeExtent])

  const stats = useMemo(() => {
    if (!filteredEvents.length) return { largest: 0, medianDepth: 0, meanMagnitude: 0 }
    const depths = filteredEvents.map((event) => event.depthKm).sort((a, b) => a - b)
    return {
      largest: Math.max(...filteredEvents.map((event) => event.magnitude)),
      medianDepth: depths[Math.floor(depths.length / 2)],
      meanMagnitude: filteredEvents.reduce((sum, event) => sum + event.magnitude, 0) / filteredEvents.length,
    }
  }, [filteredEvents])

  const rankedEvents = useMemo(() => [...filteredEvents].sort((a, b) => b.magnitude - a.magnitude).slice(0, 6), [filteredEvents])

  const updateLayer = (layer: keyof LayerState) => {
    setSettings((current) => ({ ...current, layers: { ...current.layers, [layer]: !current.layers[layer] } }))
  }

  const selectTool = (mode: ToolMode) => {
    if (activeTool === mode && contextOpen) setContextOpen(false)
    else {
      setActiveTool(mode)
      setContextOpen(true)
    }
  }

  const updateWindow = (days: number) => {
    setWindowDays(days)
    setFilters((current) => ({ ...current, startTime: current.endTime - days * DAY }))
  }

  const resetFilters = () => {
    setFilters({ minMagnitude: 1, maxDepth: 300, startTime: timeExtent.max - 45 * DAY, endTime: timeExtent.max })
    setWindowDays(45)
    setSearch('')
    setNotice('Filters restored')
  }

  const handleFile = async (file: File) => {
    try {
      const imported = parseCsv(await file.text())
      if (!imported.length) throw new Error('No valid event records were found.')
      const min = Math.min(...imported.map((event) => event.timestamp))
      const max = Math.max(...imported.map((event) => event.timestamp))
      setEvents(imported.sort((a, b) => a.timestamp - b.timestamp))
      setFilters({ minMagnitude: 0, maxDepth: 700, startTime: min, endTime: max })
      setWindowDays(Math.max(1, Math.ceil((max - min) / DAY)))
      setDatasetName(file.name)
      setSelected(null)
      setNotice(`${imported.length.toLocaleString()} events imported`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import that file')
    }
  }

  const exportFiltered = () => {
    const header = 'id,longitude,latitude,depth,magnitude,time,place'
    const rows = filteredEvents.map((event) => [
      event.id,
      event.longitude.toFixed(5),
      event.latitude.toFixed(5),
      event.depthKm.toFixed(2),
      event.magnitude.toFixed(2),
      new Date(event.timestamp).toISOString(),
      `"${event.place.replaceAll('"', '""')}"`,
    ].join(','))
    downloadText('tecton-filtered-events.csv', [header, ...rows].join('\n'))
    setNotice('Filtered catalog exported')
  }

  const setCamera = (preset: CameraPreset) => sceneRef.current?.setCamera(preset)
  const windowStartPercent = ((filters.startTime - timeExtent.min) / Math.max(1, timeExtent.max - timeExtent.min)) * 100
  const windowEndPercent = ((filters.endTime - timeExtent.min) / Math.max(1, timeExtent.max - timeExtent.min)) * 100
  const legendGradient = `linear-gradient(90deg, ${COLOR_TABLES[settings.colorTable].join(', ')})`

  const openView = (view: WorkspaceView) => {
    setWorkspaceView(view)
    setCommandOpen(false)
  }

  const commandItems = [
    { label: 'Open 3D volume', keywords: 'view space model', action: () => openView('volume') },
    { label: 'Open regional map', keywords: 'view 2d geographic', action: () => openView('map') },
    { label: 'Open depth section', keywords: 'view profile depth', action: () => openView('section') },
    { label: 'Open event table', keywords: 'view data accessible', action: () => openView('table') },
    { label: 'Show catalog filters', keywords: 'tool magnitude depth', action: () => { selectTool('filters'); setCommandOpen(false) } },
    { label: 'Show appearance controls', keywords: 'tool color glyph', action: () => { selectTool('appearance'); setCommandOpen(false) } },
    { label: 'Reset camera', keywords: 'camera home', action: () => { setCamera('reset'); setCommandOpen(false) } },
  ].filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(commandQuery.toLowerCase()))

  const toolContent = (() => {
    if (activeTool === 'data') return (
      <>
        <div className="source-card">
          <div className="source-card-icon"><Database size={18} /></div>
          <div><strong>{datasetName}</strong><span>{events.length.toLocaleString()} catalog events</span></div>
          <i className="source-live" />
        </div>
        <label className="field-label" htmlFor="event-search">Find event or place</label>
        <div className="search-box">
          <Search size={14} />
          <input ref={searchInputRef} id="event-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hualien, TW-000042…" />
          {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}
        </div>
        <div className="context-stats">
          <Metric label="Catalog extent" value={`${Math.ceil((timeExtent.max - timeExtent.min) / DAY)} d`} />
          <Metric label="Visible now" value={filteredEvents.length.toLocaleString()} />
        </div>
        <button className="wide-action" onClick={() => fileInputRef.current?.click()}><FileUp size={15} /> Import seismic CSV</button>
        <p className="context-hint">Required columns: longitude, latitude, depth, magnitude, and time.</p>
      </>
    )

    if (activeTool === 'layers') return (
      <>
        <div className="section-label">Scene graph</div>
        <div className="layer-stack">
          <LayerRow active={settings.layers.events} icon={<CircleDot size={15} />} label="Hypocenters" detail={`${filteredEvents.length.toLocaleString()} visible`} onClick={() => updateLayer('events')} />
          <LayerRow active={settings.layers.surface} icon={<Mountain size={15} />} label="Reference surface" detail="0 km datum" onClick={() => updateLayer('surface')} />
          <LayerRow active={settings.layers.faults} icon={<ActivityIcon />} label="Fault traces" detail="3 segments" onClick={() => updateLayer('faults')} />
          <LayerRow active={settings.layers.stations} icon={<Triangle size={14} />} label="Stations" detail="5 active" onClick={() => updateLayer('stations')} />
        </div>
        <div className="section-label separated">Camera presets</div>
        <div className="camera-grid">
          <button onClick={() => setCamera('perspective')}><Box size={17} /><span>3D</span></button>
          <button onClick={() => setCamera('top')}><span className="axis-glyph">Z</span><span>Top</span></button>
          <button onClick={() => setCamera('east')}><span className="axis-glyph">X</span><span>East</span></button>
          <button onClick={() => setCamera('north')}><span className="axis-glyph">Y</span><span>North</span></button>
        </div>
      </>
    )

    if (activeTool === 'filters') return (
      <>
        <RangeControl label="Minimum magnitude" valueLabel={`M ${filters.minMagnitude.toFixed(1)}`} min={1} max={7} step={0.1} value={filters.minMagnitude} onChange={(value) => setFilters((current) => ({ ...current, minMagnitude: value }))} />
        <RangeControl label="Maximum depth" valueLabel={`${filters.maxDepth.toFixed(0)} km`} min={10} max={300} step={5} value={filters.maxDepth} onChange={(value) => setFilters((current) => ({ ...current, maxDepth: value }))} />
        <label className="field-label select-spacer" htmlFor="filter-window">Time window</label>
        <select id="filter-window" value={windowDays} onChange={(event) => updateWindow(Number(event.target.value))}>
          <option value={7}>7 days</option><option value={30}>30 days</option><option value={45}>45 days</option><option value={90}>90 days</option><option value={180}>Full range</option>
        </select>
        <div className="filter-result"><strong>{filteredEvents.length.toLocaleString()}</strong><span>of {events.length.toLocaleString()} events pass</span></div>
        <button className="wide-action quiet" onClick={resetFilters}><RotateCcw size={14} /> Reset all filters</button>
      </>
    )

    if (activeTool === 'appearance') return (
      <>
        <label className="field-label" htmlFor="color-variable">Color events by</label>
        <select id="color-variable" value={settings.colorField} onChange={(event) => setSettings((current) => ({ ...current, colorField: event.target.value as ColorField }))}>
          <option value="depth">Hypocentral depth</option><option value="magnitude">Moment magnitude</option><option value="time">Event recency</option>
        </select>
        <label className="field-label select-spacer" htmlFor="color-table">Color table</label>
        <select id="color-table" value={settings.colorTable} onChange={(event) => setSettings((current) => ({ ...current, colorTable: event.target.value as ColorTable }))}>
          <option value="inferno">Inferno</option><option value="viridis">Viridis</option><option value="cividis">Cividis</option><option value="iceFire">Ice — Fire</option><option value="grayscale">Grayscale</option>
        </select>
        <div className="color-legend" style={{ background: legendGradient }}><i /></div>
        <div className="legend-labels"><span>{colorLabels[settings.colorField].min}</span><span>{colorLabels[settings.colorField].max}</span></div>
        <div className="legend-title">{colorLabels[settings.colorField].label}</div>
        <RangeControl label="Glyph scale" valueLabel={`${settings.pointScale.toFixed(1)}×`} min={0.5} max={2.2} step={0.1} value={settings.pointScale} onChange={(value) => setSettings((current) => ({ ...current, pointScale: value }))} />
        <RangeControl label="Depth exaggeration" valueLabel={`${settings.verticalExaggeration.toFixed(1)}×`} min={0.5} max={3} step={0.1} value={settings.verticalExaggeration} onChange={(value) => setSettings((current) => ({ ...current, verticalExaggeration: value }))} />
      </>
    )

    return (
      <>
        <div className="context-stats three">
          <Metric label="Largest" value={`M ${stats.largest.toFixed(1)}`} />
          <Metric label="Median depth" value={`${stats.medianDepth.toFixed(0)} km`} />
          <Metric label="Mean magnitude" value={`M ${stats.meanMagnitude.toFixed(1)}`} />
        </div>
        <div className="section-label separated">Largest visible events</div>
        <div className="ranked-list">
          {rankedEvents.map((event, index) => (
            <button key={event.id} onClick={() => setSelected(event)}><em>{String(index + 1).padStart(2, '0')}</em><span><strong>M {event.magnitude.toFixed(1)} · {event.place}</strong><small>{event.depthKm.toFixed(0)} km · {formatDate(event.timestamp)}</small></span></button>
          ))}
        </div>
        <button className="wide-action" onClick={exportFiltered}><Download size={14} /> Export visible catalog</button>
      </>
    )
  })()

  return (
    <main className={`app-shell ${contextOpen ? '' : 'context-collapsed'} ${selected ? 'inspector-open' : ''} ${timelineExpanded ? 'timeline-expanded' : ''}`}>
      <header className="command-bar">
        <div className="brand-lockup"><div className="brand-mark"><span /><span /><span /></div><div><strong>TECTON</strong><small>Seismic workspace</small></div></div>
        <button className="dataset-crumb" onClick={() => { setActiveTool('data'); setContextOpen(true) }}><Database size={14} /><span>Catalogs</span><b>/</b><strong>{datasetName}</strong><ChevronDown size={13} /></button>
        <button className="command-trigger" onClick={() => setCommandOpen(true)}><Search size={14} /><span>Search commands and views</span><kbd>⌘ K</kbd></button>
        <div className="runtime-status"><i /> LIVE <span>{fps} FPS</span></div>
        <details className="actions-menu">
          <summary aria-label="Open dataset actions"><Ellipsis size={18} /></summary>
          <div>
            <button onClick={() => fileInputRef.current?.click()}><FileUp size={14} /> Import CSV</button>
            <button onClick={exportFiltered}><Download size={14} /> Export visible</button>
            <button onClick={() => sceneRef.current?.capture()}><Camera size={14} /> Capture PNG</button>
          </div>
        </details>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
      </header>

      <nav className="tool-rail" aria-label="Workspace tools">
        <RailButton active={activeTool === 'data' && contextOpen} label="Data" onClick={() => selectTool('data')}><Database size={18} /></RailButton>
        <RailButton active={activeTool === 'layers' && contextOpen} label="Layers" onClick={() => selectTool('layers')}><Layers3 size={18} /></RailButton>
        <RailButton active={activeTool === 'filters' && contextOpen} label="Filters" badge={filteredEvents.length !== events.length} onClick={() => selectTool('filters')}><ListFilter size={18} /></RailButton>
        <RailButton active={activeTool === 'appearance' && contextOpen} label="Appearance" onClick={() => selectTool('appearance')}><Palette size={18} /></RailButton>
        <RailButton active={activeTool === 'analysis' && contextOpen} label="Analysis" onClick={() => selectTool('analysis')}><BarChart3 size={18} /></RailButton>
        <span className="rail-spacer" />
        <RailButton active={commandOpen} label="Commands" onClick={() => setCommandOpen(true)}><Command size={18} /></RailButton>
      </nav>

      <aside className="context-panel" aria-label={`${toolMeta[activeTool].label} tools`}>
        <header><div><strong>{toolMeta[activeTool].label}</strong><span>{toolMeta[activeTool].description}</span></div><button onClick={() => setContextOpen(false)} aria-label="Close tool panel"><PanelLeftClose size={17} /></button></header>
        <div className="context-scroll">{toolContent}</div>
      </aside>

      <section className="workspace">
        <header className="workspace-bar">
          <nav className="view-tabs" aria-label="Visualization views">
            {(Object.keys(viewMeta) as WorkspaceView[]).map((view) => <button key={view} className={workspaceView === view ? 'active' : ''} onClick={() => setWorkspaceView(view)}>{viewMeta[view].icon}<span>{viewMeta[view].label}</span></button>)}
          </nav>
          <div className="workspace-tools">
            {workspaceView === 'volume' && <><button onClick={() => setCamera('perspective')} title="Perspective camera"><Box size={14} /></button><button onClick={() => setCamera('top')} title="Top camera">Z</button><button onClick={() => setCamera('east')} title="East camera">X</button><button onClick={() => setCamera('north')} title="North camera">Y</button><button onClick={() => setCamera('reset')} title="Reset camera"><RotateCcw size={14} /></button></>}
            {selected && <button className="clear-selection" onClick={() => setSelected(null)}><X size={13} /> Clear selection</button>}
          </div>
        </header>

        <div className="view-stage">
          <div className={`view-layer volume-layer ${workspaceView === 'volume' ? 'active' : ''}`}>
            <SceneViewport ref={sceneRef} events={filteredEvents} settings={settings} selectedId={selected?.id ?? null} onSelect={setSelected} onHover={(event, point) => setHovered(event && point ? { event, point } : null)} onFps={setFps} />
            <div className="viewport-title"><span>REGIONAL VOLUME</span><small>Local ENU projection · depth positive down</small></div>
            <div className="viewport-colorbar" aria-label={`${colorLabels[settings.colorField].label} color scale`}>
              <header><span>COLOR BY</span><strong>{colorLabels[settings.colorField].label}</strong></header>
              <div className="viewport-colorbar-ramp" style={{ background: legendGradient }} />
              <div className="viewport-colorbar-labels"><span>{colorLabels[settings.colorField].min}</span><span>{colorLabels[settings.colorField].max}</span></div>
              <small>{settings.colorTable}</small>
            </div>
            <div className="scale-bar"><span>100 km</span><i /></div>
            <div className="orientation-widget" aria-hidden="true"><i className="axis x" /><i className="axis y" /><i className="axis z" /><span className="label-x">E</span><span className="label-y">N</span><span className="label-z">D</span></div>
          </div>
          {workspaceView === 'map' && <MapView events={filteredEvents} settings={settings} selected={selected} onSelect={setSelected} timeExtent={timeExtent} profile={profileTrace} onProfileChange={setProfileTrace} onOpenSection={() => setWorkspaceView('section')} />}
          {workspaceView === 'section' && <SectionView events={filteredEvents} settings={settings} selected={selected} onSelect={setSelected} timeExtent={timeExtent} profile={profileTrace} />}
          {workspaceView === 'table' && <EventTable events={filteredEvents} selected={selected} onSelect={setSelected} />}
        </div>

        {hovered && workspaceView === 'volume' && <div className="hover-card" style={{ left: hovered.point.x + 14, top: hovered.point.y + 14 }}><b>M {hovered.event.magnitude.toFixed(1)}</b><span>{hovered.event.depthKm.toFixed(0)} km · {hovered.event.place}</span></div>}
      </section>

      <aside className="inspector-panel" aria-label="Selected event inspector">
        {selected && <EventInspector event={selected} onClose={() => setSelected(null)} onOpenView={setWorkspaceView} />}
      </aside>

      <section className="timeline-dock" aria-label="Catalog timeline">
        <button className="play-button" onClick={() => setPlaying((current) => !current)} aria-label={playing ? 'Pause animation' : 'Play through the catalog'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
        <div className="timeline-date"><Clock3 size={13} /><span>{formatDate(filters.endTime)}</span><small>{windowDays} day window</small></div>
        <div className="timeline-track">
          {timelineExpanded && <div className="histogram" aria-hidden="true">{histogram.map((value, index) => <i key={index} style={{ height: `${Math.max(5, value * 100)}%` }} />)}</div>}
          <div className="active-window" style={{ left: `${windowStartPercent}%`, width: `${Math.max(1, windowEndPercent - windowStartPercent)}%` }} />
          <input type="range" min={timeExtent.min} max={timeExtent.max} step={DAY / 2} value={filters.endTime} onChange={(event) => { const endTime = Number(event.target.value); setFilters((current) => ({ ...current, endTime, startTime: endTime - windowDays * DAY })) }} aria-label="Catalog timeline" />
          {timelineExpanded && <div className="timeline-ticks"><span>{formatDate(timeExtent.min)}</span><span>{formatDate((timeExtent.min + timeExtent.max) / 2)}</span><span>{formatDate(timeExtent.max)}</span></div>}
        </div>
        <label className="speed-select"><span>Speed</span><select value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
        <div className="render-count"><Gauge size={14} /><span>{filteredEvents.length.toLocaleString()} / {events.length.toLocaleString()}</span></div>
        <button className="dock-toggle" onClick={() => setTimelineExpanded((current) => !current)} aria-label={timelineExpanded ? 'Collapse timeline' : 'Expand timeline'}>{timelineExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
      </section>

      <footer className="status-bar">
        <span>ENU / WGS84</span><span>Depth ×{settings.verticalExaggeration.toFixed(1)}</span><span>{settings.colorField} · {settings.colorTable}</span><span className="status-spacer" /><span>WebGL · Instanced</span><span><i /> Ready</span>
      </footer>

      {commandOpen && <div className="command-overlay" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.target === event.currentTarget && setCommandOpen(false)}><div className="command-palette"><header><Search size={17} /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Type a command…" /><kbd>ESC</kbd></header><div className="command-results">{commandItems.map((item) => <button key={item.label} onClick={item.action}><Command size={14} /><span>{item.label}</span></button>)}{!commandItems.length && <p>No matching commands</p>}</div><footer><span>Navigate with keyboard</span><span>TECTON command system</span></footer></div></div>}
      {notice && <div className="toast"><CircleDot size={14} />{notice}</div>}
    </main>
  )
}

function RailButton({ active, label, badge, onClick, children }: { active: boolean; label: string; badge?: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={active ? 'active' : ''} aria-label={label} title={label} onClick={onClick}>{children}{badge && <i />}</button>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function LayerRow({ active, icon, label, detail, onClick }: { active: boolean; icon: ReactNode; label: string; detail: string; onClick: () => void }) {
  return <button className={`layer-row ${active ? 'active' : ''}`} onClick={onClick}>{active ? <Eye size={14} /> : <EyeOff size={14} />}{icon}<span><strong>{label}</strong><small>{detail}</small></span></button>
}

function RangeControl({ label, valueLabel, min, max, step, value, onChange }: { label: string; valueLabel: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  const percent = ((value - min) / (max - min)) * 100
  return <label className="range-control"><span>{label}<strong>{valueLabel}</strong></span><input type="range" min={min} max={max} step={step} value={value} style={{ '--value': `${percent}%` } as CSSProperties} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function MapView({ events, settings, selected, onSelect, timeExtent, profile, onProfileChange, onOpenSection }: { events: SeismicEvent[]; settings: ViewSettings; selected: SeismicEvent | null; onSelect: (event: SeismicEvent) => void; timeExtent: { min: number; max: number }; profile: ProfileTrace | null; onProfileChange: (profile: ProfileTrace | null) => void; onOpenSection: () => void }) {
  const [drawing, setDrawing] = useState(false)
  const [draft, setDraft] = useState<ProfileTrace | null>(null)
  const [corridorWidth, setCorridorWidth] = useState(profile?.widthKm ?? 50)
  const bounds = { minLon: 119.4, maxLon: 124, minLat: 21.2, maxLat: 25.7 }
  const x = (longitude: number) => 64 + ((longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 872
  const y = (latitude: number) => 44 + ((bounds.maxLat - latitude) / (bounds.maxLat - bounds.minLat)) * 512
  const stride = Math.max(1, Math.ceil(events.length / 2800))
  const rendered = events.filter((_, index) => index % stride === 0)
  const activeTrace = draft ?? profile
  const profileEvents = useMemo(() => profile ? eventsWithinProfile(events, profile) : [], [events, profile])
  const corridorPixels = activeTrace ? Math.max(12, activeTrace.widthKm * 1.75) : 0

  const changeCorridorWidth = (width: number) => {
    if (!Number.isFinite(width)) return
    const widthKm = Math.min(500, Math.max(1, Math.round(width)))
    setCorridorWidth(widthKm)
    if (profile) onProfileChange({ ...profile, widthKm })
  }

  const mapPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const local = point.matrixTransform(matrix.inverse())
    const longitude = bounds.minLon + ((Math.min(936, Math.max(64, local.x)) - 64) / 872) * (bounds.maxLon - bounds.minLon)
    const latitude = bounds.maxLat - ((Math.min(556, Math.max(44, local.y)) - 44) / 512) * (bounds.maxLat - bounds.minLat)
    return { longitude, latitude }
  }

  const startProfile = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing) return
    const point = mapPoint(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft({ startLongitude: point.longitude, startLatitude: point.latitude, endLongitude: point.longitude, endLatitude: point.latitude, widthKm: corridorWidth })
  }

  const updateProfile = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing || !draft) return
    const point = mapPoint(event)
    if (point) setDraft((current) => current ? { ...current, endLongitude: point.longitude, endLatitude: point.latitude } : current)
  }

  const finishProfile = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing || !draft) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (profileLengthKm(draft) >= 5) {
      onProfileChange(draft)
      setDrawing(false)
    }
    setDraft(null)
  }

  return <div className="alternate-view map-view"><div className="alternate-heading profile-heading"><div><span>PLAN VIEW</span><strong>Regional event distribution</strong></div><div className="profile-toolbar">
    <label className="corridor-input">Corridor<span><input type="number" min="1" max="500" step="1" inputMode="numeric" value={corridorWidth} onChange={(event) => changeCorridorWidth(event.currentTarget.valueAsNumber)} aria-label="Profile corridor width in kilometers" /><b>km</b></span></label>
    <button className={drawing ? 'active' : ''} onClick={() => { setDrawing((current) => !current); setDraft(null) }}><Crosshair size={13} />{drawing ? 'Drag on map…' : profile ? 'Redraw profile' : 'Draw profile'}</button>
    {profile && <><button onClick={onOpenSection}><ScanLine size={13} />Open profile</button><button className="quiet" onClick={() => onProfileChange(null)}><X size={13} />Clear</button></>}
  </div></div><svg className={drawing ? 'profile-drawing' : ''} viewBox="0 0 1000 620" role="img" aria-label="Two-dimensional map of seismic events" onPointerDown={startProfile} onPointerMove={updateProfile} onPointerUp={finishProfile} onPointerCancel={() => setDraft(null)}>
    <defs><pattern id="map-grid" width="100" height="80" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 80" fill="none" stroke="#4c4f53" strokeWidth="1" /></pattern></defs>
    <rect x="44" y="24" width="912" height="552" fill="url(#map-grid)" stroke="#686c71" />
    {[120, 121, 122, 123, 124].map((value) => <text key={value} x={x(value)} y="601" textAnchor="middle">{value}°E</text>)}
    {[22, 23, 24, 25].map((value) => <text key={value} x="28" y={y(value)} textAnchor="middle">{value}°N</text>)}
    {settings.layers.faults && faultLines.map((fault, index) => <polyline key={index} points={fault.map(([lon, lat]) => `${x(lon)},${y(lat)}`).join(' ')} fill="none" stroke="#c46943" strokeWidth="2" opacity=".8" />)}
    {settings.layers.events && rendered.map((event) => <circle key={event.id} cx={x(event.longitude)} cy={y(event.latitude)} r={event.id === selected?.id ? 6.5 : 1.6 + event.magnitude * .48} fill={scalarColorHex(event, settings.colorField, settings.colorTable, timeExtent.min, timeExtent.max)} opacity=".9" stroke={event.id === selected?.id ? '#fff4c4' : 'none'} strokeWidth="2" onClick={() => !drawing && onSelect(event)} />)}
    {settings.layers.stations && stations.map((station) => <g key={station.name} transform={`translate(${x(station.longitude)} ${y(station.latitude)})`}><path d="M0 -7 6 5 -6 5Z" fill="#d9d1b6" /><text x="9" y="4">{station.name}</text></g>)}
    {activeTrace && <g className="profile-trace" pointerEvents="none"><line x1={x(activeTrace.startLongitude)} y1={y(activeTrace.startLatitude)} x2={x(activeTrace.endLongitude)} y2={y(activeTrace.endLatitude)} stroke="#e2a845" strokeWidth={corridorPixels} opacity=".14" /><line x1={x(activeTrace.startLongitude)} y1={y(activeTrace.startLatitude)} x2={x(activeTrace.endLongitude)} y2={y(activeTrace.endLatitude)} stroke="#ffd477" strokeWidth="3" strokeDasharray={draft ? '8 5' : undefined} /><circle cx={x(activeTrace.startLongitude)} cy={y(activeTrace.startLatitude)} r="7" fill="#303236" stroke="#ffd477" strokeWidth="2" /><circle cx={x(activeTrace.endLongitude)} cy={y(activeTrace.endLatitude)} r="7" fill="#303236" stroke="#ffd477" strokeWidth="2" /><text className="profile-label" x={x(activeTrace.startLongitude) + 11} y={y(activeTrace.startLatitude) - 10}>A</text><text className="profile-label" x={x(activeTrace.endLongitude) + 11} y={y(activeTrace.endLatitude) - 10}>A′</text></g>}
  </svg><div className="plot-note"><Crosshair size={14} /> {drawing ? 'Click and drag to define the A–A′ profile.' : profile ? `${profileLengthKm(profile).toFixed(0)} km profile · ${profile.widthKm} km corridor · ${profileEvents.length.toLocaleString()} intersecting events` : 'Draw a profile, or select a point to link it with the inspector.'}</div></div>
}

function SectionView({ events, settings, selected, onSelect, timeExtent, profile }: { events: SeismicEvent[]; settings: ViewSettings; selected: SeismicEvent | null; onSelect: (event: SeismicEvent) => void; timeExtent: { min: number; max: number }; profile: ProfileTrace | null }) {
  const profileLength = profile ? profileLengthKm(profile) : 0
  const projected = useMemo(() => profile ? eventsWithinProfile(events, profile) : events.map((event) => ({ event, alongKm: event.longitude, offsetKm: 0 })), [events, profile])
  const x = (position: number) => profile ? 68 + (position / Math.max(1, profileLength)) * 868 : 68 + ((position - 119.4) / 4.6) * 868
  const y = (depth: number) => 48 + (depth / 300) * 510
  const stride = Math.max(1, Math.ceil(projected.length / 2800))
  const rendered = projected.filter((_, index) => index % stride === 0)
  const ticks = profile ? Array.from({ length: 5 }, (_, index) => (profileLength / 4) * index) : [120, 121, 122, 123, 124]
  return <div className="alternate-view section-view"><div className="alternate-heading"><div><span>DEPTH SECTION</span><strong>{profile ? 'A–A′ selected hypocenter profile' : 'West–east regional hypocenter profile'}</strong></div><small>{rendered.length.toLocaleString()} plotted · {profile ? `${profileLength.toFixed(0)} km × ${profile.widthKm} km corridor` : `vertical exaggeration ${settings.verticalExaggeration.toFixed(1)}×`}</small></div><svg viewBox="0 0 1000 620" role="img" aria-label="Depth cross-section of seismic events">
    <defs><pattern id="section-grid" width="108" height="85" patternUnits="userSpaceOnUse"><path d="M 108 0 L 0 0 0 85" fill="none" stroke="#4c4f53" strokeWidth="1" /></pattern><linearGradient id="depth-wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#303236" /><stop offset="1" stopColor="#222428" /></linearGradient></defs>
    <rect x="44" y="24" width="912" height="552" fill="url(#depth-wash)" stroke="#686c71" /><rect x="44" y="24" width="912" height="552" fill="url(#section-grid)" />
    {ticks.map((value) => <text key={value} x={x(value)} y="601" textAnchor="middle">{profile ? `${value.toFixed(0)} km` : `${value}°E`}</text>)}
    {[0, 50, 100, 150, 200, 250, 300].map((value) => <text key={value} x="25" y={y(value)} textAnchor="middle">{value}</text>)}
    <text x="15" y="310" transform="rotate(-90 15 310)" textAnchor="middle">DEPTH / KM</text>
    {rendered.map(({ event, alongKm }) => <circle key={event.id} cx={x(alongKm)} cy={y(event.depthKm)} r={event.id === selected?.id ? 6.5 : 1.7 + event.magnitude * .48} fill={scalarColorHex(event, settings.colorField, settings.colorTable, timeExtent.min, timeExtent.max)} opacity=".88" stroke={event.id === selected?.id ? '#fff4c4' : 'none'} strokeWidth="2" onClick={() => onSelect(event)} />)}
  </svg><div className="plot-note"><ScanLine size={14} /> {profile ? 'Distance is measured from A; events are clipped to the selected corridor.' : 'Draw A–A′ on the Map tab to create a focused section.'}</div></div>
}

function EventTable({ events, selected, onSelect }: { events: SeismicEvent[]; selected: SeismicEvent | null; onSelect: (event: SeismicEvent) => void }) {
  const rows = useMemo(() => [...events].reverse().slice(0, 600), [events])
  return <div className="table-view"><div className="alternate-heading"><div><span>EVENT TABLE</span><strong>Linked catalog records</strong></div><small>Showing {rows.length.toLocaleString()} of {events.length.toLocaleString()} visible records</small></div><div className="table-scroll"><table><thead><tr><th>Event ID</th><th>Origin</th><th>Place</th><th>Magnitude</th><th>Depth</th><th>Latitude</th><th>Longitude</th><th>Quality</th></tr></thead><tbody>{rows.map((event) => <tr key={event.id} className={selected?.id === event.id ? 'selected' : ''}><td><button onClick={() => onSelect(event)}>{event.id}</button></td><td>{formatDate(event.timestamp, true)}</td><td>{event.place}</td><td className="number">M {event.magnitude.toFixed(1)}</td><td className="number">{event.depthKm.toFixed(1)} km</td><td className="number">{event.latitude.toFixed(3)}°</td><td className="number">{event.longitude.toFixed(3)}°</td><td className="number">{Math.round(event.quality * 100)}%</td></tr>)}</tbody></table></div></div>
}

function EventInspector({ event, onClose, onOpenView }: { event: SeismicEvent; onClose: () => void; onOpenView: (view: WorkspaceView) => void }) {
  return <><header><div><span>ACTIVE SELECTION</span><strong>{event.id}</strong></div><button onClick={onClose} aria-label="Close event inspector"><X size={17} /></button></header><div className="inspector-scroll"><div className="event-hero"><span>Moment magnitude</span><strong>M {event.magnitude.toFixed(1)}</strong><p>{event.place}</p></div><dl><div><dt>Origin</dt><dd>{formatDate(event.timestamp, true)}</dd></div><div><dt>Depth</dt><dd>{event.depthKm.toFixed(1)} km</dd></div><div><dt>Latitude</dt><dd>{event.latitude.toFixed(4)}° N</dd></div><div><dt>Longitude</dt><dd>{event.longitude.toFixed(4)}° E</dd></div></dl><div className="quality-block"><div><span>Solution quality</span><strong>{Math.round(event.quality * 100)}%</strong></div><i><b style={{ width: `${event.quality * 100}%` }} /></i></div><div className="section-label separated">Locate in view</div><div className="inspector-actions"><button onClick={() => onOpenView('volume')}><Box size={15} /> 3D</button><button onClick={() => onOpenView('map')}><Map size={15} /> Map</button><button onClick={() => onOpenView('section')}><ScanLine size={15} /> Section</button><button onClick={() => onOpenView('table')}><Table2 size={15} /> Table</button></div></div></>
}

function ActivityIcon() {
  return <svg className="activity-icon" width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 9.5 3.3 6l2 2.2L8.1 3l1.8 4.2L13 4.5" stroke="currentColor" strokeWidth="1.2" /></svg>
}

export default App

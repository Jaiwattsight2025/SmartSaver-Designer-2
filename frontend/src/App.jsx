import { useEffect, useMemo, useRef, useState } from 'react'
import { snapToCell } from './lib/panelLayout'
import { editedOutline } from './lib/roofFaces'
import './App.css'
import MapCanvas from './components/MapCanvas'
import EnergyProfileCard from './components/EnergyProfileCard'
import RoofStep from './components/steps/RoofStep'
import PanelsStep from './components/steps/PanelsStep'
import BatteryStep from './components/steps/BatteryStep'
import OutputStep, { OutputReport } from './components/steps/OutputStep'
import SummaryStep, { SummaryReport } from './components/steps/SummaryStep'
import { getBuildingInsights, summariseBuildingInsights } from './services/solarApi'
import { useProject } from './context/ProjectContext'
import { useDesign } from './hooks/useDesign'
import { facesFromBuildingInsights } from './lib/roofFaces'
import { toLocal } from './lib/geo'
import { buildingMatchWarning, noCoverageMessage } from './lib/buildingMatch'
import { flagNonRoofFaces } from './lib/nonRoof'
import { markOtherRoofs } from './lib/mainRoof'
import { refineFacesWithDsm, traceFacesFromLayers } from './lib/dsmFaces'
import { getRoofLayers } from './services/dataLayers'
import { fmtKw, fmtKwh, fmtMoney } from './lib/format'

const steps = [
  { id: 'property', number: 1, label: 'Property', summary: 'Your bill and address' },
  { id: 'roof', number: 2, label: 'Roof', summary: 'Pick the roof faces' },
  { id: 'panels', number: 3, label: 'Panels', summary: 'Choose how many panels' },
  { id: 'battery', number: 4, label: 'Battery & inverter', summary: 'Storage and conversion' },
  { id: 'output', number: 5, label: 'Output', summary: 'Generation and savings' },
  { id: 'summary', number: 6, label: 'Summary', summary: 'Price and next steps' },
]

const cards = {
  property: {
    eyebrow: 'STEP 1',
    title: 'Find your property',
    description: 'Check your bill data, search for your address, then lock the map on your house.',
  },
  roof: {
    eyebrow: 'STEP 2',
    title: 'Confirm the roof',
    description: 'We load your roof faces from Google. Tick the faces you want panels on, or trace your own.',
  },
  panels: {
    eyebrow: 'STEP 3',
    title: 'Place solar panels',
    description: 'Panels go on the sunniest spots first. Change the panel size and count to suit.',
  },
  battery: {
    eyebrow: 'STEP 4',
    title: 'Battery and inverter',
    description: 'We suggest sizes from your bill. Change them and see the effect on savings.',
  },
  output: {
    eyebrow: 'STEP 5',
    title: 'Output and savings',
    description: 'How much power your system makes each month and what it does to your bill.',
  },
  summary: {
    eyebrow: 'STEP 6',
    title: 'Design summary',
    description: 'Your system, savings and an indicative price. Get a quote or save the summary.',
  },
}

const MAP_STEPS = ['property', 'roof', 'panels', 'battery']

function App() {
  const [activeStep, setActiveStep] = useState('property')
  const [addressInput, setAddressInput] = useState('')
  const [status, setStatus] = useState({ label: 'Loading map', tone: 'neutral' })
  const [mapMessage, setMapMessage] = useState('Enter a property address.')
  const [mapController, setMapController] = useState(null)
  const mapRef = useRef(null)
  const lockSeq = useRef(0)

  const { building, energyProfile, actions, project } = useProject()
  const { design } = useDesign()
  const { formattedAddress, location: coordinates, mapType, propertyFound, mapLocked, solar, roofFaces, selectedRoofFaceId } =
    building

  const activeIndex = useMemo(() => steps.findIndex((step) => step.id === activeStep), [activeStep])
  const activeCard = cards[activeStep]

  // Panel edit mode (step 3): click a panel to remove it, click a blue ghost to add one, drag to move.
  const [panelEdit, setPanelEdit] = useState(false)
  // Bumped when a trace is cancelled/finished so the map redraws clickable shapes.
  const [mapTick, setMapTick] = useState(0)
  const designChoices = project.design
  const roofConfirmed = Boolean(building.roofModelAccepted)

  const editPanels = useMemo(() => {
    const layout = design.layout
    const placed = layout.panels.map((p) => p.id)
    const removedIds = designChoices.removedPanelIds ?? []
    const pinnedIds = designChoices.pinnedPanelIds ?? []
    const api = {
      remove(id) {
        if (removedIds.includes(id) || !placed.includes(id)) return
        actions.updateDesign({
          removedPanelIds: [...new Set([...removedIds, id])],
          pinnedPanelIds: pinnedIds.filter((x) => x !== id),
          panelCount: Math.max(0, layout.count - 1),
        })
      },
      add(id) {
        if (placed.includes(id)) return
        actions.updateDesign({
          removedPanelIds: removedIds.filter((x) => x !== id),
          pinnedPanelIds: [...pinnedIds.filter((x) => x !== id), id],
          panelCount: layout.count + 1,
        })
      },
      drag(id, latLng) {
        // A click with a little hand jitter turns into a tiny drag on a draggable
        // polygon (and Google then skips the click): treat it as the click.
        const orig = layout.panels.find((p) => p.id === id)
        const moved = orig?.center ? toLocal(orig.center, latLng) : null
        if (moved && Math.hypot(moved.x, moved.y) < 0.2) {
          api.remove(id)
          return
        }
        const pool = [...layout.candidates, ...(layout.removedCells ?? [])]
        const cell = snapToCell(pool, latLng, { exclude: placed })
        if (!cell || cell.id === id) {
          setMapTick((t) => t + 1) // snap back
          return
        }
        actions.updateDesign({
          removedPanelIds: [...new Set([...removedIds.filter((x) => x !== cell.id), id])],
          pinnedPanelIds: [...pinnedIds.filter((x) => x !== id && x !== cell.id), cell.id],
          panelCount: layout.count,
        })
      },
    }
    return api
  }, [design.layout, designChoices.removedPanelIds, designChoices.pinnedPanelIds, actions])

  // Draw roof faces, no-go areas and panels on the map for the current step.
  useEffect(() => {
    const map = mapController
    if (!map) return
    const showFaces = activeStep !== 'property' || roofFaces.length > 0
    const onRoof = activeStep === 'roof'
    map.showRoofFaces(showFaces ? roofFaces : [], {
      selectedId: onRoof ? selectedRoofFaceId : null,
      dim: !onRoof,
      onSelect: onRoof ? actions.selectRoofFace : undefined,
      editableId: onRoof ? selectedRoofFaceId : null,
      onEdit: onRoof
        ? (id, vertices) => {
            const face = roofFaces.find((f) => f.id === id)
            if (face) actions.updateRoofFace(id, editedOutline(face, vertices))
          }
        : undefined,
    })
    map.showObstacles(activeStep === 'roof' || activeStep === 'panels' ? designChoices.obstacles ?? [] : [])
    const showPanelsNow = activeStep !== 'property' && activeStep !== 'roof'
    const editing = activeStep === 'panels' && panelEdit
    const layout = design.layout
    map.showPanels(showPanelsNow ? layout.panels : [], {
      ghosts: editing ? [...layout.candidates.slice(layout.count), ...(layout.removedCells ?? [])] : [],
      onPanelClick: editing ? editPanels.remove : undefined,
      onGhostClick: editing ? editPanels.add : undefined,
      onPanelDrag: editing ? editPanels.drag : undefined,
    })
  }, [
    mapController,
    activeStep,
    roofFaces,
    selectedRoofFaceId,
    design.layout,
    designChoices.obstacles,
    panelEdit,
    editPanels,
    mapTick,
    actions,
  ])

  // What the pill on top of the map says on steps 2-4 (step 1 uses mapMessage).
  const stepGuidance = mapLocked
    ? {
        roof: roofConfirmed
          ? 'Roof confirmed.'
          : 'Click a face, then drag its corner dots onto the roof edges. Confirm the roof when it looks right.',
        panels: !roofConfirmed
          ? 'Confirm the roof in step 2 first.'
          : panelEdit
            ? 'Click a panel to remove it, a blue outline to add one, or drag a panel to move it.'
            : `${design.layout.count} panels placed · ${fmtKw(design.layout.dcKw)}`,
        battery: `${fmtKw(design.layout.dcKw)} solar${design.batteryKwh > 0 ? ` + ${design.batteryKwh} kWh battery` : ''}`,
      }[activeStep]
    : null

  const goToStep = (direction) => {
    const nextIndex = Math.min(Math.max(activeIndex + direction, 0), steps.length - 1)
    setActiveStep(steps[nextIndex].id)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  const handleMapReady = (controller) => {
    mapRef.current = controller
    setMapController(controller)
    setStatus({ label: 'Map ready', tone: 'success' })
    setMapMessage('Enter a property address.')
  }

  const handleMapError = (message) => {
    setStatus({ label: 'Map unavailable', tone: 'error' })
    setMapMessage(message)
  }

  const findProperty = async () => {
    if (!addressInput.trim()) {
      setStatus({ label: 'Address required', tone: 'error' })
      setMapMessage('Enter a street address, suburb and postcode.')
      return
    }

    if (!mapRef.current) {
      setStatus({ label: 'Map not ready', tone: 'error' })
      setMapMessage('The Google map has not finished loading.')
      return
    }

    setStatus({ label: 'Searching', tone: 'neutral' })
    setMapMessage('Searching for the property…')

    try {
      const result = await mapRef.current.searchAddress(addressInput.trim())
      setAddressInput(result.formattedAddress)
      actions.setBuildingSearch(result)
      setStatus({ label: 'Property found', tone: 'success' })
      setMapMessage('Centre your house on the map, then lock the property.')
    } catch (error) {
      setStatus({ label: 'Address not found', tone: 'error' })
      setMapMessage(error.message)
    }
  }

  const lockProperty = async () => {
    if (!mapRef.current || !propertyFound || !coordinates) return

    // Use the house the customer centred on the map, not just the geocoded point.
    const centre = mapRef.current.getMap().getCenter()
    const target = centre ? { lat: centre.lat(), lng: centre.lng() } : coordinates

    const seq = (lockSeq.current += 1)
    mapRef.current.setInteractive(false)
    actions.setMapLocked(true)
    actions.setSolarConnecting()
    setStatus({ label: 'Loading roof', tone: 'neutral' })
    setMapMessage('Property locked. Loading your roof from Google…')

    try {
      const response = await getBuildingInsights(target)
      const summary = summariseBuildingInsights(response)
      const estimated = facesFromBuildingInsights(response)

      actions.setSolarSuccess({ response, summary })
      if (lockSeq.current !== seq) return

      // Precise outlines from Google's 3D roof data (one cached call per building);
      // the estimated outlines stay as the fallback.
      setMapMessage('Tracing the roof edges from Google’s 3D roof data…')
      let faces = estimated
      let traceNote = ''
      let adjacency = null
      const matchNote = buildingMatchWarning(target, response)
      try {
        const layers = await getRoofLayers(response)
        const traced = traceFacesFromLayers(response, layers)
        adjacency = traced?.adjacency ?? null
        const { faces: refinedFaces, refined } = refineFacesWithDsm(estimated, traced)
        faces = refinedFaces
        traceNote = refined
          ? ` ${refined} of ${faces.length} outlines traced from 3D roof data.`
          : ' Outlines are estimates; check the corners.'
      } catch (error) {
        console.warn('3D roof data unavailable:', error.message)
        traceNote = ' 3D roof data was unavailable, so outlines are estimates; check the corners.'
      }
      if (lockSeq.current !== seq) return

      faces = flagNonRoofFaces(faces, response, { adjacency })
      // Google sometimes merges next-door roofs into one building: keep to the roof under the map centre.
      const split = markOtherRoofs(faces, adjacency, target)
      faces = split.faces
      const flagged = faces.filter((f) => f.nonRoofLikely && !f.otherRoof).length
      if (flagged) traceNote += ` ${flagged} look${flagged === 1 ? 's' : ''} like a verandah or not roof, so ${flagged === 1 ? 'it is' : 'they are'} unticked.`
      if (split.other)
        traceNote += ` ${split.other} face${split.other === 1 ? ' is' : 's are'} on another roof (next door or a separate building) and left out - tick ${split.other === 1 ? 'it' : 'them'} in step 2 if ${split.other === 1 ? 'it is' : 'they are'} yours.`
      actions.setRoofFaces(faces)
      mapRef.current?.fitToFaces(faces)
      setStatus({ label: 'Roof loaded', tone: 'success' })
      setMapMessage(`We found ${faces.length} roof faces.${traceNote} Press Next to check them.${matchNote}`)
    } catch (error) {
      actions.setSolarError(error.details ?? { message: error.message })
      setStatus({ label: 'No roof data', tone: 'error' })
      setMapMessage(`${noCoverageMessage(error)} You can trace your roof yourself in step 2: press Next, then "+ Trace a roof face".`)
    }
  }

  const repositionProperty = () => {
    if (!mapRef.current) return

    lockSeq.current += 1
    mapRef.current.setInteractive(true)
    mapRef.current.clearOverlays()
    actions.setMapLocked(false)
    actions.resetSolar()
    actions.setRoofFaces([])
    setStatus({ label: 'Map unlocked', tone: 'neutral' })
    setMapMessage('Reposition the building, then lock the property again.')
  }

  const selectMapType = (type) => {
    actions.setMapType(type)
    mapRef.current?.setMapType(type)
  }

  const newDesign = () => {
    setAddressInput('')
    setActiveStep('property')
    actions.resetProject()
    setStatus({ label: 'Map ready', tone: 'success' })
    setMapMessage('Enter a property address.')
    mapRef.current?.reset()
  }

  const showReport = !MAP_STEPS.includes(activeStep)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            SS
          </div>
          <div>
            <div className="brand-name">SMARTSAVER ENERGY</div>
            <h1>Solar + Battery Designer</h1>
          </div>
        </div>

        <div className="status-cluster">
          <span className="version-pill">v1.0 · D2</span>
          <span className={`status-pill ${status.tone}`}>
            <span className="status-dot" />
            {status.label}
          </span>
        </div>
      </header>

      <main className="main-layout">
        <aside className="step-sidebar" aria-label="Designer steps">
          <div className="sidebar-heading">
            <span>DESIGN WORKFLOW</span>
            <strong>Six simple steps</strong>
          </div>

          <nav className="step-list">
            {steps.map((step, index) => {
              const isActive = step.id === activeStep
              const isComplete = index < activeIndex

              return (
                <button
                  type="button"
                  key={step.id}
                  className={`step-button ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
                  onClick={() => setActiveStep(step.id)}
                >
                  <span className="step-number">{isComplete ? '✓' : step.number}</span>
                  <span className="step-copy">
                    <strong>{step.label}</strong>
                    <small>{step.summary}</small>
                  </span>
                </button>
              )
            })}
          </nav>

          <div className="sidebar-note">
            <strong>{energyProfile?.profile ? 'Using your bill data' : 'No bill data yet'}</strong>
            <p>
              {energyProfile?.profile
                ? `${fmtKwh(energyProfile.profile.annualKwh)} a year at ${(energyProfile.profile.importRate * 100).toFixed(1)}c/kWh.`
                : 'Add it in step 1 to see your savings.'}
            </p>
          </div>
        </aside>

        <section className="workspace">
          <div className="workspace-toolbar">
            <div>
              <span className="workspace-eyebrow">{activeCard.eyebrow}</span>
              <h2>{activeCard.title}</h2>
              <p>{activeCard.description}</p>
            </div>

            <div className="toolbar-actions">
              <button type="button" className="secondary-button" onClick={newDesign}>
                New design
              </button>
            </div>
          </div>

          <div className="designer-grid">
            <section className="control-panel">
              <div className="panel-heading">
                <span>DESIGN CONTROLS</span>
                <strong>{activeCard.title}</strong>
              </div>

              {activeStep === 'property' && (
                <div className="control-stack">
                  <EnergyProfileCard />

                  <label htmlFor="address">Property address</label>
                  <input
                    id="address"
                    type="text"
                    value={addressInput}
                    placeholder="Street, suburb and postcode"
                    disabled={mapLocked}
                    onChange={(event) => setAddressInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') findProperty()
                    }}
                  />

                  <button type="button" className="primary-button" onClick={findProperty} disabled={mapLocked}>
                    Find property
                  </button>

                  <div className="two-column-buttons">
                    <button
                      type="button"
                      className={`secondary-button ${mapType === 'satellite' ? 'selected' : ''}`}
                      onClick={() => selectMapType('satellite')}
                    >
                      Satellite
                    </button>
                    <button
                      type="button"
                      className={`secondary-button ${mapType === 'hybrid' ? 'selected' : ''}`}
                      onClick={() => selectMapType('hybrid')}
                    >
                      Hybrid
                    </button>
                  </div>

                  {!mapLocked ? (
                    <button type="button" className="secondary-button" disabled={!propertyFound} onClick={lockProperty}>
                      Lock property
                    </button>
                  ) : (
                    <button type="button" className="secondary-button" onClick={repositionProperty}>
                      Reposition property
                    </button>
                  )}

                  <div className={`info-box ${status.tone === 'error' ? 'error' : ''}`}>{mapMessage}</div>

                  {coordinates && (
                    <div className="property-result">
                      <span>Selected property</span>
                      <strong>{formattedAddress}</strong>
                      <small>
                        {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                      </small>
                    </div>
                  )}

                  <details className="solar-panel">
                    <summary className="solar-panel-heading">
                      <span>GOOGLE ROOF DATA</span>
                      <strong>{solar.status}</strong>
                    </summary>

                    <div className="solar-metrics">
                      <div>
                        <span>HTTP status</span>
                        <strong>{solar.summary?.httpStatus ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Roof segments</span>
                        <strong>{solar.summary?.roofSegments ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Whole roof area</span>
                        <strong>{solar.summary ? `${solar.summary.wholeRoofArea.toFixed(1)} m²` : '—'}</strong>
                      </div>
                      <div>
                        <span>Maximum panels</span>
                        <strong>{solar.summary?.maximumPanels ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Imagery quality</span>
                        <strong>{solar.summary?.imageryQuality ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Imagery date</span>
                        <strong>{solar.summary?.imageryDate ?? '—'}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="secondary-button diagnostic-button"
                      disabled={!solar.response}
                      onClick={actions.toggleSolarDiagnostics}
                    >
                      {solar.showDiagnostics ? 'Hide diagnostic response' : 'Show diagnostic response'}
                    </button>

                    {solar.showDiagnostics && solar.response && (
                      <pre className="diagnostic-response">{JSON.stringify(solar.response, null, 2)}</pre>
                    )}
                  </details>
                </div>
              )}

              {activeStep === 'roof' && (
                <RoofStep
                  map={mapController}
                  onGoToProperty={() => setActiveStep('property')}
                  onGoToPanels={() => setActiveStep('panels')}
                  onRedraw={() => setMapTick((t) => t + 1)}
                />
              )}
              {activeStep === 'panels' && (
                <PanelsStep
                  onGoToRoof={() => setActiveStep('roof')}
                  roofConfirmed={roofConfirmed}
                  editMode={panelEdit}
                  onEditMode={setPanelEdit}
                />
              )}
              {activeStep === 'battery' && <BatteryStep />}
              {activeStep === 'output' && <OutputStep />}
              {activeStep === 'summary' && <SummaryStep />}

              <div className="panel-navigation">
                <button type="button" className="secondary-button" onClick={() => goToStep(-1)} disabled={activeIndex === 0}>
                  Previous
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => goToStep(1)}
                  disabled={activeIndex === steps.length - 1}
                >
                  Next step
                </button>
              </div>
            </section>

            <section className={`design-stage ${showReport ? '' : 'map-mode'}`}>
              <div className="stage-header">
                <div>
                  <span>DESIGN CANVAS</span>
                  <strong>{showReport ? (activeStep === 'output' ? 'Output and savings' : 'Your design') : 'Property and system workspace'}</strong>
                </div>
                <div className="stage-coordinates">
                  {coordinates
                    ? `lat: ${coordinates.lat.toFixed(5)}   lng: ${coordinates.lng.toFixed(5)}`
                    : 'lat: —   lng: —'}
                </div>
              </div>

              <div className={`map-stage ${showReport ? 'hidden-map' : ''}`}>
                <MapCanvas mapType={mapType} locked={mapLocked} onReady={handleMapReady} onError={handleMapError} />
                {!showReport && <div className="map-guidance">{stepGuidance ?? mapMessage}</div>}
                {activeStep === 'output' && <OutputReport />}
                {activeStep === 'summary' && <SummaryReport />}
              </div>

              <div className="metrics-strip">
                <div className="metric-card">
                  <span>Roof in use</span>
                  <strong>{design.roof.includedCount ? `${design.roof.includedAreaM2.toFixed(0)} m²` : '—'}</strong>
                </div>
                <div className="metric-card">
                  <span>Solar size</span>
                  <strong>{design.layout.count ? fmtKw(design.layout.dcKw) : '—'}</strong>
                </div>
                <div className="metric-card">
                  <span>Battery</span>
                  <strong>{design.batteryKwh > 0 ? `${design.batteryKwh} kWh` : 'None'}</strong>
                </div>
                <div className="metric-card">
                  <span>Yearly output</span>
                  <strong>{design.layout.count ? fmtKwh(design.annualGenKwh) : '—'}</strong>
                </div>
                <div className="metric-card highlight">
                  <span>Yearly saving</span>
                  <strong>{design.bill && design.layout.count ? fmtMoney(design.bill.savingAnnual) : '—'}</strong>
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

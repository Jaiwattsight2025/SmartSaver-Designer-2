import { useEffect, useMemo, useRef, useState } from 'react'
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

  const { building, energyProfile, actions } = useProject()
  const { design } = useDesign()
  const { formattedAddress, location: coordinates, mapType, propertyFound, mapLocked, solar, roofFaces, selectedRoofFaceId } =
    building

  const activeIndex = useMemo(() => steps.findIndex((step) => step.id === activeStep), [activeStep])
  const activeCard = cards[activeStep]

  // Draw roof faces and panels on the map for the current step.
  useEffect(() => {
    const map = mapController
    if (!map) return
    const showFaces = activeStep !== 'property' || roofFaces.length > 0
    map.showRoofFaces(showFaces ? roofFaces : [], {
      selectedId: activeStep === 'roof' ? selectedRoofFaceId : null,
      dim: activeStep !== 'roof',
      onSelect: activeStep === 'roof' ? actions.selectRoofFace : undefined,
    })
    map.showPanels(activeStep === 'property' || activeStep === 'roof' ? [] : design.layout.panels)
  }, [mapController, activeStep, roofFaces, selectedRoofFaceId, design.layout.panels, actions])

  // What the pill on top of the map says on steps 2-4 (step 1 uses mapMessage).
  const stepGuidance = mapLocked
    ? {
        roof: 'Yellow faces are in use. Click a face to select it.',
        panels: `${design.layout.count} panels placed · ${fmtKw(design.layout.dcKw)}`,
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

    mapRef.current.setInteractive(false)
    actions.setMapLocked(true)
    actions.setSolarConnecting()
    setStatus({ label: 'Loading roof', tone: 'neutral' })
    setMapMessage('Property locked. Loading your roof from Google…')

    try {
      const response = await getBuildingInsights(target)
      const summary = summariseBuildingInsights(response)
      const faces = facesFromBuildingInsights(response)

      actions.setSolarSuccess({ response, summary })
      actions.setRoofFaces(faces)
      setStatus({ label: 'Roof loaded', tone: 'success' })
      setMapMessage(`We found ${faces.length} roof faces. Press Next to check them.`)
    } catch (error) {
      actions.setSolarError(error.details ?? { message: error.message })
      setStatus({ label: 'No roof data', tone: 'error' })
      setMapMessage(`${error.message} You can trace your roof in step 2.`)
    }
  }

  const repositionProperty = () => {
    if (!mapRef.current) return

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
          <span className="version-pill">v1.0 · D1</span>
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

              {activeStep === 'roof' && <RoofStep map={mapController} onGoToProperty={() => setActiveStep('property')} />}
              {activeStep === 'panels' && <PanelsStep onGoToRoof={() => setActiveStep('roof')} />}
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

            <section className="design-stage">
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

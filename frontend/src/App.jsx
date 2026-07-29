import { useMemo, useRef, useState } from 'react'
import './App.css'
import MapCanvas from './components/MapCanvas'
import { getBuildingInsights, summariseBuildingInsights } from './services/solarApi'

const steps = [
  { id: 'property', number: 1, label: 'Property', summary: 'Find and lock the site' },
  { id: 'roof', number: 2, label: 'Roof', summary: 'Confirm roof geometry' },
  { id: 'panels', number: 3, label: 'Panels', summary: 'Place and size the PV array' },
  { id: 'battery', number: 4, label: 'Battery & inverter', summary: 'Configure storage and conversion' },
  { id: 'output', number: 5, label: 'Output', summary: 'Review irradiance and generation' },
  { id: 'summary', number: 6, label: 'Summary', summary: 'Review the completed design' },
]

const cards = {
  property: {
    eyebrow: 'STEP 1',
    title: 'Find your property',
    description:
      'Search for the site address, position the building and lock the map before starting the roof design.',
  },
  roof: {
    eyebrow: 'STEP 2',
    title: 'Confirm the roof',
    description:
      'Load Solar API data, review the roof outline and faces, then accept the roof model.',
  },
  panels: {
    eyebrow: 'STEP 3',
    title: 'Place solar panels',
    description:
      'Select a module, apply setbacks and fill the accepted roof faces.',
  },
  battery: {
    eyebrow: 'STEP 4',
    title: 'Configure battery and inverter',
    description:
      'Choose the inverter, battery range and storage capacity, then review compatibility.',
  },
  output: {
    eyebrow: 'STEP 5',
    title: 'Review output and irradiance',
    description:
      'Review annual and monthly irradiance, estimated generation and battery charging opportunity.',
  },
  summary: {
    eyebrow: 'STEP 6',
    title: 'Design summary',
    description:
      'Review the completed solar and battery design before exporting the summary.',
  },
}

function App() {
  const [activeStep, setActiveStep] = useState('property')
  const [address, setAddress] = useState('')
  const [mapType, setMapType] = useState('satellite')
  const [propertyFound, setPropertyFound] = useState(false)
  const [mapLocked, setMapLocked] = useState(false)
  const [status, setStatus] = useState({ label: 'Loading map', tone: 'neutral' })
  const [mapMessage, setMapMessage] = useState('Enter a property address.')
  const [coordinates, setCoordinates] = useState(null)
  const [formattedAddress, setFormattedAddress] = useState('')
  const [solarStatus, setSolarStatus] = useState('Not tested')
  const [solarSummary, setSolarSummary] = useState(null)
  const [solarResponse, setSolarResponse] = useState(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const mapRef = useRef(null)

  const activeIndex = useMemo(
    () => steps.findIndex((step) => step.id === activeStep),
    [activeStep],
  )

  const activeCard = cards[activeStep]

  const goToStep = (direction) => {
    const nextIndex = Math.min(
      Math.max(activeIndex + direction, 0),
      steps.length - 1,
    )
    setActiveStep(steps[nextIndex].id)
  }

  const handleMapReady = (controller) => {
    mapRef.current = controller
    setStatus({ label: 'Map ready', tone: 'success' })
    setMapMessage('Enter a property address.')
  }

  const handleMapError = (message) => {
    setStatus({ label: 'Map unavailable', tone: 'error' })
    setMapMessage(message)
  }

  const findProperty = async () => {
    if (!address.trim()) {
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
      const result = await mapRef.current.searchAddress(address.trim())
      setAddress(result.formattedAddress)
      setFormattedAddress(result.formattedAddress)
      setCoordinates(result.location)
      setPropertyFound(true)
      setMapLocked(false)
      setStatus({ label: 'Property found', tone: 'success' })
      setMapMessage('Position the building, then lock the property.')
    } catch (error) {
      setPropertyFound(false)
      setCoordinates(null)
      setStatus({ label: 'Address not found', tone: 'error' })
      setMapMessage(error.message)
    }
  }

  const lockProperty = async () => {
    if (!mapRef.current || !propertyFound || !coordinates) return

    mapRef.current.setInteractive(false)
    setMapLocked(true)
    setSolarStatus('Connecting')
    setSolarSummary(null)
    setSolarResponse(null)
    setShowDiagnostics(false)
    setStatus({ label: 'Testing Solar API', tone: 'neutral' })
    setMapMessage('Property locked. Retrieving building insights…')

    try {
      const response = await getBuildingInsights(coordinates)
      const summary = summariseBuildingInsights(response)

      setSolarResponse(response)
      setSolarSummary(summary)
      setSolarStatus('Connected')
      setStatus({ label: 'Solar API connected', tone: 'success' })
      setMapMessage(
        `Solar API connected. ${summary.roofSegments} roof segments were returned.`,
      )
    } catch (error) {
      setSolarStatus('Unavailable')
      setSolarResponse(error.details ?? { message: error.message })
      setStatus({ label: 'Solar API unavailable', tone: 'error' })
      setMapMessage(error.message)
    }
  }

  const repositionProperty = () => {
    if (!mapRef.current) return

    mapRef.current.setInteractive(true)
    setMapLocked(false)
    setSolarStatus('Not tested')
    setSolarSummary(null)
    setSolarResponse(null)
    setShowDiagnostics(false)
    setStatus({ label: 'Map unlocked', tone: 'neutral' })
    setMapMessage('Reposition the building, then lock the property again.')
  }

  const selectMapType = (type) => {
    setMapType(type)
    mapRef.current?.setMapType(type)
  }

  const newDesign = () => {
    setAddress('')
    setFormattedAddress('')
    setCoordinates(null)
    setPropertyFound(false)
    setMapLocked(false)
    setActiveStep('property')
    setMapType('satellite')
    setSolarStatus('Not tested')
    setSolarSummary(null)
    setSolarResponse(null)
    setShowDiagnostics(false)
    setStatus({ label: 'Map ready', tone: 'success' })
    setMapMessage('Enter a property address.')
    mapRef.current?.reset()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">SS</div>
          <div>
            <div className="brand-name">SMARTSAVER ENERGY</div>
            <h1>Solar + Battery Designer</h1>
          </div>
        </div>

        <div className="status-cluster">
          <span className="version-pill">MILESTONE 4</span>
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
            <strong>Fixed v1.0 scope</strong>
            <p>Property, roof, panels, battery and inverter, output, then summary.</p>
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
              <button type="button" className="secondary-button" disabled>
                Save draft
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
                  <label htmlFor="address">Property address</label>
                  <input
                    id="address"
                    type="text"
                    value={address}
                    placeholder="Street, suburb and postcode"
                    disabled={mapLocked}
                    onChange={(event) => setAddress(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') findProperty()
                    }}
                  />

                  <button
                    type="button"
                    className="primary-button"
                    onClick={findProperty}
                    disabled={mapLocked}
                  >
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
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!propertyFound}
                      onClick={lockProperty}
                    >
                      Lock property
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={repositionProperty}
                    >
                      Reposition property
                    </button>
                  )}

                  <div className={`info-box ${status.tone === 'error' ? 'error' : ''}`}>
                    {mapMessage}
                  </div>

                  {coordinates && (
                    <div className="property-result">
                      <span>Selected property</span>
                      <strong>{formattedAddress}</strong>
                      <small>
                        {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                      </small>
                    </div>
                  )}

                  <div className="solar-panel">
                    <div className="solar-panel-heading">
                      <span>SOLAR API</span>
                      <strong>{solarStatus}</strong>
                    </div>

                    <div className="solar-metrics">
                      <div>
                        <span>HTTP status</span>
                        <strong>{solarSummary?.httpStatus ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Roof segments</span>
                        <strong>{solarSummary?.roofSegments ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Whole roof area</span>
                        <strong>
                          {solarSummary
                            ? `${solarSummary.wholeRoofArea.toFixed(1)} m²`
                            : '—'}
                        </strong>
                      </div>
                      <div>
                        <span>Maximum panels</span>
                        <strong>{solarSummary?.maximumPanels ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Imagery quality</span>
                        <strong>{solarSummary?.imageryQuality ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Imagery date</span>
                        <strong>{solarSummary?.imageryDate ?? '—'}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="secondary-button diagnostic-button"
                      disabled={!solarResponse}
                      onClick={() => setShowDiagnostics((current) => !current)}
                    >
                      {showDiagnostics ? 'Hide diagnostic response' : 'Show diagnostic response'}
                    </button>

                    {showDiagnostics && solarResponse && (
                      <pre className="diagnostic-response">
                        {JSON.stringify(solarResponse, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {activeStep !== 'property' && (
                <div className="placeholder-controls">
                  <div className="placeholder-icon">{activeIndex + 1}</div>
                  <strong>{activeCard.title}</strong>
                  <p>
                    This section remains locked to its dedicated milestone.
                  </p>
                </div>
              )}

              <div className="panel-navigation">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => goToStep(-1)}
                  disabled={activeIndex === 0}
                >
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
                  <strong>Property and system workspace</strong>
                </div>
                <div className="stage-coordinates">
                  {coordinates
                    ? `lat: ${coordinates.lat.toFixed(5)}   lng: ${coordinates.lng.toFixed(5)}`
                    : 'lat: —   lng: —'}
                </div>
              </div>

              <div className="map-stage">
                <MapCanvas
                  mapType={mapType}
                  locked={mapLocked}
                  onReady={handleMapReady}
                  onError={handleMapError}
                />
                <div className="map-guidance">{mapMessage}</div>
              </div>

              <div className="metrics-strip">
                <div className="metric-card">
                  <span>Roof area</span>
                  <strong>
                    {solarSummary
                      ? `${solarSummary.wholeRoofArea.toFixed(1)} m²`
                      : '—'}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>PV capacity</span>
                  <strong>—</strong>
                </div>
                <div className="metric-card">
                  <span>Battery capacity</span>
                  <strong>—</strong>
                </div>
                <div className="metric-card">
                  <span>Annual output</span>
                  <strong>—</strong>
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

let mapsPromise

function loadGoogleMaps() {
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps)
  }

  if (mapsPromise) return mapsPromise

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()

  if (!apiKey) {
    return Promise.reject(
      new Error('Add VITE_GOOGLE_MAPS_API_KEY to the frontend .env.local file.'),
    )
  }

  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = '__smartSaverGoogleMapsReady'

    window[callbackName] = () => {
      delete window[callbackName]
      resolve(window.google.maps)
    }

    const existingScript = document.querySelector(
      'script[data-smartsaver-google-maps="true"]',
    )

    if (existingScript) {
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Google Maps failed to load.')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.dataset.smartsaverGoogleMaps = 'true'
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(apiKey)}` +
      '&v=weekly' +
      '&loading=async' +
      `&callback=${callbackName}`

    script.onerror = () => {
      delete window[callbackName]
      mapsPromise = undefined
      reject(new Error('Google Maps failed to load. Check the API key restrictions.'))
    }

    document.head.appendChild(script)
  })

  return mapsPromise
}

function geocodeAddress(geocoder, address) {
  return new Promise((resolve, reject) => {
    geocoder.geocode(
      {
        address,
        region: 'AU',
        componentRestrictions: { country: 'AU' },
      },
      (results, status) => {
        if (status !== 'OK' || !results?.length) {
          reject(
            new Error(
              status === 'ZERO_RESULTS'
                ? 'Address not found. Include the suburb and postcode.'
                : `Address search failed: ${status}`,
            ),
          )
          return
        }

        resolve(results[0])
      },
    )
  })
}

export async function createMapController(container) {
  if (!container) {
    throw new Error('The map container is unavailable.')
  }

  const maps = await loadGoogleMaps()
  const defaultCentre = { lat: -37.8136, lng: 144.9631 }

  const map = new maps.Map(container, {
    center: defaultCentre,
    zoom: 20,
    mapTypeId: maps.MapTypeId.SATELLITE,
    tilt: 0,
    heading: 0,
    clickableIcons: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    gestureHandling: 'greedy',
  })

  const geocoder = new maps.Geocoder()

  // Drawn on top of the satellite image: roof faces, panels, a face being traced.
  const overlays = { faces: [], panels: [], tracePoints: [], traceLine: null, traceMarkers: [], traceListener: null }
  const clearList = (list) => {
    list.forEach((o) => o.setMap(null))
    list.length = 0
  }

  const controller = {
    async searchAddress(address) {
      const result = await geocodeAddress(geocoder, address)

      if (result.geometry.viewport) {
        map.fitBounds(result.geometry.viewport)

        maps.event.addListenerOnce(map, 'idle', () => {
          const zoom = map.getZoom() ?? 20
          if (zoom < 20) map.setZoom(20)
          if (zoom > 21) map.setZoom(21)
        })
      } else {
        map.setCenter(result.geometry.location)
        map.setZoom(21)
      }

      return {
        formattedAddress: result.formatted_address,
        location: {
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng(),
        },
      }
    },

    setMapType(type) {
      const mapTypes = {
        satellite: maps.MapTypeId.SATELLITE,
        hybrid: maps.MapTypeId.HYBRID,
      }

      const nextType = mapTypes[type] ?? maps.MapTypeId.SATELLITE

      map.setOptions({
        mapTypeId: nextType,
        tilt: 0,
        heading: 0,
      })
    },

    setInteractive(enabled) {
      map.setOptions({
        draggable: enabled,
        scrollwheel: enabled,
        disableDoubleClickZoom: !enabled,
        keyboardShortcuts: enabled,
        gestureHandling: enabled ? 'greedy' : 'none',
        zoomControl: enabled,
        fullscreenControl: enabled,
      })
    },

    reset() {
      controller.clearOverlays()
      map.setOptions({
        center: defaultCentre,
        zoom: 20,
        mapTypeId: maps.MapTypeId.SATELLITE,
        tilt: 0,
        heading: 0,
      })
      controller.setInteractive(true)
    },

    getMap() {
      return map
    },

    /** faces: roof faces; opts: { selectedId, dim, onSelect(id) } */
    showRoofFaces(faces, opts = {}) {
      clearList(overlays.faces)
      for (const face of faces ?? []) {
        if (!face.vertices || face.vertices.length < 3) continue
        const selected = face.id === opts.selectedId
        const polygon = new maps.Polygon({
          map,
          paths: face.vertices,
          clickable: !overlays.traceListener && Boolean(opts.onSelect),
          strokeColor: selected ? '#ffffff' : face.included ? '#ffc400' : '#a5afb9',
          strokeOpacity: opts.dim ? 0.6 : 0.95,
          strokeWeight: selected ? 3 : 2,
          fillColor: face.included ? '#ffc400' : '#a5afb9',
          fillOpacity: opts.dim ? 0.06 : face.included ? 0.22 : 0.08,
          zIndex: selected ? 3 : 2,
        })
        if (opts.onSelect) polygon.addListener('click', () => opts.onSelect(face.id))
        overlays.faces.push(polygon)
      }
    },

    /** panels: [{ corners: [{lat,lng}x4] }] */
    showPanels(panels) {
      clearList(overlays.panels)
      for (const panel of panels ?? []) {
        overlays.panels.push(
          new maps.Polygon({
            map,
            paths: panel.corners,
            clickable: false,
            strokeColor: '#9ec5ff',
            strokeOpacity: 0.9,
            strokeWeight: 1,
            fillColor: '#10213f',
            fillOpacity: 0.85,
            zIndex: 4,
          }),
        )
      }
    },

    /** Click points on the map to outline a roof face. onChange(points) after each click. */
    startTracing(onChange) {
      controller.cancelTracing()
      overlays.faces.forEach((p) => p.setOptions({ clickable: false }))
      overlays.traceLine = new maps.Polyline({
        map,
        path: [],
        strokeColor: '#65d487',
        strokeWeight: 3,
        clickable: false,
        zIndex: 6,
      })
      map.setOptions({ draggableCursor: 'crosshair' })
      overlays.traceListener = map.addListener('click', (event) => {
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
        overlays.tracePoints.push(point)
        overlays.traceLine.setPath([...overlays.tracePoints, overlays.tracePoints[0]])
        overlays.traceMarkers.push(
          new maps.Circle({
            map,
            center: point,
            radius: 0.25,
            strokeColor: '#65d487',
            fillColor: '#65d487',
            fillOpacity: 1,
            clickable: false,
            zIndex: 7,
          }),
        )
        onChange?.([...overlays.tracePoints])
      })
    },

    undoTracePoint() {
      overlays.tracePoints.pop()
      overlays.traceMarkers.pop()?.setMap(null)
      overlays.traceLine?.setPath(
        overlays.tracePoints.length ? [...overlays.tracePoints, overlays.tracePoints[0]] : [],
      )
      return [...overlays.tracePoints]
    },

    /** Stops tracing and returns the points clicked. */
    finishTracing() {
      const points = [...overlays.tracePoints]
      controller.cancelTracing()
      return points
    },

    cancelTracing() {
      if (overlays.traceListener) maps.event.removeListener(overlays.traceListener)
      overlays.traceListener = null
      overlays.traceLine?.setMap(null)
      overlays.traceLine = null
      clearList(overlays.traceMarkers)
      overlays.tracePoints = []
      map.setOptions({ draggableCursor: null })
    },

    clearOverlays() {
      controller.cancelTracing()
      clearList(overlays.faces)
      clearList(overlays.panels)
    },

    /** Centre on a point without changing zoom (used when the map is locked). */
    centreOn(point, zoom) {
      if (!point) return
      map.setCenter(point)
      if (zoom) map.setZoom(zoom)
    },
  }

  return controller
}

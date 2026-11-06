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
  const overlays = { faces: [], panels: [], obstacles: [], tracePoints: [], traceLine: null, traceMarkers: [], traceListener: null }
  const clearList = (list) => {
    list.forEach((o) => o.setMap(null))
    list.length = 0
  }

  // Dev-only hook so the browser e2e can find panels / corners on the real map.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const probe = new maps.OverlayView()
    probe.onAdd = () => {}
    probe.draw = () => {}
    probe.onRemove = () => {}
    probe.setMap(map)
    const centreOf = (poly) => {
      const pts = poly.getPath().getArray()
      return { lat: pts.reduce((t, p) => t + p.lat(), 0) / pts.length, lng: pts.reduce((t, p) => t + p.lng(), 0) / pts.length }
    }
    window.__ssdMap = {
      toPixel(ll) {
        const p = probe.getProjection()?.fromLatLngToContainerPixel(new maps.LatLng(ll.lat, ll.lng))
        return p ? { x: p.x, y: p.y } : null
      },
      panels: () => overlays.panels.filter((p) => p.get('ssdKind') === 'panel').map((p) => ({ id: p.get('ssdId'), ...centreOf(p) })),
      ghosts: () => overlays.panels.filter((p) => p.get('ssdKind') === 'ghost').map((p) => ({ id: p.get('ssdId'), ...centreOf(p) })),
      centreOn: (ll) => map.setCenter(ll),
      editableFace: () => {
        const f = overlays.faces.find((p) => p.getEditable())
        return f ? f.getPath().getArray().map((ll) => ({ lat: ll.lat(), lng: ll.lng() })) : null
      },
    }
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

    /**
     * faces: roof faces; opts: { selectedId, dim, onSelect(id), editableId, onEdit(id, vertices) }.
     * The editable face gets corner handles (drag a corner, drag a mid-point to add one,
     * right-click a corner to delete it).
     */
    showRoofFaces(faces, opts = {}) {
      clearList(overlays.faces)
      for (const face of faces ?? []) {
        if (!face.vertices || face.vertices.length < 3) continue
        const selected = face.id === opts.selectedId
        const editable = Boolean(opts.onEdit) && face.id === opts.editableId && !overlays.traceListener
        const lowConfidence = face.outlineConfidence === 'low' && !face.outlineEdited
        const polygon = new maps.Polygon({
          map,
          paths: face.vertices,
          editable,
          clickable: !overlays.traceListener && Boolean(opts.onSelect || editable),
          strokeColor: selected ? '#ffffff' : lowConfidence ? '#ff8a3d' : face.included ? '#f5a623' : '#a5afb9',
          strokeOpacity: opts.dim ? 0.6 : face.otherRoof && !face.included && !selected ? 0.45 : 0.95,
          strokeWeight: selected ? 3 : face.otherRoof && !face.included ? 1 : 2,
          fillColor: face.included ? '#f5a623' : '#a5afb9',
          fillOpacity: opts.dim ? 0.06 : face.included ? 0.22 : face.otherRoof ? 0.03 : 0.08,
          zIndex: selected ? 3 : 2,
        })
        if (opts.onSelect) polygon.addListener('click', () => opts.onSelect(face.id))
        if (editable) {
          const path = polygon.getPath()
          let timer = null
          const emit = () => {
            clearTimeout(timer)
            timer = setTimeout(() => {
              const pts = path.getArray().map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))
              if (pts.length >= 3) opts.onEdit(face.id, pts)
            }, 120)
          }
          path.addListener('set_at', emit)
          path.addListener('insert_at', emit)
          path.addListener('remove_at', emit)
          polygon.addListener('contextmenu', (e) => {
            if (e.vertex != null && path.getLength() > 3) path.removeAt(e.vertex)
          })
        }
        overlays.faces.push(polygon)
      }
    },

    /**
     * panels: [{ id, corners }]. opts: { ghosts: [{ id, corners }], onPanelClick(id),
     * onGhostClick(id), onPanelDrag(id, {lat,lng}) }. Ghosts are free spots the
     * customer can click to add a panel.
     */
    showPanels(panels, opts = {}) {
      clearList(overlays.panels)
      const editing = Boolean(opts.onPanelClick || opts.onPanelDrag)
      for (const ghost of opts.ghosts ?? []) {
        const g = new maps.Polygon({
          map,
          paths: ghost.corners,
          clickable: Boolean(opts.onGhostClick),
          strokeColor: '#9ec5ff',
          strokeOpacity: 0.7,
          strokeWeight: 1,
          fillColor: '#9ec5ff',
          fillOpacity: 0.08,
          zIndex: 4,
        })
        g.setValues({ ssdKind: 'ghost', ssdId: ghost.id })
        if (opts.onGhostClick) g.addListener('click', () => opts.onGhostClick(ghost.id))
        overlays.panels.push(g)
      }
      for (const panel of panels ?? []) {
        const poly = new maps.Polygon({
          map,
          paths: panel.corners,
          clickable: editing,
          draggable: Boolean(opts.onPanelDrag),
          strokeColor: '#9ec5ff',
          strokeOpacity: 0.9,
          strokeWeight: 1,
          fillColor: '#10213f',
          fillOpacity: 0.85,
          zIndex: 5,
        })
        poly.setValues({ ssdKind: 'panel', ssdId: panel.id })
        // A real drag also fires a click on some browsers. Ignore that click so
        // a move is not immediately undone as a remove.
        let dragged = false
        if (opts.onPanelDrag) {
          poly.addListener('drag', () => {
            dragged = true
          })
          poly.addListener('dragend', () => {
            const pts = poly.getPath().getArray()
            const lat = pts.reduce((t, p) => t + p.lat(), 0) / pts.length
            const lng = pts.reduce((t, p) => t + p.lng(), 0) / pts.length
            opts.onPanelDrag(panel.id, { lat, lng })
          })
        }
        if (opts.onPanelClick) {
          poly.addListener('click', () => {
            if (dragged) return
            opts.onPanelClick(panel.id)
          })
        }
        overlays.panels.push(poly)
      }
    },

    /** No-go areas (vents, skylights, aircon): red outlines. opts: { onClick(id) } */
    showObstacles(obstacles, opts = {}) {
      clearList(overlays.obstacles)
      for (const ob of obstacles ?? []) {
        if (!ob.vertices || ob.vertices.length < 3) continue
        const poly = new maps.Polygon({
          map,
          paths: ob.vertices,
          clickable: Boolean(opts.onClick),
          strokeColor: '#ff4d4f',
          strokeOpacity: 1,
          strokeWeight: 2,
          fillColor: '#ff4d4f',
          fillOpacity: 0.35,
          zIndex: 6,
        })
        if (opts.onClick) poly.addListener('click', () => opts.onClick(ob.id))
        overlays.obstacles.push(poly)
      }
    },

    /** Click points on the map to outline a roof face. onChange(points) after each click. */
    startTracing(onChange, { color = '#20a97c' } = {}) {
      controller.cancelTracing()
      overlays.faces.forEach((p) => p.setOptions({ clickable: false, editable: false }))
      overlays.panels.forEach((p) => p.setOptions({ clickable: false }))
      overlays.obstacles.forEach((p) => p.setOptions({ clickable: false }))
      overlays.traceLine = new maps.Polyline({
        map,
        path: [],
        strokeColor: color,
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
            strokeColor: color,
            fillColor: color,
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
      clearList(overlays.obstacles)
    },

    /** Centre on a point without changing zoom (used when the map is locked). */
    centreOn(point, zoom) {
      if (!point) return
      map.setCenter(point)
      if (zoom) map.setZoom(zoom)
    },

    /** Zoom the map so every roof face fills the view (max zoom 21). */
    fitToFaces(faces) {
      const points = (faces ?? []).flatMap((face) => face.vertices ?? [])
      if (points.length < 3) return
      const bounds = new maps.LatLngBounds()
      points.forEach((point) => bounds.extend(point))
      map.fitBounds(bounds, 40)
      maps.event.addListenerOnce(map, 'idle', () => {
        if (map.getZoom() > 21) map.setZoom(21)
      })
    },
  }

  return controller
}

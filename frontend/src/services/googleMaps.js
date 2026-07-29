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
  }

  return controller
}

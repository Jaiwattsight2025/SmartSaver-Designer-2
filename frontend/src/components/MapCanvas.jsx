import { useEffect, useRef } from 'react'
import { createMapController } from '../services/googleMaps'

function MapCanvas({ mapType, locked, onReady, onError }) {
  const containerRef = useRef(null)
  const controllerRef = useRef(null)
  const readyCallbackRef = useRef(onReady)
  const errorCallbackRef = useRef(onError)

  useEffect(() => {
    readyCallbackRef.current = onReady
    errorCallbackRef.current = onError
  }, [onReady, onError])

  useEffect(() => {
    let cancelled = false

    async function initialiseMap() {
      try {
        const controller = await createMapController(containerRef.current)
        if (cancelled) return
        controllerRef.current = controller
        readyCallbackRef.current(controller)
      } catch (error) {
        if (!cancelled) {
          errorCallbackRef.current(error.message)
        }
      }
    }

    initialiseMap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.setMapType(mapType)
  }, [mapType])

  useEffect(() => {
    controllerRef.current?.setInteractive(!locked)
  }, [locked])

  return <div ref={containerRef} className="google-map" aria-label="Property map" />
}

export default MapCanvas

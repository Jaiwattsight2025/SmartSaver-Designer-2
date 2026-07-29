const SOLAR_ENDPOINT =
  'https://solar.googleapis.com/v1/buildingInsights:findClosest'

function getApiKey() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()

  if (!key) {
    throw new Error(
      'VITE_GOOGLE_MAPS_API_KEY is missing from the frontend .env.local file.',
    )
  }

  return key
}

function formatGoogleError(status, body) {
  const apiMessage = body?.error?.message
  const apiStatus = body?.error?.status

  if (status === 403) {
    return (
      apiMessage ||
      'Google rejected the Solar API request. Check that Solar API is enabled and allowed for this key.'
    )
  }

  if (status === 404 || apiStatus === 'NOT_FOUND') {
    return (
      apiMessage ||
      'No supported Solar API building was found near the selected property.'
    )
  }

  if (status === 400) {
    return apiMessage || 'Google rejected the Solar API request parameters.'
  }

  return apiMessage || `Solar API request failed with HTTP ${status}.`
}

export async function getBuildingInsights({ lat, lng }) {
  const url = new URL(SOLAR_ENDPOINT)

  url.searchParams.set('location.latitude', String(lat))
  url.searchParams.set('location.longitude', String(lng))
  url.searchParams.set('requiredQuality', 'MEDIUM')
  url.searchParams.set('key', getApiKey())

  let response

  try {
    response = await fetch(url)
  } catch (cause) {
    const error = new Error(
      'The Solar API request could not reach Google. Check the internet connection.',
    )
    error.details = {
      type: 'NETWORK_ERROR',
      message: cause instanceof Error ? cause.message : String(cause),
    }
    throw error
  }

  let body = null

  try {
    body = await response.json()
  } catch {
    body = {
      message: 'Google returned a response that was not valid JSON.',
    }
  }

  if (!response.ok) {
    const error = new Error(formatGoogleError(response.status, body))
    error.details = {
      httpStatus: response.status,
      response: body,
    }
    throw error
  }

  return {
    ...body,
    __httpStatus: response.status,
  }
}

function formatDate(date) {
  if (!date?.year) return '—'

  const month = String(date.month ?? 1).padStart(2, '0')
  const day = String(date.day ?? 1).padStart(2, '0')

  return `${day}/${month}/${date.year}`
}

export function summariseBuildingInsights(response) {
  const potential = response?.solarPotential ?? {}
  const roofSegments = Array.isArray(potential.roofSegmentStats)
    ? potential.roofSegmentStats
    : []

  return {
    httpStatus: response?.__httpStatus ?? 200,
    roofSegments: roofSegments.length,
    wholeRoofArea: Number(potential.wholeRoofStats?.areaMeters2 ?? 0),
    maximumPanels: Number(potential.maxArrayPanelsCount ?? 0),
    imageryQuality: response?.imageryQuality ?? '—',
    imageryDate: formatDate(response?.imageryDate),
  }
}

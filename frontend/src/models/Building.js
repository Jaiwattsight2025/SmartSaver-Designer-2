export function createEmptyBuilding() {
  return {
    address: '',
    formattedAddress: '',
    location: null,
    mapType: 'satellite',
    propertyFound: false,
    mapLocked: false,
    outline: [],
    roofFaces: [],
    selectedRoofFaceId: null,
    roofModelAccepted: false,
    solar: {
      status: 'Not tested',
      summary: null,
      response: null,
      showDiagnostics: false,
    },
  }
}

export function createBuildingFromSearchResult(result) {
  return {
    address: result.formattedAddress,
    formattedAddress: result.formattedAddress,
    location: result.location,
    propertyFound: true,
    mapLocked: false,
  }
}

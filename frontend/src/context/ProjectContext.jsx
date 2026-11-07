import { createContext, useContext, useMemo, useReducer } from 'react'
import { createEmptyProject, touchProject } from '../models/Project'
import { captureHandoffFromBrowser } from '../lib/designerHandoff'
import { SYNTHETIC_LAT, SYNTHETIC_LNG, syntheticRoofFaces } from '../lib/syntheticFixture'

function createInitialProject() {
  const project = createEmptyProject()
  if (typeof window === 'undefined') return project
  // Strip #handoff= before the first paint, including on the synthetic preview.
  captureHandoffFromBrowser()
  if (new URLSearchParams(window.location.search).get('preview') === 'synthetic') {
    const faces = syntheticRoofFaces()
    project.building = {
      ...project.building,
      address: 'Synthetic fixture VIC 3000',
      formattedAddress: 'Synthetic fixture VIC 3000',
      location: { lat: SYNTHETIC_LAT, lng: SYNTHETIC_LNG },
      propertyFound: true,
      mapLocked: true,
      roofFaces: faces,
      selectedRoofFaceId: faces[0]?.id ?? null,
      roofModelAccepted: true,
      solar: {
        status: 'Connected',
        summary: { imageryQuality: 'SYNTHETIC FIXTURE', imageryDate: '—' },
        response: {
          name: 'synthetic-fixture',
          center: { latitude: SYNTHETIC_LAT, longitude: SYNTHETIC_LNG },
          solarPotential: { roofSegmentStats: [] },
        },
        showDiagnostics: false,
      },
    }
    return project
  }
  return project
}

const ProjectContext = createContext(null)

const actionTypes = {
  RESET_PROJECT: 'RESET_PROJECT',
  SET_BUILDING_SEARCH: 'SET_BUILDING_SEARCH',
  SET_MAP_TYPE: 'SET_MAP_TYPE',
  SET_MAP_LOCKED: 'SET_MAP_LOCKED',
  RESET_SOLAR: 'RESET_SOLAR',
  SET_SOLAR_CONNECTING: 'SET_SOLAR_CONNECTING',
  SET_SOLAR_SUCCESS: 'SET_SOLAR_SUCCESS',
  SET_SOLAR_ERROR: 'SET_SOLAR_ERROR',
  TOGGLE_SOLAR_DIAGNOSTICS: 'TOGGLE_SOLAR_DIAGNOSTICS',
  SET_ROOF_FACES: 'SET_ROOF_FACES',
  SELECT_ROOF_FACE: 'SELECT_ROOF_FACE',
  ACCEPT_ROOF_MODEL: 'ACCEPT_ROOF_MODEL',
  TOGGLE_ROOF_FACE: 'TOGGLE_ROOF_FACE',
  UPDATE_ROOF_FACE: 'UPDATE_ROOF_FACE',
  UPDATE_ROOF_FACE_LIVE: 'UPDATE_ROOF_FACE_LIVE',
  ADD_ROOF_FACE: 'ADD_ROOF_FACE',
  REMOVE_ROOF_FACE: 'REMOVE_ROOF_FACE',
  SET_ENERGY_PROFILE: 'SET_ENERGY_PROFILE',
  CLEAR_ENERGY_PROFILE: 'CLEAR_ENERGY_PROFILE',
  UPDATE_DESIGN: 'UPDATE_DESIGN',
  UNCONFIRM_ROOF: 'UNCONFIRM_ROOF',
  SET_DESIGN_SNAPSHOT: 'SET_DESIGN_SNAPSHOT',
  APPLY_HANDOFF_SUCCESS: 'APPLY_HANDOFF_SUCCESS',
  APPLY_HANDOFF_ERROR: 'APPLY_HANDOFF_ERROR',
}

// Any change to the roof means it has to be confirmed again, and hand-picked
// panel spots no longer line up, so they are cleared.
function withFaces(state, roofFaces, selectedRoofFaceId = state.building.selectedRoofFaceId) {
  return touchProject({
    ...state,
    building: { ...state.building, roofFaces, selectedRoofFaceId, roofModelAccepted: false },
    design: { ...state.design, removedPanelIds: [], pinnedPanelIds: [] },
    designSnapshot: null,
  })
}

function reducer(state, action) {
  switch (action.type) {
    case actionTypes.RESET_PROJECT:
      // Keep the customer's bill data: a new design is usually the same household.
      return { ...createEmptyProject(), energyProfile: state.energyProfile }

    case actionTypes.SET_BUILDING_SEARCH:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          address: action.payload.formattedAddress,
          formattedAddress: action.payload.formattedAddress,
          location: action.payload.location,
          propertyFound: true,
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
        },
      })

    case actionTypes.SET_MAP_TYPE:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          mapType: action.payload,
        },
      })

    case actionTypes.SET_MAP_LOCKED:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          mapLocked: action.payload,
        },
      })

    case actionTypes.RESET_SOLAR:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          solar: {
            status: 'Not tested',
            summary: null,
            response: null,
            showDiagnostics: false,
          },
        },
      })

    case actionTypes.SET_SOLAR_CONNECTING:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          solar: {
            status: 'Connecting',
            summary: null,
            response: null,
            showDiagnostics: false,
          },
        },
      })

    case actionTypes.SET_SOLAR_SUCCESS:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          solar: {
            status: 'Connected',
            summary: action.payload.summary,
            response: action.payload.response,
            showDiagnostics: false,
          },
        },
      })

    case actionTypes.SET_SOLAR_ERROR:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          solar: {
            status: 'Unavailable',
            summary: null,
            response: action.payload,
            showDiagnostics: false,
          },
        },
      })

    case actionTypes.TOGGLE_SOLAR_DIAGNOSTICS:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          solar: {
            ...state.building.solar,
            showDiagnostics: !state.building.solar.showDiagnostics,
          },
        },
      })

    case actionTypes.SET_ROOF_FACES:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          roofFaces: action.payload,
          selectedRoofFaceId: action.payload[0]?.id ?? null,
          roofModelAccepted: false,
        },
        design: { ...state.design, removedPanelIds: [], pinnedPanelIds: [], obstacles: [] },
      })

    case actionTypes.SELECT_ROOF_FACE:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          selectedRoofFaceId: action.payload,
        },
      })

    case actionTypes.ACCEPT_ROOF_MODEL:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          roofModelAccepted: true,
          roofFaces: state.building.roofFaces.map((face) => ({
            ...face,
            accepted: true,
          })),
        },
      })

    case actionTypes.TOGGLE_ROOF_FACE:
      return withFaces(
        state,
        state.building.roofFaces.map((f) => (f.id === action.payload ? { ...f, included: !f.included } : f)),
      )

    case actionTypes.UPDATE_ROOF_FACE:
      return withFaces(
        state,
        state.building.roofFaces.map((f) => (f.id === action.payload.id ? { ...f, ...action.payload.changes } : f)),
      )

    case actionTypes.UPDATE_ROOF_FACE_LIVE:
      return touchProject({
        ...state,
        building: {
          ...state.building,
          roofFaces: state.building.roofFaces.map((f) => (f.id === action.payload.id ? { ...f, ...action.payload.changes } : f)),
        },
      })

    case actionTypes.ADD_ROOF_FACE:
      return withFaces(state, [...state.building.roofFaces, action.payload], action.payload.id)

    case actionTypes.REMOVE_ROOF_FACE:
      return withFaces(
        state,
        state.building.roofFaces.filter((f) => f.id !== action.payload),
        state.building.selectedRoofFaceId === action.payload ? null : state.building.selectedRoofFaceId,
      )

    case actionTypes.SET_ENERGY_PROFILE:
      return touchProject({ ...state, energyProfile: action.payload })

    case actionTypes.CLEAR_ENERGY_PROFILE:
      return touchProject({ ...state, energyProfile: null })

    case actionTypes.UNCONFIRM_ROOF:
      return touchProject({ ...state, building: { ...state.building, roofModelAccepted: false } })

    case actionTypes.UPDATE_DESIGN:
      return touchProject({ ...state, design: { ...state.design, ...action.payload } })

    case actionTypes.SET_DESIGN_SNAPSHOT:
      return touchProject({ ...state, designSnapshot: action.payload })

    case actionTypes.APPLY_HANDOFF_SUCCESS:
      if (state.energyProfile?.profile && state.energyProfile.origin === 'manual') return state
      return touchProject({
        ...state,
        energyProfile: { ...action.payload, error: null, origin: 'insights-handoff' },
      })

    case actionTypes.APPLY_HANDOFF_ERROR:
      if (state.energyProfile?.profile) return state
      return touchProject({
        ...state,
        energyProfile: { profile: null, warnings: [], error: action.payload, origin: 'insights-handoff' },
      })

    default:
      return state
  }
}

export function ProjectProvider({ children }) {
  const [project, dispatch] = useReducer(reducer, undefined, createInitialProject)

  const actions = useMemo(
    () => ({
      resetProject: () => dispatch({ type: actionTypes.RESET_PROJECT }),
      setBuildingSearch: (payload) =>
        dispatch({ type: actionTypes.SET_BUILDING_SEARCH, payload }),
      setMapType: (payload) =>
        dispatch({ type: actionTypes.SET_MAP_TYPE, payload }),
      setMapLocked: (payload) =>
        dispatch({ type: actionTypes.SET_MAP_LOCKED, payload }),
      resetSolar: () => dispatch({ type: actionTypes.RESET_SOLAR }),
      setSolarConnecting: () =>
        dispatch({ type: actionTypes.SET_SOLAR_CONNECTING }),
      setSolarSuccess: (payload) =>
        dispatch({ type: actionTypes.SET_SOLAR_SUCCESS, payload }),
      setSolarError: (payload) =>
        dispatch({ type: actionTypes.SET_SOLAR_ERROR, payload }),
      toggleSolarDiagnostics: () =>
        dispatch({ type: actionTypes.TOGGLE_SOLAR_DIAGNOSTICS }),
      setRoofFaces: (payload) =>
        dispatch({ type: actionTypes.SET_ROOF_FACES, payload }),
      selectRoofFace: (payload) =>
        dispatch({ type: actionTypes.SELECT_ROOF_FACE, payload }),
      acceptRoofModel: () =>
        dispatch({ type: actionTypes.ACCEPT_ROOF_MODEL }),
      toggleRoofFace: (id) => dispatch({ type: actionTypes.TOGGLE_ROOF_FACE, payload: id }),
      updateRoofFace: (id, changes) =>
        dispatch({ type: actionTypes.UPDATE_ROOF_FACE, payload: { id, changes } }),
      updateRoofFaceLive: (id, changes) =>
        dispatch({ type: actionTypes.UPDATE_ROOF_FACE_LIVE, payload: { id, changes } }),
      addRoofFace: (face) => dispatch({ type: actionTypes.ADD_ROOF_FACE, payload: face }),
      removeRoofFace: (id) => dispatch({ type: actionTypes.REMOVE_ROOF_FACE, payload: id }),
      setEnergyProfile: (payload) => dispatch({ type: actionTypes.SET_ENERGY_PROFILE, payload }),
      clearEnergyProfile: () => dispatch({ type: actionTypes.CLEAR_ENERGY_PROFILE }),
      updateDesign: (payload) => dispatch({ type: actionTypes.UPDATE_DESIGN, payload }),
      unconfirmRoof: () => dispatch({ type: actionTypes.UNCONFIRM_ROOF }),
      setDesignSnapshot: (payload) => dispatch({ type: actionTypes.SET_DESIGN_SNAPSHOT, payload }),
      applyHandoffSuccess: (payload) => dispatch({ type: actionTypes.APPLY_HANDOFF_SUCCESS, payload }),
      applyHandoffError: (payload) => dispatch({ type: actionTypes.APPLY_HANDOFF_ERROR, payload }),
    }),
    [],
  )

  const value = useMemo(
    () => ({
      project,
      building: project.building,
      pvSystem: project.pvSystem,
      batterySystem: project.batterySystem,
      results: project.results,
      energyProfile: project.energyProfile,
      designChoices: project.design,
      designSnapshot: project.designSnapshot ?? null,
      actions,
    }),
    [project, actions],
  )

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const context = useContext(ProjectContext)

  if (!context) {
    throw new Error('useProject must be used inside ProjectProvider.')
  }

  return context
}

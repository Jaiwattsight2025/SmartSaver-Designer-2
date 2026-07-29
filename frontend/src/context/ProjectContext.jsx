import { createContext, useContext, useMemo, useReducer } from 'react'
import { createEmptyProject, touchProject } from '../models/Project'

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
}

function reducer(state, action) {
  switch (action.type) {
    case actionTypes.RESET_PROJECT:
      return createEmptyProject()

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

    default:
      return state
  }
}

export function ProjectProvider({ children }) {
  const [project, dispatch] = useReducer(reducer, undefined, createEmptyProject)

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

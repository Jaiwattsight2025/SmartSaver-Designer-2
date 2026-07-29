import { useProject } from "../context/ProjectContext";

export function useRoofFaces() {
  const { building, actions } = useProject();

  const roofFaces = building.roofFaces;
  const selectedFaceId = building.selectedRoofFaceId;

  function addFace(face) {
    actions.setRoofFaces([...roofFaces, face]);
  }

  function updateFace(id, updates) {
    actions.setRoofFaces(
      roofFaces.map(face =>
        face.id === id
          ? { ...face, ...updates }
          : face
      )
    );
  }

  function deleteFace(id) {
    actions.setRoofFaces(
      roofFaces.filter(face => face.id !== id)
    );
  }

  function selectFace(id) {
    actions.selectRoofFace(id);
  }

  function acceptRoof() {
    actions.acceptRoofModel();
  }

  function clearFaces() {
    actions.setRoofFaces([]);
  }

  return {
    roofFaces,
    selectedFaceId,
    addFace,
    updateFace,
    deleteFace,
    selectFace,
    acceptRoof,
    clearFaces,
  };
}
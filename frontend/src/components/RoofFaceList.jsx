import { useRoofFaces } from '../hooks/useRoofFaces'

export default function RoofFaceList() {
  const {
    roofFaces,
    selectedFaceId,
    selectFace,
  } = useRoofFaces()

  if (!roofFaces.length) {
    return (
      <div className="roof-face-list empty">
        No roof faces have been created yet.
      </div>
    )
  }

  return (
    <div className="roof-face-list">
      {roofFaces.map((face) => (
        <button
          type="button"
          key={face.id}
          className={
            selectedFaceId === face.id
              ? 'roof-face-card selected'
              : 'roof-face-card'
          }
          onClick={() => selectFace(face.id)}
        >
          <strong>{face.label}</strong>
          <span>{face.areaSquareMetres.toFixed(1)} m²</span>
          <span>{face.orientation}</span>
          <span>{face.pitchDegrees}°</span>
        </button>
      ))}
    </div>
  )
}
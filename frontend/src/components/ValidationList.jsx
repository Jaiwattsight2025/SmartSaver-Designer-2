/** Shows the design's final checks (errors in red, warnings plain). */
export default function ValidationList({ validation }) {
  const issues = validation?.issues ?? []
  if (!issues.length) return null
  return (
    <div className="validation-list" data-testid="validation">
      {issues.map((i) => (
        <div key={i.message} className={`info-box ${i.level === 'error' ? 'error' : ''}`}>
          {i.level === 'error' ? 'Check: ' : ''}
          {i.message}
        </div>
      ))}
    </div>
  )
}

import { useRef, useState } from 'react'
import { useProject } from '../context/ProjectContext'
import { ProfileError, profileFromFileText, profileFromManual } from '../lib/energyProfile'
import { STATES } from '../config/designerConfig'

const cents = (dollars, dp = 1) => (dollars === null || dollars === undefined ? '—' : `${(dollars * 100).toFixed(dp)}c`)
const kwh = (x) => (x === null || x === undefined ? '—' : `${Math.round(x).toLocaleString('en-AU')} kWh`)

const SOURCE_LABEL = {
  wattsight: 'from your Wattsight link',
  'wattsight-file': 'from your Wattsight results file',
  manual: 'entered by you',
}

function ManualForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    dailyKwh: initial?.avgDailyKwh ?? '',
    rateCents: initial ? +(initial.importRate * 100).toFixed(2) : '',
    supplyCents: initial ? +(initial.supplyPerDay * 100).toFixed(2) : '',
    feedInCents: initial ? +(initial.feedInRate * 100).toFixed(2) : '',
    postcode: initial?.postcode ?? '',
    state: initial?.state ?? '',
  }))
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = (event) => {
    event.preventDefault()
    try {
      const result = profileFromManual(form)
      // Keep Wattsight's system recommendation if we are editing a Wattsight profile.
      if (initial) {
        result.profile.recommendedSolarKw = initial.recommendedSolarKw
        result.profile.recommendedBatteryKwh = initial.recommendedBatteryKwh
        result.profile.retailer = initial.retailer
      }
      onSave(result)
    } catch (err) {
      setError(err instanceof ProfileError ? err.message : 'Please check the numbers.')
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      <label>
        Average daily use (kWh)
        <input inputMode="decimal" value={form.dailyKwh} onChange={set('dailyKwh')} placeholder="e.g. 20" required />
      </label>
      <label>
        Usage rate (c/kWh)
        <input inputMode="decimal" value={form.rateCents} onChange={set('rateCents')} placeholder="e.g. 30" />
      </label>
      <label>
        Supply charge (c/day)
        <input inputMode="decimal" value={form.supplyCents} onChange={set('supplyCents')} placeholder="e.g. 110" />
      </label>
      <label>
        Feed-in tariff (c/kWh)
        <input inputMode="decimal" value={form.feedInCents} onChange={set('feedInCents')} placeholder="e.g. 5" />
      </label>
      <div className="two-column-buttons">
        <label>
          Postcode
          <input inputMode="numeric" maxLength={4} value={form.postcode} onChange={set('postcode')} placeholder="3000" />
        </label>
        <label>
          State
          <select value={form.state} onChange={set('state')}>
            <option value="">Auto</option>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <small className="hint">All on your bill. Blank rates use typical values and are marked as assumed.</small>
      {error && <div className="info-box error">{error}</div>}
      <div className="two-column-buttons">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button">
          Use these numbers
        </button>
      </div>
    </form>
  )
}

export default function EnergyProfileCard({ compact = false }) {
  const { energyProfile, actions } = useProject()
  const [editing, setEditing] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileRef = useRef(null)
  const profile = energyProfile?.profile ?? null

  const onFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileError('')
    try {
      if (file.size > 256 * 1024) throw new ProfileError('That file is too big to be a Wattsight results file.')
      const result = profileFromFileText(await file.text())
      actions.setEnergyProfile({ ...result, error: null, origin: 'file' })
      setEditing(false)
    } catch (err) {
      setFileError(err instanceof ProfileError ? err.message : 'Could not read that file.')
    }
  }

  const fileInput = (
    <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} data-testid="profile-file" />
  )

  if (editing) {
    return (
      <div className="profile-card">
        <div className="profile-card-heading">
          <span>YOUR BILL DATA</span>
          <strong>{profile ? 'Edit your numbers' : 'Enter from your bill'}</strong>
        </div>
        <ManualForm
          initial={profile}
          onCancel={() => setEditing(false)}
          onSave={(result) => {
            actions.setEnergyProfile({ ...result, error: null, origin: 'manual' })
            setEditing(false)
          }}
        />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="profile-card empty">
        {fileInput}
        <div className="profile-card-heading">
          <span>YOUR BILL DATA</span>
          <strong>No bill data yet</strong>
        </div>
        {energyProfile?.error && <div className="info-box error">{energyProfile.error}</div>}
        <p>
          Add your electricity use so we can work out your savings. Use your Wattsight results file, or type in a few
          numbers from your bill.
        </p>
        <div className="two-column-buttons">
          <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>
            Load Wattsight file
          </button>
          <button type="button" className="secondary-button" onClick={() => setEditing(true)}>
            Enter manually
          </button>
        </div>
        {fileError && <div className="info-box error">{fileError}</div>}
      </div>
    )
  }

  return (
    <div className="profile-card">
      {fileInput}
      <div className="profile-card-heading">
        <span>{profile.source === 'manual' ? 'YOUR BILL DATA' : 'YOUR BILL DATA FROM WATTSIGHT'}</span>
        <strong>{SOURCE_LABEL[profile.source] ?? 'loaded'}</strong>
      </div>
      <dl className="profile-grid">
        <div>
          <dt>Yearly use</dt>
          <dd>{kwh(profile.annualKwh)}</dd>
        </div>
        <div>
          <dt>Daily use</dt>
          <dd>{profile.avgDailyKwh ?? '—'} kWh</dd>
        </div>
        <div>
          <dt>Usage rate</dt>
          <dd>
            {cents(profile.importRate, 2)}/kWh{profile.assumed.includes('usage rate') && <em> assumed</em>}
          </dd>
        </div>
        <div>
          <dt>Supply</dt>
          <dd>
            {cents(profile.supplyPerDay)}/day{profile.assumed.includes('supply charge') && <em> assumed</em>}
          </dd>
        </div>
        <div>
          <dt>Feed-in</dt>
          <dd>
            {cents(profile.feedInRate)}/kWh{profile.assumed.includes('feed-in tariff') && <em> assumed</em>}
          </dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{[profile.postcode, profile.state].filter(Boolean).join(' ') || '—'}</dd>
        </div>
        {!compact && profile.retailer && (
          <div>
            <dt>Retailer</dt>
            <dd>{profile.retailer}</dd>
          </div>
        )}
        {!compact && (profile.recommendedSolarKw || profile.recommendedBatteryKwh !== null) && (
          <div>
            <dt>Wattsight suggested</dt>
            <dd>
              {profile.recommendedSolarKw ? `${profile.recommendedSolarKw} kW solar` : ''}
              {profile.recommendedBatteryKwh ? ` + ${profile.recommendedBatteryKwh} kWh battery` : ''}
            </dd>
          </div>
        )}
      </dl>
      {energyProfile.warnings?.length > 0 && (
        <div className="info-box">Some values in the link were ignored: {energyProfile.warnings.join(' ')}</div>
      )}
      {!compact && (
        <div className="profile-actions">
          <button type="button" className="link-button" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="link-button" onClick={() => fileRef.current?.click()}>
            Load another file
          </button>
          <button type="button" className="link-button" onClick={actions.clearEnergyProfile}>
            Remove
          </button>
        </div>
      )}
      {fileError && <div className="info-box error">{fileError}</div>}
    </div>
  )
}

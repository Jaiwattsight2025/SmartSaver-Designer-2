import { useMemo } from 'react'
import { useProject } from '../context/ProjectContext'
import { computeDesign } from '../lib/design'
import { stateFromPostcode } from '../lib/energyProfile'
import { suggestedBatteryKwh, suggestedPanelCount } from '../lib/energyModel'
import { STATES } from '../config/designerConfig'

/** "11 Example St, Suburb VIC 3147, Australia" -> { state, postcode } (kept in memory only). */
export function locationFromAddress(address) {
  const m = String(address || '').match(new RegExp(`\\b(${STATES.join('|')})\\s+(\\d{4})\\b`))
  if (m) return { state: m[1], postcode: m[2] }
  const pc = String(address || '').match(/\b(\d{4})\b(?!.*\b\d{4}\b)/)
  return pc ? { state: stateFromPostcode(pc[1]), postcode: pc[1] } : { state: null, postcode: null }
}

export function useDesign() {
  const { building, energyProfile, designChoices } = useProject()
  const profile = energyProfile?.profile ?? null
  const insights = building.solar.status === 'Connected' ? building.solar.response : null

  return useMemo(() => {
    const fromAddress = locationFromAddress(building.formattedAddress)
    const state = profile?.state ?? fromAddress.state ?? null
    const suggestedPanels = suggestedPanelCount(profile, designChoices.moduleWatts, state)
    const suggestedBattery = suggestedBatteryKwh(profile)
    const pv = {
      moduleWatts: designChoices.moduleWatts,
      panelCount: designChoices.panelCount ?? suggestedPanels,
    }
    const battery = {
      batteryKwh: designChoices.batteryKwh ?? suggestedBattery,
      inverterKw: designChoices.inverterKw,
    }
    const design = computeDesign({ profile, insights, roofFaces: building.roofFaces, pv, battery, state })
    return {
      profile,
      state,
      addressState: fromAddress.state,
      pv,
      battery,
      suggestedPanels,
      suggestedBattery,
      design,
      insights,
    }
  }, [profile, insights, building.roofFaces, building.formattedAddress, designChoices])
}

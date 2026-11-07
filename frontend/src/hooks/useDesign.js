import { useMemo } from 'react'
import { useProject } from '../context/ProjectContext'
import { computeDesign } from '../lib/design'
import { stateFromPostcode } from '../lib/energyProfile'
import { suggestedBatteryKwh, suggestedPanelCount } from '../lib/energyModel'
import { STATES } from '../config/designerConfig'
import { placementMaxKw, resolvePlacementCount } from '../lib/panelLayout'
import { resolveSetbackM } from '../config/designerConfig'

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
      panelCount: resolvePlacementCount({
        panelCount: designChoices.panelCount,
        moduleWatts: designChoices.moduleWatts,
        planningKw: designChoices.planningKw,
      }),
    }
    const battery = {
      batteryKwh: designChoices.batteryKwh ?? suggestedBattery,
      inverterKw: designChoices.inverterKw,
    }
    // Panels are only placed once the customer has confirmed the roof outlines.
    const roofConfirmed = Boolean(building.roofModelAccepted)
    const layoutOptions = {
      orientation: designChoices.panelOrientation,
      setbackM: resolveSetbackM(designChoices.setbackM),
      rowGapM: designChoices.rowGapM,
      removedPanelIds: designChoices.removedPanelIds ?? [],
      pinnedPanelIds: designChoices.pinnedPanelIds ?? [],
      obstacles: designChoices.obstacles ?? [],
      latitude: building.location?.lat ?? insights?.center?.latitude ?? insights?.center?.lat ?? null,
      maxKw: placementMaxKw({
        panelCount: designChoices.panelCount,
        moduleWatts: designChoices.moduleWatts,
        planningKw: designChoices.planningKw,
      }),
      faceArrays: designChoices.faceArrays ?? {},
    }
    const design = computeDesign({
      profile,
      insights,
      roofFaces: roofConfirmed ? building.roofFaces : [],
      pv,
      battery,
      state,
      layoutOptions,
      installerQuoteAud: designChoices.installerQuoteAud,
    })
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
      roofConfirmed,
    }
  }, [profile, insights, building.roofFaces, building.roofModelAccepted, building.formattedAddress, building.location, designChoices])
}

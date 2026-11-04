import { DEFAULT_MODULE_WATTS } from '../config/designerConfig'
import { createEmptyBuilding } from './Building'

export function createEmptyProject() {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled design',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    building: createEmptyBuilding(),
    pvSystem: {
      panels: [],
      module: null,
      dcCapacityKw: 0,
      inverter: null,
    },
    batterySystem: {
      battery: null,
      quantity: 0,
      usableCapacityKwh: 0,
      chargePowerKw: 0,
      dischargePowerKw: 0,
    },
    // { profile, warnings, error, origin: 'link' | 'file' | 'manual' } or null
    energyProfile: null,
    // Customer choices; null = use the suggested value
    design: {
      moduleWatts: DEFAULT_MODULE_WATTS,
      panelCount: null,
      batteryKwh: null,
      inverterKw: null,
    },
    results: {
      annualIrradianceKwhM2: null,
      monthlyIrradianceKwhM2: [],
      annualGenerationKwh: null,
      monthlyGenerationKwh: [],
      specificYieldKwhKwp: null,
    },
  }
}

export function touchProject(project) {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  }
}

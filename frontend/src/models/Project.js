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

// Synthetic buildingInsights response (made-up house, NOT a real address).
import { offset } from '../geo'

const center = { latitude: -37.8665, longitude: 145.1012 }

function panelsAround(c, rows, cols, segmentIndex, dcKwh, azimuth) {
  const out = []
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < cols; k += 1) {
      const p1 = offset({ lat: c.latitude, lng: c.longitude }, (k - (cols - 1) / 2) * 1.07, azimuth + 90)
      const p2 = offset(p1, (r - (rows - 1) / 2) * 1.9, azimuth)
      out.push({
        center: { latitude: p2.lat, longitude: p2.lng },
        orientation: 'PORTRAIT',
        segmentIndex,
        yearlyEnergyDcKwh: dcKwh - r * 2 - k,
      })
    }
  }
  return out
}

const northCenter = { latitude: -37.86645, longitude: 145.1012 }
const southCenter = { latitude: -37.86655, longitude: 145.1012 }
const westCenter = { latitude: -37.8665, longitude: 145.10105 }

const north = panelsAround(northCenter, 3, 8, 0, 560, 0)
const south = panelsAround(southCenter, 2, 6, 1, 330, 180)

export const insightsFixture = {
  name: 'buildings/TEST',
  center,
  imageryQuality: 'HIGH',
  solarPotential: {
    maxArrayPanelsCount: 36,
    panelCapacityWatts: 400,
    panelHeightMeters: 1.879,
    panelWidthMeters: 1.045,
    roofSegmentStats: [
      {
        pitchDegrees: 22.4,
        azimuthDegrees: 1.2,
        stats: { areaMeters2: 62.5, sunshineQuantiles: [900, 1300, 1400, 1450, 1480, 1500, 1520, 1540, 1560, 1580, 1600], groundAreaMeters2: 57.8 },
        center: northCenter,
        boundingBox: { sw: { latitude: -37.8665, longitude: 145.10105 }, ne: { latitude: -37.8664, longitude: 145.10135 } },
      },
      {
        pitchDegrees: 22.1,
        azimuthDegrees: 181.0,
        stats: { areaMeters2: 40.2, sunshineQuantiles: [500, 700, 800, 850, 880, 900, 920, 940, 960, 980, 1000], groundAreaMeters2: 37.2 },
        center: southCenter,
        boundingBox: { sw: { latitude: -37.8666, longitude: 145.10108 }, ne: { latitude: -37.8665, longitude: 145.10132 } },
      },
      {
        pitchDegrees: 25,
        azimuthDegrees: 270,
        stats: { areaMeters2: 3.1, sunshineQuantiles: [1000, 1100, 1200, 1250, 1300, 1320, 1340, 1360, 1380, 1390, 1400] },
        center: westCenter,
        boundingBox: { sw: { latitude: -37.86651, longitude: 145.10104 }, ne: { latitude: -37.86649, longitude: 145.10106 } },
      },
    ],
    // Google lists panels best first
    solarPanels: [...north, ...south].sort((a, b) => b.yearlyEnergyDcKwh - a.yearlyEnergyDcKwh),
  },
}

export const exampleQuery =
  '?v=1&src=wattsight&pc=3147&st=VIC&ret=Alinta+Energy&days=31&kwh_yr=11462&kwh_day=31.4&tariff=single&rate=0.3035&supply=0.862&fit=0.05&sol_kw=10&bat_kwh=13.5'

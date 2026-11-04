import { describe, expect, it } from 'vitest'
import { latLngToUtm, utmToLatLng, utmZoneFromEpsg } from '../utm'

describe('utm', () => {
  it('reads the zone from an EPSG code', () => {
    expect(utmZoneFromEpsg(32755)).toEqual({ zone: 55, south: true })
    expect(utmZoneFromEpsg(32633)).toEqual({ zone: 33, south: false })
    expect(utmZoneFromEpsg(4326)).toBeNull()
  })
  it('matches a known point (Melbourne GPO, zone 55S)', () => {
    // Reference: 320,690 E / 5,812,950 N is about -37.8136, 144.9631.
    const ll = utmToLatLng(320690, 5812950, 55, true)
    expect(ll.lat).toBeCloseTo(-37.8136, 2)
    expect(ll.lng).toBeCloseTo(144.9631, 2)
  })
  it('round-trips to the millimetre', () => {
    const { easting, northing } = latLngToUtm(-37.86, 145.1, 55, true)
    const back = utmToLatLng(easting, northing, 55, true)
    expect(back.lat).toBeCloseTo(-37.86, 8)
    expect(back.lng).toBeCloseTo(145.1, 8)
  })
})

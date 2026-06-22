import { describe, it, expect } from 'vitest'
import { ALL_NAMES, ORIGIN_GROUPS, getNamesByGroups } from './names.js'

describe('ALL_NAMES', () => {
  it('has exactly 243 entries', () => {
    expect(ALL_NAMES).toHaveLength(243)
  })

  it('has no duplicates', () => {
    expect(new Set(ALL_NAMES).size).toBe(ALL_NAMES.length)
  })
})

describe('ORIGIN_GROUPS', () => {
  it('has 6 groups', () => {
    expect(ORIGIN_GROUPS).toHaveLength(6)
  })

  it('all groups have key, label, origins', () => {
    for (const g of ORIGIN_GROUPS) {
      expect(g.key).toBeTruthy()
      expect(g.label).toBeTruthy()
      expect(g.origins.length).toBeGreaterThan(0)
    }
  })
})

describe('getNamesByGroups', () => {
  const names = [
    { name: 'Аврора', origin: 'Латинское' },
    { name: 'Анастасия', origin: 'Греческое' },
    { name: 'Варвара', origin: 'Греческое' },
    { name: 'Злата', origin: 'Славянское' },
  ]

  it('returns all names for ["all"]', () => {
    expect(getNamesByGroups(['all'], names)).toEqual(names)
  })

  it('returns all names for empty keys', () => {
    expect(getNamesByGroups([], names)).toEqual(names)
  })

  it('filters by single group', () => {
    const result = getNamesByGroups(['greek'], names)
    expect(result).toHaveLength(2)
    expect(result.every(n => n.origin === 'Греческое')).toBe(true)
  })

  it('filters by multiple groups', () => {
    const result = getNamesByGroups(['greek', 'slavic'], names)
    expect(result).toHaveLength(3)
  })

  it('returns empty for unknown group', () => {
    expect(getNamesByGroups(['unknown'], names)).toHaveLength(0)
  })
})

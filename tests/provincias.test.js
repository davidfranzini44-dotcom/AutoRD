import { describe, it, expect } from 'vitest'
import { PROVINCIAS, formatAddress } from '../src/data/provincias.js'

describe('PROVINCIAS', () => {
  it('holds the 31 provincias plus the Distrito Nacional', () => {
    expect(PROVINCIAS).toHaveLength(32)
    expect(PROVINCIAS).toContain('Distrito Nacional')
    expect(PROVINCIAS).toContain('Santiago')
    expect(PROVINCIAS).toContain('San Pedro de Macorís')
  })

  it('has no duplicates', () => {
    expect(new Set(PROVINCIAS).size).toBe(PROVINCIAS.length)
  })

  it('is sorted, so the select is scannable', () => {
    const sorted = [...PROVINCIAS].sort((a, b) => a.localeCompare(b, 'es'))
    expect(PROVINCIAS).toEqual(sorted)
  })
})

describe('formatAddress', () => {
  it('joins the street line and the provincia', () => {
    expect(formatAddress('Calle Duarte 45, Gazcue', 'Distrito Nacional'))
      .toBe('Calle Duarte 45, Gazcue, Distrito Nacional')
  })

  // The whole point of these fields is that a bank sees nothing when the client
  // declared nothing — a half-filled address must not render as a stray comma.
  it('returns null when neither part is present', () => {
    expect(formatAddress(null, null)).toBeNull()
    expect(formatAddress('', '')).toBeNull()
    expect(formatAddress('   ', '  ')).toBeNull()
    expect(formatAddress(undefined, undefined)).toBeNull()
  })

  it('drops the missing half instead of leaving punctuation', () => {
    expect(formatAddress('Calle Duarte 45', null)).toBe('Calle Duarte 45')
    expect(formatAddress(null, 'Santiago')).toBe('Santiago')
    expect(formatAddress('  ', 'Santiago')).toBe('Santiago')
  })

  it('trims whitespace around each part', () => {
    expect(formatAddress('  Calle Duarte 45  ', '  Santiago ')).toBe('Calle Duarte 45, Santiago')
  })
})

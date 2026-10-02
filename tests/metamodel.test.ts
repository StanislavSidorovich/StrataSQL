import { describe, expect, it } from 'vitest'
import { formatCardinality, formatDataType, parseCardinality } from '../src/core/metamodel'

describe('metamodel helpers', () => {
  it('formats and parses PD-style cardinalities', () => {
    expect(formatCardinality({ min: 0, max: 'n' })).toBe('0,n')
    expect(parseCardinality(' 1 , N ')).toEqual({ min: 1, max: 'n' })
    expect(parseCardinality('2,n')).toBeNull()
  })

  it('formats data types with PD codes', () => {
    expect(formatDataType({ dataType: 'Variable characters', length: 50 })).toBe('VA50')
    expect(formatDataType({ dataType: 'Decimal', length: 10, precision: 2 })).toBe('DC10,2')
    expect(formatDataType({ dataType: 'Integer', length: 4 })).toBe('I')
  })
})

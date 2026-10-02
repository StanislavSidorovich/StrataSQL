import { describe, expect, it } from 'vitest'
import { formatCardinality, formatDataType, parseCardinality, parseSize } from '../src/core/metamodel'

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

  it('parses sizes like PD: length, or precision,scale', () => {
    expect(parseSize('50')).toEqual({ length: 50, precision: undefined })
    expect(parseSize(' 10 , 2 ')).toEqual({ length: 10, precision: 2 })
    expect(parseSize('')).toEqual({})
    expect(parseSize('10,')).toBeNull()
    expect(parseSize('2,5')).toBeNull() // scale cannot exceed precision
    expect(parseSize('abc')).toBeNull()
  })
})

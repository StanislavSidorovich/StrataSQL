// Attributes from pasted text: names are split out of a list, values in brackets are dropped, types are guessed from the name.
import { describe, expect, it } from 'vitest'
import { addAttributesFromNames, guessAttributeType, parseAttributeNames } from '../src/core/attributeList'
import { emptyModel } from '../src/core/metamodel'
import { addEntity } from '../src/core/ops'

describe('parseAttributeNames', () => {
  it('splits a comma list', () => {
    expect(parseAttributeNames('InvoiceDate, TotalAmount, Status')).toEqual(['InvoiceDate', 'TotalAmount', 'Status'])
  })

  it('drops the values in brackets and the final full stop', () => {
    expect(parseAttributeNames('Status (Unpaid, Partially Paid, Paid), InvoiceDate.')).toEqual(['Status', 'InvoiceDate'])
    expect(parseAttributeNames('Priority (Routine, Urgent) — important for urgent calls')).toEqual(['Priority'])
  })

  it('takes one name per line and removes bullets and numbers', () => {
    expect(parseAttributeNames('• Diagnosis\n○ ProceduresPerformed\n- FollowUp\n1. CreatedAt\n2) Notes')).toEqual(['Diagnosis', 'ProceduresPerformed', 'FollowUp', 'CreatedAt', 'Notes'])
  })

  it('splits on semicolons and " / ", skips headings and sentences, and removes duplicates', () => {
    const long = 'x'.repeat(80)
    expect(parseAttributeNames(`Invoices:\nServiceSlotID / MedicationID; Quantity, quantity, ${long}`)).toEqual(['ServiceSlotID', 'MedicationID', 'Quantity'])
  })

  it('copes with an unclosed bracket and empty input', () => {
    expect(parseAttributeNames('Name, Status (Requested, Scheduled')).toEqual(['Name', 'Status'])
    expect(parseAttributeNames('  \n ')).toEqual([])
  })
})

describe('guessAttributeType', () => {
  it.each([
    ['InvoiceDate', 'Date'],
    ['ScheduledStartTime', 'Date & time'],
    ['CreatedAt', 'Date & time'],
    ['Time', 'Time'],
    ['TotalAmount', 'Decimal'],
    ['UnitPrice', 'Decimal'],
    ['Quantity', 'Integer'],
    ['AppointmentID', 'Integer'],
    ['is_active', 'Boolean'],
    ['Description', 'Text'],
  ])('%s is %s', (name, type) => expect(guessAttributeType(name).dataType).toBe(type))

  it('leaves the default for a name that says nothing', () => {
    expect(guessAttributeType('Species')).toEqual({})
    expect(guessAttributeType('Breed')).toEqual({})
  })

  it('gives a decimal its length and scale', () => {
    expect(guessAttributeType('LineTotal')).toEqual({ dataType: 'Decimal', length: 10, precision: 2 })
  })
})

describe('addAttributesFromNames', () => {
  it('adds one attribute per name with the guessed type, in order', () => {
    const m = emptyModel('t')
    const e = addEntity(m, { name: 'Invoice' })
    addAttributesFromNames(m, e.id, ['InvoiceDate', 'Status', 'TotalAmount'])
    expect(m.entities[0].attributes.map((a) => [a.name, a.dataType])).toEqual([
      ['InvoiceDate', 'Date'],
      ['Status', 'Variable characters'],
      ['TotalAmount', 'Decimal'],
    ])
  })
})

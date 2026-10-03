// The own cases added after the course cases: their reference CDMs generate the PDMs listed in
// cases/*.md §5, and they lint clean (Football keeps one accepted cycle, explained in the case).

import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { lintModel } from '../src/core/lint'
import { caseById } from '../src/data/cases'

/** `TABLE: pk1,pk2 → REF1, REF2 | ak…` per table. */
function summary(id: string): string[] {
  const p = generatePdm(caseById(id)!.build())
  return p.tables.map(
    (t) =>
      `${t.name}: ${t.primaryKey?.columns.join(',')}` +
      (t.foreignKeys.length ? ` → ${t.foreignKeys.map((f) => `${f.refTable}(${f.columns.join(',')})`).join(', ')}` : '') +
      (t.alternateKeys.length ? ` | AK ${t.alternateKeys.map((k) => k.columns.join(',')).join('; ')}` : ''),
  )
}

describe('own cases: expected PDM (cases/*.md §5)', () => {
  it('Hotel', () => {
    expect(summary('hotel')).toEqual([
      'ROOM_TYPE: type_name',
      'ROOM: room_no → ROOM_TYPE(type_name)',
      'GUEST: guest_no | AK passport_no',
      'BOOKING: booking_id → GUEST(guest_no)',
      'BOOKED_ROOM: booking_id,room_no → BOOKING(booking_id), ROOM(room_no)',
    ])
  })

  it('Online Shop', () => {
    expect(summary('online-shop')).toEqual([
      'CUSTOMER: customer_no | AK email',
      'CATEGORY: category_id → CATEGORY(parent_category_id)',
      'PRODUCT: product_id → CATEGORY(category_id) | AK sku',
      'CUSTOMER_ORDER: order_no → CUSTOMER(customer_no)',
      'ORDER_LINE: order_no,line_no → CUSTOMER_ORDER(order_no), PRODUCT(product_id)',
      'PAYMENT: payment_id → CUSTOMER_ORDER(order_no) | AK order_no',
    ])
  })

  it('Hospital', () => {
    expect(summary('hospital')).toEqual([
      'PATIENT: health_no',
      'STAFF_MEMBER: employee_no',
      'DOCTOR: employee_no → STAFF_MEMBER(employee_no) | AK licence_no',
      'NURSE: employee_no → STAFF_MEMBER(employee_no)',
      'SPECIALTY: specialty_id',
      'APPOINTMENT: appointment_id → PATIENT(health_no), DOCTOR(employee_no)',
      'WARD: ward_id',
      'BED: ward_id,bed_no → WARD(ward_id)',
      'ADMISSION: admission_id → PATIENT(health_no), BED(ward_id,bed_no), NURSE(employee_no)',
      'SPECIALIZES: employee_no,specialty_id → DOCTOR(employee_no), SPECIALTY(specialty_id)',
    ])
  })

  it('Football League', () => {
    expect(summary('football')).toEqual([
      'SEASON: start_year',
      'TEAM: team_id | AK name',
      'PLAYER: player_no',
      'CONTRACT: contract_id → PLAYER(player_no), TEAM(team_id)',
      'MATCH: match_id → SEASON(start_year), TEAM(home_team_id), TEAM(away_team_id) | AK start_year,home_team_id,away_team_id',
      'GOAL: match_id,goal_no → MATCH(match_id), PLAYER(player_no)',
    ])
  })
})

describe('own cases: lint and DDL', () => {
  it.each(['hotel', 'online-shop', 'hospital'])('%s lints clean', (id) => {
    expect(lintModel(caseById(id)!.build())).toEqual([])
  })

  it('football: only the accepted cycle (explained in the text)', () => {
    const issues = lintModel(caseById('football')!.build())
    expect(issues.map((i) => i.rule)).toEqual(['L04'])
    expect(issues[0].severity).toBe('warning')
  })

  it.each(['hotel', 'online-shop', 'hospital', 'football'])('%s: SQL Server DDL without generation warnings', (id) => {
    const pdm = generatePdm(caseById(id)!.build())
    expect(pdm.notes.filter((n) => n.level === 'warning')).toEqual([])
    expect(generateSqlServer(pdm)).toContain('CREATE TABLE')
  })
})

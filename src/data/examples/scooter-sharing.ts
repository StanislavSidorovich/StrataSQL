// Reference CDM of cases/scooter-sharing.md — own example, difficulty 2 (after Hotel).
// New ideas after Hotel: an intermediate entity over time (Rental: the same rider and scooter can meet
// again), an optional FK (promo code), a dependent 1:1 (one rating per rental), a dependent entity with
// an order (pauses) and history instead of a single value (scooter positions).

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addRelationship, updateEntity } from '../../core/ops'

export function buildScooterSharing(): Model {
  const m = emptyModel('Scooter Sharing')
  m.comment = 'Own case: an e-scooter sharing app — riders, scooters, rentals, ratings and positions.'

  const email = addDomain(m, { name: 'Email', dataType: 'Variable characters', length: 100 })
  const phone = addDomain(m, { name: 'Phone', dataType: 'Variable characters', length: 20 })
  const coord = addDomain(m, { name: 'Coordinate', dataType: 'Decimal', length: 9, precision: 6 })

  const promo = addEntity(m, { name: 'Promo Code', position: { x: 40, y: 40 } })
  addAttribute(m, promo.id, { name: 'promo_code', length: 20, primary: true })
  addAttribute(m, promo.id, { name: 'discount_pct', dataType: 'Short integer', mandatory: true })
  addAttribute(m, promo.id, { name: 'valid_until', dataType: 'Date', mandatory: true })

  const rider = addEntity(m, { name: 'Rider', position: { x: 40, y: 320 } })
  addAttribute(m, rider.id, { name: 'rider_id', dataType: 'Integer', primary: true })
  addAttribute(m, rider.id, { name: 'name', length: 100, mandatory: true })
  addAttribute(m, rider.id, { name: 'phone', domainId: phone.id, mandatory: true })
  addAttribute(m, rider.id, { name: 'email', domainId: email.id })

  const pause = addEntity(m, { name: 'Rental Pause', position: { x: 380, y: 40 } })
  addAttribute(m, pause.id, { name: 'pause_no', dataType: 'Short integer', primary: true })
  addAttribute(m, pause.id, { name: 'started_at', dataType: 'Date & time', mandatory: true })
  addAttribute(m, pause.id, { name: 'ended_at', dataType: 'Date & time' })

  const rental = addEntity(m, { name: 'Rental', position: { x: 380, y: 260 } })
  addAttribute(m, rental.id, { name: 'rental_id', dataType: 'Integer', primary: true })
  addAttribute(m, rental.id, { name: 'status', length: 20, mandatory: true, comment: 'Reserved → Active → Finished' })
  addAttribute(m, rental.id, { name: 'reserved_at', dataType: 'Date & time', mandatory: true })
  addAttribute(m, rental.id, { name: 'started_at', dataType: 'Date & time' })
  addAttribute(m, rental.id, { name: 'finished_at', dataType: 'Date & time' })
  addAttribute(m, rental.id, { name: 'start_lat', domainId: coord.id })
  addAttribute(m, rental.id, { name: 'start_lng', domainId: coord.id })
  addAttribute(m, rental.id, { name: 'end_lat', domainId: coord.id })
  addAttribute(m, rental.id, { name: 'end_lng', domainId: coord.id })
  addAttribute(m, rental.id, { name: 'price', dataType: 'Decimal', length: 8, precision: 2, comment: 'Set when the rental is finished' })
  updateEntity(m, rental.id, { comment: 'A rider rides a scooter during a time interval; the same pair can repeat, hence an own id.' })

  const rating = addEntity(m, { name: 'Rental Rating', position: { x: 380, y: 640 } })
  addAttribute(m, rating.id, { name: 'score', dataType: 'Short integer', mandatory: true, comment: '1–5' })
  addAttribute(m, rating.id, { name: 'comment', length: 500 })
  addAttribute(m, rating.id, { name: 'rated_at', dataType: 'Date & time', mandatory: true })
  updateEntity(m, rating.id, { comment: 'The rider rates the ride once, after it is finished.' })

  const scooter = addEntity(m, { name: 'Scooter', position: { x: 720, y: 320 } })
  addAttribute(m, scooter.id, { name: 'scooter_id', dataType: 'Integer', primary: true })
  const serial = addAttribute(m, scooter.id, { name: 'serial_no', length: 20, mandatory: true })
  addIdentifier(m, scooter.id, { name: 'serial_no', isPrimary: false, attributeIds: [serial.id] })
  addAttribute(m, scooter.id, { name: 'model', length: 50, mandatory: true })
  addAttribute(m, scooter.id, { name: 'top_speed_kmh', dataType: 'Short integer' })

  const position = addEntity(m, { name: 'Scooter Position', position: { x: 720, y: 40 } })
  addAttribute(m, position.id, { name: 'recorded_at', dataType: 'Date & time', primary: true })
  addAttribute(m, position.id, { name: 'lat', domainId: coord.id, mandatory: true })
  addAttribute(m, position.id, { name: 'lng', domainId: coord.id, mandatory: true })
  addAttribute(m, position.id, { name: 'battery_pct', dataType: 'Short integer', mandatory: true })

  addRelationship(m, rider.id, rental.id, { name: 'rents' })
  addRelationship(m, scooter.id, rental.id, { name: 'is_rented' })
  addRelationship(m, promo.id, rental.id, {
    name: 'discounts',
    cardinalityA: CARD.zeroOne,
    comment: 'Most rentals use no promo code: the FK stays NULL.',
  })
  addRelationship(m, rental.id, pause.id, { name: 'pauses', dependentSide: 'B' })
  addRelationship(m, rental.id, rating.id, { name: 'rated', cardinalityB: CARD.zeroOne, dependentSide: 'B' })
  addRelationship(m, scooter.id, position.id, { name: 'reports', dependentSide: 'B' })

  return m
}

// Reference CDM of cases/hotel.md — own example, difficulty 1 (after Library).
// New ideas after Library: a lookup entity instead of a repeated attribute (Room Type with its price)
// and an intermediate entity with data but no own id (Booked Room: one row per booking and room).

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addRelationship, updateEntity } from '../../core/ops'

export function buildHotel(): Model {
  const m = emptyModel('Hotel')
  m.comment = 'Own case (cases/hotel.md): a small hotel, its rooms, guests and bookings.'

  const name = addDomain(m, { name: 'Name', dataType: 'Variable characters', length: 100 })

  const type = addEntity(m, { name: 'Room Type', position: { x: 40, y: 40 } })
  addAttribute(m, type.id, { name: 'type_name', length: 20, primary: true })
  addAttribute(m, type.id, { name: 'nightly_price', dataType: 'Decimal', length: 8, precision: 2, mandatory: true })
  addAttribute(m, type.id, { name: 'max_guests', dataType: 'Short integer', mandatory: true })
  updateEntity(m, type.id, { comment: 'Single, double, suite: the price belongs to the type, so it is stored once.' })

  const room = addEntity(m, { name: 'Room', position: { x: 420, y: 40 } })
  addAttribute(m, room.id, { name: 'room_no', dataType: 'Short integer', primary: true })
  addAttribute(m, room.id, { name: 'floor', dataType: 'Short integer', mandatory: true })

  const guest = addEntity(m, { name: 'Guest', position: { x: 40, y: 340 } })
  addAttribute(m, guest.id, { name: 'guest_no', dataType: 'Integer', primary: true })
  addAttribute(m, guest.id, { name: 'name', domainId: name.id, mandatory: true })
  addAttribute(m, guest.id, { name: 'phone', length: 20 })
  const passport = addAttribute(m, guest.id, { name: 'passport_no', length: 20, mandatory: true })
  addIdentifier(m, guest.id, { name: 'passport_no', isPrimary: false, attributeIds: [passport.id] })

  const booking = addEntity(m, { name: 'Booking', position: { x: 420, y: 340 } })
  addAttribute(m, booking.id, { name: 'booking_id', dataType: 'Integer', primary: true })
  addAttribute(m, booking.id, { name: 'arrival_date', dataType: 'Date', mandatory: true })
  addAttribute(m, booking.id, { name: 'departure_date', dataType: 'Date', mandatory: true })
  addAttribute(m, booking.id, { name: 'booked_on', dataType: 'Date', mandatory: true })
  addAttribute(m, booking.id, { name: 'cancelled_on', dataType: 'Date', comment: 'NULL unless the booking was cancelled' })

  const booked = addEntity(m, { name: 'Booked Room', position: { x: 800, y: 190 } })
  addAttribute(m, booked.id, { name: 'guests', dataType: 'Short integer', mandatory: true })
  updateEntity(m, booked.id, { comment: 'Booking × Room with the number of guests; a room is listed once per booking, so no own id.' })

  addRelationship(m, type.id, room.id, { name: 'is_of_type' })
  addRelationship(m, guest.id, booking.id, { name: 'makes' })
  addRelationship(m, booking.id, booked.id, { name: 'includes', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, room.id, booked.id, { name: 'is_booked', dependentSide: 'B' })

  return m
}

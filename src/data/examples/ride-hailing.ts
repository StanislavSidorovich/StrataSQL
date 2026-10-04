// Reference CDM of cases/ride-hailing.md §4 (Shadow Project, Part I).

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addRelationship, updateEntity } from '../../core/ops'

export function buildRideHailing(): Model {
  const m = emptyModel('Ride Hailing')
  m.comment = 'Course case (NOVA IMS DBMS, Shadow Project Part I), adapted.'

  const email = addDomain(m, { name: 'Email', dataType: 'Variable characters', length: 100 })
  const phone = addDomain(m, { name: 'Phone', dataType: 'Variable characters', length: 20 })
  const coord = addDomain(m, { name: 'Coordinate', dataType: 'Decimal', length: 9, precision: 6 })
  const address = addDomain(m, { name: 'Address', dataType: 'Variable characters', length: 200 })

  const riderPos = addEntity(m, { name: 'Rider Position', position: { x: 40, y: 40 } })
  addAttribute(m, riderPos.id, { name: 'recorded_at', dataType: 'Date & time', primary: true })
  addAttribute(m, riderPos.id, { name: 'lat', domainId: coord.id, mandatory: true })
  addAttribute(m, riderPos.id, { name: 'lng', domainId: coord.id, mandatory: true })

  const rider = addEntity(m, { name: 'Rider', position: { x: 40, y: 270 } })
  addAttribute(m, rider.id, { name: 'rider_id', dataType: 'Integer', primary: true })
  addAttribute(m, rider.id, { name: 'name', length: 100, mandatory: true })
  addAttribute(m, rider.id, { name: 'phone', domainId: phone.id, mandatory: true })
  addAttribute(m, rider.id, { name: 'email', domainId: email.id })
  addAttribute(m, rider.id, { name: 'created_at', dataType: 'Date & time', mandatory: true })

  const riderRating = addEntity(m, { name: 'Rider Rating', position: { x: 40, y: 580 } })
  addAttribute(m, riderRating.id, { name: 'score', dataType: 'Short integer', mandatory: true, comment: '1–5' })
  addAttribute(m, riderRating.id, { name: 'comment', length: 500 })
  addAttribute(m, riderRating.id, { name: 'rated_at', dataType: 'Date & time', mandatory: true })
  updateEntity(m, riderRating.id, { comment: 'The driver rates the rider after the trip; at most one per trip.' })

  const tripStop = addEntity(m, { name: 'Trip Stop', position: { x: 360, y: 40 } })
  addAttribute(m, tripStop.id, { name: 'stop_order', dataType: 'Short integer', primary: true })
  addAttribute(m, tripStop.id, { name: 'lat', domainId: coord.id, mandatory: true })
  addAttribute(m, tripStop.id, { name: 'lng', domainId: coord.id, mandatory: true })
  addAttribute(m, tripStop.id, { name: 'address', domainId: address.id })

  const trip = addEntity(m, { name: 'Trip', position: { x: 360, y: 240 } })
  addAttribute(m, trip.id, { name: 'trip_id', dataType: 'Integer', primary: true })
  addAttribute(m, trip.id, { name: 'status', length: 20, mandatory: true, comment: 'Requested → Accepted → Ongoing → Finished' })
  addAttribute(m, trip.id, { name: 'requested_at', dataType: 'Date & time', mandatory: true })
  addAttribute(m, trip.id, { name: 'accepted_at', dataType: 'Date & time' })
  addAttribute(m, trip.id, { name: 'started_at', dataType: 'Date & time' })
  addAttribute(m, trip.id, { name: 'finished_at', dataType: 'Date & time' })
  addAttribute(m, trip.id, { name: 'pickup_lat', domainId: coord.id, mandatory: true })
  addAttribute(m, trip.id, { name: 'pickup_lng', domainId: coord.id, mandatory: true })
  addAttribute(m, trip.id, { name: 'pickup_address', domainId: address.id })
  addAttribute(m, trip.id, { name: 'dropoff_lat', domainId: coord.id, mandatory: true })
  addAttribute(m, trip.id, { name: 'dropoff_lng', domainId: coord.id, mandatory: true })
  addAttribute(m, trip.id, { name: 'dropoff_address', domainId: address.id })
  addAttribute(m, trip.id, { name: 'price', dataType: 'Decimal', length: 10, precision: 2 })

  const driverRating = addEntity(m, { name: 'Driver Rating', position: { x: 360, y: 630 } })
  addAttribute(m, driverRating.id, { name: 'score', dataType: 'Short integer', mandatory: true, comment: '1–5' })
  addAttribute(m, driverRating.id, { name: 'comment', length: 500 })
  addAttribute(m, driverRating.id, { name: 'rated_at', dataType: 'Date & time', mandatory: true })
  updateEntity(m, driverRating.id, { comment: 'The rider rates the driver after the trip; at most one per trip.' })

  const shift = addEntity(m, { name: 'Car Shift', position: { x: 680, y: 270 } })
  addAttribute(m, shift.id, { name: 'shift_id', dataType: 'Integer', primary: true })
  addAttribute(m, shift.id, { name: 'start_time', dataType: 'Date & time', mandatory: true })
  addAttribute(m, shift.id, { name: 'end_time', dataType: 'Date & time', comment: 'NULL = still driving' })
  updateEntity(m, shift.id, { comment: 'A driver drives a car during a time interval; the same pair can repeat, hence an own id.' })

  const car = addEntity(m, { name: 'Car', position: { x: 680, y: 510 } })
  addAttribute(m, car.id, { name: 'car_id', dataType: 'Integer', primary: true })
  const plate = addAttribute(m, car.id, { name: 'plate', length: 10, mandatory: true })
  addIdentifier(m, car.id, { name: 'plate', isPrimary: false, attributeIds: [plate.id] })
  addAttribute(m, car.id, { name: 'make', length: 50 })
  addAttribute(m, car.id, { name: 'model', length: 50 })
  addAttribute(m, car.id, { name: 'color', length: 30 })
  addAttribute(m, car.id, { name: 'seats', dataType: 'Short integer' })

  const driver = addEntity(m, { name: 'Driver', position: { x: 980, y: 270 } })
  addAttribute(m, driver.id, { name: 'driver_id', dataType: 'Integer', primary: true })
  addAttribute(m, driver.id, { name: 'name', length: 100, mandatory: true })
  addAttribute(m, driver.id, { name: 'phone', domainId: phone.id, mandatory: true })
  addAttribute(m, driver.id, { name: 'email', domainId: email.id })
  const license = addAttribute(m, driver.id, { name: 'license_no', length: 20, mandatory: true })
  addIdentifier(m, driver.id, { name: 'license_no', isPrimary: false, attributeIds: [license.id] })

  const driverPos = addEntity(m, { name: 'Driver Position', position: { x: 980, y: 40 } })
  addAttribute(m, driverPos.id, { name: 'recorded_at', dataType: 'Date & time', primary: true })
  addAttribute(m, driverPos.id, { name: 'lat', domainId: coord.id, mandatory: true })
  addAttribute(m, driverPos.id, { name: 'lng', domainId: coord.id, mandatory: true })

  addRelationship(m, driver.id, shift.id, { name: 'drives' })
  addRelationship(m, car.id, shift.id, { name: 'is_driven' })
  addRelationship(m, rider.id, trip.id, { name: 'requests' })
  addRelationship(m, shift.id, trip.id, {
    name: 'serves',
    cardinalityA: CARD.zeroOne,
    comment: 'NULL while the trip is Requested; the shift gives both the driver and the car.',
  })
  addRelationship(m, trip.id, tripStop.id, { name: 'stops_at', dependentSide: 'B' })
  addRelationship(m, trip.id, driverRating.id, { name: 'driver_rated', cardinalityB: CARD.zeroOne, dependentSide: 'B' })
  addRelationship(m, trip.id, riderRating.id, { name: 'rider_rated', cardinalityB: CARD.zeroOne, dependentSide: 'B' })
  addRelationship(m, driver.id, driverPos.id, { name: 'driver_positions', dependentSide: 'B' })
  addRelationship(m, rider.id, riderPos.id, { name: 'rider_positions', dependentSide: 'B' })

  return m
}

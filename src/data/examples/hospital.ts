// Reference CDM of cases/hospital.md — own example, difficulty 2.
// Ideas: inheritance whose children have their own data *and* their own relationships (Doctor,
// Nurse), a plain many-to-many (Doctor — Specialty), a dependent entity numbered inside its parent
// (Bed in Ward) and two history entities with own ids (Appointment, Admission).

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addInheritance, addRelationship, updateEntity } from '../../core/ops'

export function buildHospital(): Model {
  const m = emptyModel('Hospital')
  m.comment = 'Own case (cases/hospital.md): patients, staff, appointments, wards, beds and admissions.'

  const name = addDomain(m, { name: 'Name', dataType: 'Variable characters', length: 100 })

  const patient = addEntity(m, { name: 'Patient', position: { x: 40, y: 340 } })
  addAttribute(m, patient.id, { name: 'health_no', dataType: 'Integer', primary: true })
  addAttribute(m, patient.id, { name: 'name', domainId: name.id, mandatory: true })
  addAttribute(m, patient.id, { name: 'birth_date', dataType: 'Date', mandatory: true })
  addAttribute(m, patient.id, { name: 'phone', length: 20 })

  const staff = addEntity(m, { name: 'Staff Member', position: { x: 600, y: 0 } })
  addAttribute(m, staff.id, { name: 'employee_no', dataType: 'Integer', primary: true })
  addAttribute(m, staff.id, { name: 'name', domainId: name.id, mandatory: true })
  addAttribute(m, staff.id, { name: 'hire_date', dataType: 'Date', mandatory: true })

  const doctor = addEntity(m, { name: 'Doctor', position: { x: 420, y: 260 } })
  const licence = addAttribute(m, doctor.id, { name: 'licence_no', length: 20, mandatory: true })
  addIdentifier(m, doctor.id, { name: 'licence_no', isPrimary: false, attributeIds: [licence.id] })

  const nurse = addEntity(m, { name: 'Nurse', position: { x: 800, y: 260 } })
  addAttribute(m, nurse.id, { name: 'grade', length: 20, mandatory: true })

  addInheritance(m, staff.id, [doctor.id, nurse.id], { name: 'staff_kind', mutuallyExclusive: true, complete: true, generation: 'both', position: { x: 660, y: 170 } })

  const specialty = addEntity(m, { name: 'Specialty', position: { x: 40, y: 40 } })
  addAttribute(m, specialty.id, { name: 'specialty_id', dataType: 'Integer', primary: true })
  addAttribute(m, specialty.id, { name: 'name', length: 50, mandatory: true })

  const appointment = addEntity(m, { name: 'Appointment', position: { x: 200, y: 560 } })
  addAttribute(m, appointment.id, { name: 'appointment_id', dataType: 'Integer', primary: true })
  addAttribute(m, appointment.id, { name: 'starts_at', dataType: 'Date & time', mandatory: true })
  addAttribute(m, appointment.id, { name: 'reason', length: 200, mandatory: true })
  addAttribute(m, appointment.id, { name: 'notes', dataType: 'Text', comment: 'Written after the visit' })
  updateEntity(m, appointment.id, { comment: 'Patient × Doctor at a time; the same pair meets many times, hence an own id.' })

  const ward = addEntity(m, { name: 'Ward', position: { x: 1180, y: 40 } })
  addAttribute(m, ward.id, { name: 'ward_id', dataType: 'Integer', primary: true })
  addAttribute(m, ward.id, { name: 'name', length: 50, mandatory: true })
  addAttribute(m, ward.id, { name: 'floor', dataType: 'Short integer', mandatory: true })

  const bed = addEntity(m, { name: 'Bed', position: { x: 1180, y: 340 } })
  addAttribute(m, bed.id, { name: 'bed_no', dataType: 'Short integer', primary: true })
  updateEntity(m, bed.id, { comment: 'Numbered inside its ward: bed 1 of ward A is not bed 1 of ward B.' })

  const admission = addEntity(m, { name: 'Admission', position: { x: 800, y: 560 } })
  addAttribute(m, admission.id, { name: 'admission_id', dataType: 'Integer', primary: true })
  addAttribute(m, admission.id, { name: 'admitted_on', dataType: 'Date', mandatory: true })
  addAttribute(m, admission.id, { name: 'discharged_on', dataType: 'Date', comment: 'NULL while the patient is in hospital' })

  addRelationship(m, doctor.id, specialty.id, { name: 'specializes', cardinalityA: CARD.oneMany, cardinalityB: CARD.oneMany })
  addRelationship(m, patient.id, appointment.id, { name: 'books' })
  addRelationship(m, doctor.id, appointment.id, { name: 'sees' })
  addRelationship(m, ward.id, bed.id, { name: 'has_beds', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, patient.id, admission.id, { name: 'is_admitted' })
  addRelationship(m, bed.id, admission.id, { name: 'occupied_by' })
  addRelationship(m, nurse.id, admission.id, { name: 'responsible_for' })

  return m
}

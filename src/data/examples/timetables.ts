// Reference CDM of cases/timetables.md §4 (decision ✱: Class is identified by its context, so the
// columns of the clash rules migrate into CLASSSLOT and three AKs enforce the rules).

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addEntity, addIdentifier, addPhysicalKey, addRelationship, updateEntity } from '../../core/ops'

export function buildTimetables(): Model {
  const m = emptyModel('Timetables')
  m.comment = 'Course case (NOVA IMS DBMS, Class 03), adapted.'

  const program = addEntity(m, { name: 'Program', position: { x: 40, y: 40 } })
  addAttribute(m, program.id, { name: 'program_id', dataType: 'Integer', primary: true })
  const code = addAttribute(m, program.id, { name: 'code', length: 10, mandatory: true, comment: 'LSTI, LGI…' })
  addIdentifier(m, program.id, { name: 'code', isPrimary: false, attributeIds: [code.id] })
  addAttribute(m, program.id, { name: 'name', length: 100, mandatory: true })

  const programCourse = addEntity(m, { name: 'ProgramCourse', position: { x: 330, y: 40 } })
  addAttribute(m, programCourse.id, { name: 'name_in_program', length: 100, mandatory: true, comment: 'Databases (LSTI) / Databases I (LGI)' })
  addAttribute(m, programCourse.id, { name: 'curricular_year', dataType: 'Short integer', mandatory: true })
  updateEntity(m, programCourse.id, { comment: 'Program × Course: the name and the year belong to the pair, not to the course.' })

  const course = addEntity(m, { name: 'Course', position: { x: 640, y: 40 } })
  addAttribute(m, course.id, { name: 'course_id', dataType: 'Integer', primary: true })
  addAttribute(m, course.id, { name: 'ects', dataType: 'Decimal', length: 4, precision: 1 })

  const professor = addEntity(m, { name: 'Professor', position: { x: 920, y: 40 } })
  addAttribute(m, professor.id, { name: 'professor_id', dataType: 'Integer', primary: true })
  addAttribute(m, professor.id, { name: 'name', length: 100, mandatory: true })
  addAttribute(m, professor.id, { name: 'email', length: 100 })

  const year = addEntity(m, { name: 'AcademicYear', position: { x: 1200, y: 40 } })
  addAttribute(m, year.id, { name: 'year_id', length: 7, primary: true, comment: '2026/27' })

  const assignment = addEntity(m, { name: 'TeachingAssignment', position: { x: 920, y: 260 } })
  updateEntity(m, assignment.id, {
    comment: '"Assignment of Teaching Service": a professor teaches a course in an academic year. Class must reference it.',
  })

  const room = addEntity(m, { name: 'Room', position: { x: 330, y: 330 } })
  addAttribute(m, room.id, { name: 'room_id', dataType: 'Integer', primary: true })
  addAttribute(m, room.id, { name: 'name', length: 50, mandatory: true })
  addAttribute(m, room.id, { name: 'capacity', dataType: 'Short integer' })

  const shift = addEntity(m, { name: 'Shift', position: { x: 1260, y: 330 } })
  addAttribute(m, shift.id, { name: 'shift_code', length: 2, primary: true, comment: 'TP, P1, P2, P3, P4' })

  const period = addEntity(m, { name: 'Period', position: { x: 1260, y: 520 } })
  addAttribute(m, period.id, { name: 'period_id', dataType: 'Integer', primary: true })
  addAttribute(m, period.id, { name: 'start_date', dataType: 'Date', mandatory: true })
  addAttribute(m, period.id, { name: 'end_date', dataType: 'Date', mandatory: true })
  updateEntity(m, period.id, { comment: 'Weeks in which one version of the timetable is valid.' })

  const klass = addEntity(m, { name: 'Class', position: { x: 920, y: 500 } })
  addAttribute(m, klass.id, { name: 'weekday', dataType: 'Short integer', primary: true, comment: '1 = Monday … 7 = Sunday' })
  updateEntity(m, klass.id, {
    comment:
      'One weekly meeting: what (assignment + shift), where (room), on which day, in which weeks (period). ' +
      'Identified by that context, so all of it migrates into ClassSlot, where the clash rules become AKs.',
  })

  const slot = addEntity(m, { name: 'Slot', position: { x: 330, y: 760 } })
  addAttribute(m, slot.id, { name: 'slot_id', dataType: 'Integer', primary: true })
  addAttribute(m, slot.id, { name: 'start_time', dataType: 'Time', mandatory: true, comment: '08:00, 08:30, …' })

  const classSlot = addEntity(m, { name: 'ClassSlot', position: { x: 920, y: 820 } })
  updateEntity(m, classSlot.id, {
    comment: 'One row per 30-minute slot a class occupies: overlapping intervals become equal values, so UNIQUE can catch them.',
  })

  addRelationship(m, program.id, programCourse.id, { name: 'program_courses', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, course.id, programCourse.id, { name: 'course_programs', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, course.id, assignment.id, { name: 'course_assignments', dependentSide: 'B' })
  addRelationship(m, professor.id, assignment.id, { name: 'professor_assignments', dependentSide: 'B' })
  addRelationship(m, year.id, assignment.id, { name: 'year_assignments', dependentSide: 'B' })
  addRelationship(m, assignment.id, klass.id, { name: 'taught_in', dependentSide: 'B' })
  addRelationship(m, room.id, klass.id, { name: 'room_classes', dependentSide: 'B' })
  addRelationship(m, shift.id, klass.id, { name: 'shift_classes', dependentSide: 'B' })
  addRelationship(m, period.id, klass.id, { name: 'period_classes', dependentSide: 'B' })
  addRelationship(m, klass.id, classSlot.id, { name: 'occupies', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, slot.id, classSlot.id, { name: 'slot_classes', dependentSide: 'B' })

  // The three rules of the case, over columns that exist only in the PDM (they migrate from Class).
  addPhysicalKey(m, classSlot.id, { name: 'AK_ROOM_TIME', columns: ['room_id', 'period_id', 'weekday', 'slot_id'] })
  addPhysicalKey(m, classSlot.id, { name: 'AK_PROFESSOR_TIME', columns: ['professor_id', 'period_id', 'weekday', 'slot_id'] })
  addPhysicalKey(m, classSlot.id, { name: 'AK_COURSE_SHIFT_TIME', columns: ['course_id', 'shift_code', 'period_id', 'weekday', 'slot_id'] })

  return m
}

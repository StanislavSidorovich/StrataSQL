# Case: Timetables (NOVA IMS)

## 1. Meta
- id: `timetables`
- source: NOVA IMS DBMS 2026/27, Class 03 (J. N. Neves), slides 9–15
- difficulty: ★★★
- concepts: intermediate entity that is *referenced* by others, M:N with attributes, time slots, alternate keys to enforce business rules, migrated attributes in AKs

> The PDF contains a timetable screenshot and no solution diagram. The reference model is reconstructed from the specification and the "Important information to keep" slide. Points marked **(?)** — check with class notes.

## 2. Specification (verbatim)

- The same course may be shared by several programs and may take different names in those programs - e.g., Databases (LSTI) and Databases I (LGI) are the same course for different programs.
- Consider also the possibility that the course corresponds to different years depending on the program (e.g., Databases could be a 2nd year course for LGI and a 1st year course for LSTI).
- For each course there may be several professors, and one professor may teach several courses. The assignment of courses to teachers is done by academic year - "Assignment of Teaching Service".
- Each class takes place in a room at a predefined time interval (hh:mm - hh:mm), with slots of 30 minutes, on a particular day of the week and for a given shift (TP, P1, P2, P3, P4).
- One class corresponds to one course, and one course can have several classes.
- Class scheduling can be different depending on the time period (i.e., the timetable can be different depending on the week).

**Rules**
- Two classes can't occur in the same place at the same time.
- A professor cannot teach at two different places at the same time.
- Two classes of the same course and the same shift cannot coexist in time (time and day of the week).

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "same course shared by several programs … **different names** in those programs" | M:N Program–Course **with attributes** → intermediate `ProgramCourse` (name_in_program) |
| "corresponds to **different years** depending on the program" | another attribute of the pair → `ProgramCourse.curricular_year` |
| "several professors … several courses … **by academic year**" | M:N Course–Professor that must be **referenced** → intermediate `TeachingAssignment` (depends on Course, Professor, AcademicYear) |
| "takes place in a room" | Class N — 1 Room |
| "slots of 30 minutes" | the interval is a set of slots → `ClassSlot` rows, one per 30-min slot (makes clash rules enforceable) |
| "day of the week", "shift (TP, P1…P4)" | attributes of Class / lookup entity `Shift` |
| "one class corresponds to one course" | Class N — 1 Course (here: via TeachingAssignment, which also gives the professor) (?) |
| "different depending on the week" | entity `Period` (start_date, end_date); Class N — 1 Period |
| Rules "can't occur … at the same time" | **Alternate keys** on the slot table |

## 4. Reference CDM

### Entities
| Entity | Attributes (PI) | Notes |
|---|---|---|
| Program | **program_id**, code (LSTI, LGI…), name | |
| Course | **course_id**, ects | the "real" course, independent of program |
| ProgramCourse | name_in_program, curricular_year | dependent on Program + Course, no own id |
| Professor | **professor_id**, name, email | |
| AcademicYear | **year_id** (e.g. 2026/27) | |
| TeachingAssignment | — | dependent on Course + Professor + AcademicYear, no own id ("Assignment of Teaching Service") |
| Room | **room_id**, name, capacity | |
| Shift | **shift_code** (TP, P1–P4) | lookup; could be a CHECK instead |
| Period | **period_id**, start_date, end_date | weeks in which a timetable version is valid |
| Class | **class_id**, weekday, start_time, end_time | → TeachingAssignment, Room, Shift, Period |
| Slot | **slot_id**, start_time (08:00, 08:30, …) | lookup of 30-min slots |
| ClassSlot | — | dependent on Class + Slot (one row per occupied 30-min slot) (?) |

### Relationships (main)
| A | card. A | B | card. B | Dependent |
|---|---|---|---|---|
| Program | 1,1 | ProgramCourse | 1,n | yes |
| Course | 1,1 | ProgramCourse | 1,n | yes |
| Course | 1,1 | TeachingAssignment | 0,n | yes |
| Professor | 1,1 | TeachingAssignment | 0,n | yes |
| AcademicYear | 1,1 | TeachingAssignment | 0,n | yes |
| TeachingAssignment | 1,1 | Class | 0,n | — |
| Room | 1,1 | Class | 0,n | — |
| Shift | 1,1 | Class | 0,n | — |
| Period | 1,1 | Class | 0,n | — |
| Class | 1,1 | ClassSlot | 1,n | yes |
| Slot | 1,1 | ClassSlot | 0,n | yes |

## 5. Expected PDM (key part)

| Table | PK | AK (business rules) |
|---|---|---|
| PROGRAMCOURSE | program_id, course_id | |
| TEACHINGASSIGNMENT | course_id, professor_id, year_id | |
| CLASS | class_id | FKs: (course_id, professor_id, year_id), room_id, shift_code, period_id |
| CLASSSLOT | class_id, slot_id | **AK1** (room_id, period_id, weekday, slot_id) — no two classes in one room at the same time |
| | | **AK2** (professor_id, period_id, weekday, slot_id) — professor not in two places |
| | | **AK3** (course_id, shift_code, period_id, weekday, slot_id) — same course + shift don't overlap |

For the AKs to exist, `room_id`, `professor_id`, `course_id`, `shift_code`, `period_id`, `weekday` must be present in CLASSSLOT. They arrive there **by migration** in the PDM (lesson: "the alternative keys were implemented in the physical model as the attributes result from the CDM to PDM conversion"). If they were visible in the CDM, you could declare them as Alternate Identifiers already in the CDM.

## 6. Key decisions & lessons

1. **Intermediate entity you need to *reference*.** TeachingAssignment isn't just a join table — `Class` points to it. So it must be a real entity (lesson slide 15: "if you need to reference that relationship, create a 3rd entity").
2. **Same course, different names.** The name is a property of the (program, course) pair, not of the course → ProgramCourse.
3. **Why 30-min slots matter.** A UNIQUE constraint can't detect overlapping *intervals* (09:00–11:00 vs 10:00–12:00). Splitting each class into 30-min slot rows turns "overlap" into "same value" → a simple AK enforces it.
4. **Alternate keys = business rules for free.** Three of the rules become three AKs, no triggers needed.
5. **Period.** Without it you can store only one timetable; with it the same class can have different versions per week range.

## 7. Rules not representable in the model
- Slots of a class must be consecutive and match start_time/end_time.
- Period date ranges should not overlap for the same class.
- A professor's assignment must be for the academic year in which the period falls.

## 8. Hints & synonyms
- "Where does 'Databases I' live — in Course or somewhere else?"
- "Class must know both course and professor. Which entity already holds that pair?"
- "Can a UNIQUE constraint compare time intervals? What if time were cut into equal pieces?"
- Synonyms: TeachingAssignment ≈ TeachingService, Lecturing, CourseProfessor; ProgramCourse ≈ Curriculum, StudyPlan; ClassSlot ≈ Schedule, Occupation; Period ≈ Term, WeekRange.

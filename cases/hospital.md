# Case: Hospital

## 1. Meta
- id: `hospital`
- source: own example of StrataSQL ✱
- difficulty: ★★
- concepts: inheritance whose children have own data **and** own relationships, plain many-to-many, dependent entity numbered inside its parent, history entities with own ids, composite foreign key

## 2. Specification

A hospital wants to record its patients, its staff and the care they receive. Patients are identified by their national health number; we also keep their name, birth date and phone.

The staff are doctors and nurses. For every staff member we keep an employee number, the name and the hire date. Doctors also have a licence number, unique for each doctor; nurses have a grade. A staff member is either a doctor or a nurse, never both.

Each doctor has one or more specialties (cardiology, pediatrics…), and each specialty is shared by several doctors. For a specialty we keep only its name.

Patients book appointments with doctors. An appointment is for one patient with one doctor at a date and time, and a patient may see the same doctor many times. We record the reason and, after the visit, the notes.

The hospital has wards, each with a name and a floor. Beds are numbered inside each ward: bed 1 of ward A and bed 1 of ward B are different beds.

When a patient is admitted, we record the admission date, the bed and the nurse responsible; the discharge date stays empty while the patient is still in hospital. The same patient can be admitted many times over the years.

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "The staff are doctors and nurses" + shared employee number, name, hire date | **Inheritance** Staff Member → Doctor, Nurse |
| "either a doctor or a nurse, never both" | exclusive, complete; generation parent + children |
| "licence number, unique for each doctor" | AI of the child Doctor |
| "one or more specialties … shared by several doctors", only a name | plain M:N Doctor — Specialty (join table) |
| "a patient may see the same doctor many times" | Appointment = intermediate entity with **own id** |
| "Beds are numbered inside each ward" | **Bed** dependent on Ward, PK (ward_id, bed_no) |
| "the bed and the nurse responsible" | Admission → Bed (2-column FK), Admission → **Nurse** (not Staff Member) |
| "discharge date stays empty" | optional |

## 4. Reference CDM

| Entity | Attributes (PI) | Notes |
|---|---|---|
| Patient | **health_no**, name, birth_date, phone | |
| Staff Member | **employee_no**, name, hire_date | parent |
| Doctor | licence_no (AI) | child |
| Nurse | grade | child |
| Specialty | **specialty_id**, name | |
| Appointment | **appointment_id**, starts_at, reason, notes (optional) | → Patient, → Doctor |
| Ward | **ward_id**, name, floor | |
| Bed | **bed_no** | dependent on Ward |
| Admission | **admission_id**, admitted_on, discharged_on (optional) | → Patient, → Bed, → Nurse |

Inheritance: Staff Member → Doctor, Nurse — exclusive, complete, generation parent + children (child tables keep only the key ✱).

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| PATIENT | health_no | |
| STAFF_MEMBER | employee_no | |
| DOCTOR | employee_no | → STAFF_MEMBER; AK licence_no |
| NURSE | employee_no | → STAFF_MEMBER |
| SPECIALTY | specialty_id | |
| APPOINTMENT | appointment_id | → PATIENT, → DOCTOR |
| WARD | ward_id | |
| BED | ward_id, bed_no | → WARD |
| ADMISSION | admission_id | → PATIENT, (ward_id, bed_no) → BED, → NURSE |
| SPECIALIZES | employee_no, specialty_id | → DOCTOR, → SPECIALTY |

## 6. Key decisions & lessons

1. **Children with their own links**: appointments go to Doctor, admissions to Nurse. The FK to NURSE makes the database refuse a doctor as the responsible nurse — a rule the inheritance gives for free.
2. **Plain vs intermediate**: Doctor — Specialty has no data → a line in the CDM; Patient — Doctor has a time and notes and repeats → entity Appointment with own id.
3. **Composite FK**: Bed's key is (ward_id, bed_no), so ADMISSION carries both columns. *Alternative:* a `bed_id` of its own for Bed (then "bed 1 of ward A" needs an AK).
4. Two history entities (Appointment, Admission): one row per event, with dates; the current state is a query.

Sandbox scenario: *Only a nurse can be responsible; beds are numbered per ward*.

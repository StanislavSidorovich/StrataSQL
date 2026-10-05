// Lessons (Learn): one idea each, read then try. A lesson opens with a guess question, gives the gist
// in a few lines with a finished example on the canvas, names the usual trap, asks two check
// questions with a reason for every option, and ends with a small practice task on the canvas,
// checked against a reference like a trainer case (the practice *is* a hidden trainer case).
// Content condensed from the owner's study book (data-model-uchebnik.html), course conventions.
// Text markup: **bold**, *italic*, `code`.

import { CARD, emptyModel, type Model } from '../core/metamodel'
import { addAttribute, addEntity, addIdentifier, addInheritance, addRelationship } from '../core/ops'
import type { TrainerCase } from './cases'

export interface QuizOption {
  text: string
  /** Shown after the choice: why this option is right or what it would break. */
  why: string
}

export interface Quiz {
  prompt: string
  options: QuizOption[]
  right: number
}

export interface Lesson {
  /** Also the id of its practice case (`caseById`). */
  id: string
  title: string
  /** One line in the list: what the lesson teaches. */
  teaches: string
  /** Asked before the gist (predict → read). */
  guess: Quiz
  gist: string[]
  /** What the example on the canvas shows. */
  exampleNote: string
  example: () => Model
  trap: string
  checks: Quiz[]
  /** Help cards to read more. */
  help: string[]
  /** The practice task: text, starting model and reference. */
  practice: TrainerCase
}

type M = Model
const at = (x: number, y: number) => ({ position: { x, y } })

/** An entity with a surrogate id and some text attributes. */
function idEntity(m: M, name: string, x: number, y: number, attrs: string[] = [], id = `${name.toLowerCase()}_id`) {
  const e = addEntity(m, { name, ...at(x, y) })
  addAttribute(m, e.id, { name: id, dataType: 'Integer', primary: true })
  for (const a of attrs) addAttribute(m, e.id, { name: a, length: 50 })
  return e
}

/** Practice case defaults: a lesson's practice is a level 3 task with its own starting model. */
function practice(c: Pick<TrainerCase, 'id' | 'title' | 'build' | 'start' | 'spec' | 'spans' | 'synonyms' | 'hints' | 'walk'> & { concepts: string[] }): TrainerCase {
  return { ...c, source: 'Lesson practice', difficulty: 1, lessons: [], strict: true }
}

// ---------------------------------------------------------------- 1. entities and attributes

function gymRef(attrs = true): Model {
  const m = emptyModel('Gym')
  const t = addEntity(m, { name: 'Trainer', ...at(40, 40) })
  const r = addEntity(m, { name: 'Room', ...at(380, 40) })
  if (!attrs) return m
  addAttribute(m, t.id, { name: 'trainer_id', dataType: 'Integer', primary: true })
  addAttribute(m, t.id, { name: 'name', length: 100 })
  addAttribute(m, t.id, { name: 'phone', length: 20 })
  addAttribute(m, t.id, { name: 'hire_date', dataType: 'Date' })
  addAttribute(m, r.id, { name: 'room_id', dataType: 'Integer', primary: true })
  addAttribute(m, r.id, { name: 'name', length: 50 })
  addAttribute(m, r.id, { name: 'capacity', dataType: 'Integer' })
  return m
}

const entities: Lesson = {
  id: 'lesson-entities',
  title: 'Entities and attributes',
  teaches: 'read the nouns of a text: which are things, which are facts',
  guess: {
    prompt: '“Each class takes place in a room. A room has a capacity and a building.” Is **Room** an entity or an attribute of Class?',
    options: [
      { text: 'An entity', why: 'Right: Room has data of its own (capacity, building) and other things can point at it. That makes it an entity.' },
      { text: 'An attribute `room_name` of Class', why: 'The capacity and the building would have nowhere to go, and “B-104” and “b104” would become two different rooms.' },
      { text: 'Either, it is a matter of taste', why: 'Not taste: Room has facts of its own, so a single text field cannot hold them.' },
    ],
    right: 0,
  },
  gist: [
    'Read the text several times, looking for **one thing per pass**: nouns first, then their facts, then the verbs between them. Draw only after the lists.',
    'A noun with **facts of its own** (or that other things point at) is an **entity**: a thing the database keeps many of. It becomes a table. Name it with a singular noun: `Trainer`, not `Trainers`.',
    'Words after “has”, “is characterized by”, “we keep” are **attributes**: one value each, with a data type (a year is a number, a date is a Date). Each becomes a column.',
    'Every entity needs an identifier. When the text names none, add a surrogate number `…_id`. Lesson 2 covers identifiers in detail.',
    'A noun with **only one value** and nothing else is an attribute, not an entity. Examples: genre, duration, title.',
  ],
  exampleNote: 'The canvas shows “A TV show has a title, a genre and a release year; an episode has a title, a summary and a duration”: two entities, each with its facts and an `_id`.',
  example: () => {
    const m = emptyModel('Example: entities and attributes')
    idEntity(m, 'TVShow', 40, 40, ['title', 'genre'], 'show_id')
    addAttribute(m, m.entities[0].id, { name: 'release_year', dataType: 'Short integer' })
    const ep = idEntity(m, 'Episode', 400, 40, ['title', 'summary'], 'episode_id')
    addAttribute(m, ep.id, { name: 'duration', dataType: 'Integer' })
    return m
  },
  trap: 'Several values in one attribute: `phone1`, `phone2`, `phone3`, or “91…; 96…” in one field. If a person can have several phones, `Phone` is an entity of its own (one person → many phones).',
  checks: [
    {
      prompt: 'A participant can have **several phone numbers**. How do you model it?',
      options: [
        { text: '`phone1`, `phone2`, `phone3` in Participant', why: 'There is no room for a fourth phone, and a search by number has to look in three columns.' },
        { text: 'An entity `Phone`, one participant → many phones', why: 'Right: many values for one owner means a separate entity.' },
        { text: 'One text field with numbers separated by “;”', why: 'The database cannot see the single numbers, so it cannot check them or search by them.' },
      ],
      right: 1,
    },
    {
      prompt: 'Should TVShow keep a **number of episodes** attribute?',
      options: [
        { text: 'Yes, it is a fact about the show', why: 'It is a fact you can *compute* by counting the episodes. Stored separately, it drifts from the real count.' },
        { text: 'No, it is computed from the episodes', why: 'Right: do not store what a query can count (derived data).' },
      ],
      right: 1,
    },
  ],
  help: ['entity', 'attribute', 'derived-data'],
  practice: practice({
    id: 'lesson-entities',
    title: 'Practice: a gym',
    concepts: ['entity', 'attribute', 'surrogate id'],
    build: () => gymRef(),
    start: () => ({ ...emptyModel('Gym — my model'), comment: 'Lesson practice: entities and attributes.' }),
    spec: [
      'A gym keeps its trainers and its rooms.',
      'Each trainer has a name, a phone and a hire date. Each room has a name and a capacity (the number of people it holds).',
    ],
    spans: [
      { p: 0, phrase: 'trainers', tag: 'entity', target: 'entity:Trainer', why: 'A thing with facts of its own → entity Trainer.' },
      { p: 0, phrase: 'rooms', tag: 'entity', target: 'entity:Room', why: 'A thing with facts of its own → entity Room.' },
      { p: 1, phrase: 'name', tag: 'attribute', target: 'attribute:Trainer.name', why: 'One value per trainer → attribute.' },
      { p: 1, phrase: 'phone', tag: 'attribute', target: 'attribute:Trainer.phone', why: 'One value per trainer → attribute.' },
      { p: 1, phrase: 'hire date', tag: 'attribute', target: 'attribute:Trainer.hire_date', why: 'A date → attribute `hire_date` of type Date.' },
      { p: 1, phrase: 'name', tag: 'attribute', target: 'attribute:Room.name', why: 'One value per room → attribute.' },
      { p: 1, phrase: 'capacity', tag: 'attribute', target: 'attribute:Room.capacity', why: 'A number → attribute `capacity` of type Integer.' },
    ],
    synonyms: { Trainer: ['Coach', 'Instructor'], Room: ['Hall', 'Studio'] },
    hints: {
      'entity:Trainer': ['Which nouns of the first sentence have facts of their own?'],
      'entity:Room': ['Which nouns of the first sentence have facts of their own?'],
      'identifier:Trainer': ['The text names no identifier. Add a surrogate number `trainer_id` and make it the primary identifier.'],
      'identifier:Room': ['The text names no identifier. Add a surrogate number `room_id` and make it the primary identifier.'],
    },
    walk: { order: ['Trainer', 'Room'] },
  }),
}

// ---------------------------------------------------------------- 2. identifiers

function officeRef(keys = true): Model {
  const m = emptyModel('Office')
  const emp = addEntity(m, { name: 'Employee', ...at(40, 40) })
  addAttribute(m, emp.id, { name: 'employee_no', dataType: 'Integer', mandatory: true, primary: keys })
  addAttribute(m, emp.id, { name: 'name', length: 100, mandatory: true })
  const email = addAttribute(m, emp.id, { name: 'email', length: 100, mandatory: true })
  const dep = addEntity(m, { name: 'Department', ...at(400, 40) })
  addAttribute(m, dep.id, { name: 'code', dataType: 'Characters', length: 4, mandatory: true, primary: keys })
  const dname = addAttribute(m, dep.id, { name: 'name', length: 100, mandatory: true })
  if (keys) {
    addIdentifier(m, emp.id, { name: 'email', isPrimary: false, attributeIds: [email.id] })
    addIdentifier(m, dep.id, { name: 'name', isPrimary: false, attributeIds: [dname.id] })
  }
  return m
}

const identifiers: Lesson = {
  id: 'lesson-identifiers',
  title: 'Identifiers: <pi> and <ai>',
  teaches: 'which attribute tells one instance from the others, and how a “no two…” rule becomes a key',
  guess: {
    prompt: 'Every participant has a **unique email**. Should the email be the primary identifier instead of `participant_id`?',
    options: [
      { text: 'Yes, it is unique, that is enough', why: 'Unique, but not stable: people change mailboxes, and the key value would have to change in every table that refers to it.' },
      { text: 'No: `participant_id` stays <pi>, email becomes <ai>', why: 'Right: the primary key must be stable; the email is still unique, as an alternate identifier.' },
    ],
    right: 1,
  },
  gist: [
    '**<pi> primary identifier**: exactly one per entity. It is unique, mandatory and **stable**. Other tables point at it, and in the PDM it becomes the PRIMARY KEY.',
    'Use the identifier the text names (“identified by their card number”). If the text names none, add a surrogate number `…_id`: it has no meaning and never changes.',
    '**<ai> alternate identifier**: any other unique attribute (or set of attributes). In the PDM it becomes **UNIQUE**. Every “no two X share a Y” in the text is an <ai> on Y.',
    'A surrogate `_id` does not stop duplicates by meaning. Two identical rows just get ids 17 and 18. So when the text says “unique by X”, add the <ai> on X **as well**.',
  ],
  exampleNote: 'The canvas shows a Car with a surrogate `car_id` <pi> and a `plate` that is unique too, an <ai>. Open the Physical view to see PRIMARY KEY and UNIQUE.',
  example: () => {
    const m = emptyModel('Example: identifiers')
    const car = idEntity(m, 'Car', 40, 40, ['make', 'model'])
    const plate = addAttribute(m, car.id, { name: 'plate', length: 10, mandatory: true })
    addIdentifier(m, car.id, { name: 'plate', isPrimary: false, attributeIds: [plate.id] })
    return m
  },
  trap: 'Making a **name** or a **title** the primary identifier. Two students can have the same name, and names change. A name is at most an <ai>, and only when the text says it is unique.',
  checks: [
    {
      prompt: 'The text says: “**no two rooms share a code**”. Rooms already have `room_id` <pi>. What do you add?',
      options: [
        { text: 'Nothing, `room_id` is already unique', why: 'The id is unique, but two rooms could still both get the code “B-104”. The rule from the text would be lost.' },
        { text: 'An alternate identifier <ai> on `code`', why: 'Right: “no two … share” is an <ai>, a UNIQUE constraint in the table.' },
        { text: 'A comment “codes are unique” on Room', why: 'A comment forbids nothing: the database would accept the second “B-104”.' },
      ],
      right: 1,
    },
    {
      prompt: 'How many identifiers of each kind can one entity have?',
      options: [
        { text: 'One <pi>, any number of <ai>', why: 'Right: one primary key that others refer to, plus as many unique rules as the text has.' },
        { text: 'One of each', why: 'An entity can have several unique rules, for example a unique email *and* a unique tax number.' },
        { text: 'Any number of <pi>', why: 'Only one identifier is the primary one: the one foreign keys point at.' },
      ],
      right: 0,
    },
  ],
  help: ['identifier', 'alternate-identifier'],
  practice: practice({
    id: 'lesson-identifiers',
    title: 'Practice: an office',
    concepts: ['primary identifier', 'alternate identifier'],
    build: () => officeRef(),
    start: () => ({ ...officeRef(false), name: 'Office — my model', comment: 'Lesson practice: identifiers. The attributes are given; mark the identifiers.' }),
    spec: [
      'Each employee is identified by an employee number. We also keep the employee’s name and email; no two employees share an email.',
      'A department is identified by a short code, like “FIN”. It also has a name, and no two departments have the same name.',
    ],
    spans: [
      { p: 0, phrase: 'identified by an employee number', tag: 'attribute', target: 'attribute:Employee.employee_no', why: 'The text names the identifier → `employee_no` <pi>.' },
      { p: 0, phrase: 'no two employees share an email', tag: 'rule', target: 'attribute:Employee.email', why: 'A uniqueness rule → <ai> on `email`.' },
      { p: 1, phrase: 'identified by a short code', tag: 'attribute', target: 'attribute:Department.code', why: 'The text names the identifier → `code` <pi> (a natural key: short, it does not change).' },
      { p: 1, phrase: 'no two departments have the same name', tag: 'rule', target: 'attribute:Department.name', why: 'A uniqueness rule → <ai> on `name`.' },
    ],
    synonyms: { Employee: ['Worker', 'Staff'], Department: ['Dept'] },
    hints: {
      'identifier:Employee': ['Which words say how an employee is identified?', 'The primary identifier is the attribute the text names; “no two … share” is an alternate one.'],
      'identifier:Department': ['Which words say how a department is identified?', 'The name is unique too, but the text identifies a department by its code.'],
    },
    walk: { order: ['Employee', 'Department'] },
  }),
}

// ---------------------------------------------------------------- 3. relationships and cardinality

function shopRef(links = true): Model {
  const m = emptyModel('Deliveries')
  const cust = idEntity(m, 'Customer', 40, 40, ['name'])
  const order = addEntity(m, { name: 'Order', ...at(420, 40) })
  addAttribute(m, order.id, { name: 'order_id', dataType: 'Integer', primary: true })
  addAttribute(m, order.id, { name: 'order_date', dataType: 'Date', mandatory: true })
  const courier = idEntity(m, 'Courier', 800, 40, ['name'])
  if (links) {
    addRelationship(m, cust.id, order.id, { name: 'places', cardinalityA: CARD.oneOne, cardinalityB: CARD.zeroMany })
    addRelationship(m, courier.id, order.id, { name: 'delivers', cardinalityA: CARD.zeroOne, cardinalityB: CARD.zeroMany })
  }
  return m
}

const relationships: Lesson = {
  id: 'lesson-relationships',
  title: 'Relationships and cardinality',
  teaches: 'link two entities and read the four numbers at the ends of the line',
  guess: {
    prompt: 'TVShow — *includes* — Episode. The **crow’s foot** (many) is drawn at Episode. What does it say?',
    options: [
      { text: 'One show has many episodes', why: 'Right: the symbol sits at the entity being counted. One show → how many episodes? The answer is drawn at Episode.' },
      { text: 'One episode belongs to many shows', why: 'This is the usual misreading. The feet describe how many Episodes there are for *one* show, at the other end.' },
    ],
    right: 0,
  },
  gist: [
    'A **verb** between two entities is a relationship (“a customer *places* orders”). Name it with that verb.',
    'Every relationship has **four numbers**: a minimum and a maximum at each end. Find them with two questions: “one A → how many B?” (drawn at B) and “one B → how many A?” (drawn at A).',
    '**Maximum**: 1 (a bar) or n (crow’s foot). **Minimum**: 0 (a circle, “may have none”) or 1 (a bar, “must have one”). Words: *can, may* → 0; *each, every, must* → 1; *several, many* → n.',
    'The usual result is **one-to-many**: 1,1 at the parent, 0,n at the child. In the PDM the child gets a **foreign key**. Look at it in the Physical view.',
  ],
  exampleNote: 'The canvas shows TVShow 1,1 — 0,n Episode. Click the line to read it in words in the Properties panel.',
  example: () => {
    const m = emptyModel('Example: relationship')
    const show = idEntity(m, 'TVShow', 40, 40, ['title'], 'show_id')
    const ep = idEntity(m, 'Episode', 420, 40, ['title'], 'episode_id')
    addRelationship(m, show.id, ep.id, { name: 'includes' })
    return m
  },
  trap: 'Asking only one of the two questions. The other end then gets a random minimum, and a circle appears where the text says “every … must”.',
  checks: [
    {
      prompt: '“**Each episode is directed by only one person**; a director may direct many episodes.” What is at the Director end?',
      options: [
        { text: '1,1', why: 'Right: one episode → exactly one director (min 1 because “each”, max 1 because “only one”).' },
        { text: '0,1', why: 'The circle would allow an episode with no director, and the text says *each* episode has one.' },
        { text: '0,n', why: 'That is the other end: one director → zero or many episodes.' },
      ],
      right: 0,
    },
    {
      prompt: 'In a one-to-many relationship, where does the **foreign key** go in the PDM?',
      options: [
        { text: 'Into the “many” side (the child)', why: 'Right: every episode stores its one show’s id. A show could not store a list of episode ids in one column.' },
        { text: 'Into the “one” side (the parent)', why: 'The parent would need a column per child. One column holds one value.' },
      ],
      right: 0,
    },
  ],
  help: ['relationship', 'cardinality'],
  practice: practice({
    id: 'lesson-relationships',
    title: 'Practice: deliveries',
    concepts: ['one-to-many', 'minimum 0 or 1'],
    build: () => shopRef(),
    start: () => ({ ...shopRef(false), name: 'Deliveries — my model', comment: 'Lesson practice: relationships. The entities are given; add the relationships with their cardinalities.' }),
    spec: [
      'A customer can place many orders, and each order is placed by exactly one customer. A new customer may have no orders yet.',
      'A courier delivers many orders. An order is delivered by at most one courier; while it waits in the shop it has no courier yet.',
    ],
    spans: [
      { p: 0, phrase: 'A customer can place many orders', tag: 'relationship', target: 'relationship:places', why: 'One customer → many orders: 0,n at Order (“can”, and “may have no orders yet”).' },
      { p: 0, phrase: 'each order is placed by exactly one customer', tag: 'relationship', target: 'relationship:places', why: 'One order → exactly one customer: 1,1 at Customer.' },
      { p: 1, phrase: 'A courier delivers many orders', tag: 'relationship', target: 'relationship:delivers', why: 'One courier → many orders: 0,n at Order.' },
      { p: 1, phrase: 'at most one courier', tag: 'relationship', target: 'relationship:delivers', why: '“At most one”, and “no courier yet” → 0,1 at Courier.' },
    ],
    synonyms: { Order: ['Purchase', 'CustomerOrder'], Courier: ['Driver', 'Deliverer'] },
    hints: {
      'relationship:places': ['One customer → how many orders? One order → how many customers?'],
      'relationship:delivers': ['Can an order have no courier at all? Then the minimum at Courier is 0.'],
    },
    walk: { order: ['Customer', 'Order', 'Courier'] },
  }),
}

// ---------------------------------------------------------------- 4. many-to-many

function schoolRef(links = true): Model {
  const m = emptyModel('School')
  const student = idEntity(m, 'Student', 40, 40, ['name'])
  const course = idEntity(m, 'Course', 440, 40, ['title'])
  const prof = idEntity(m, 'Professor', 840, 40, ['name'], 'professor_id')
  if (links) {
    const enr = addEntity(m, { name: 'Enrollment', ...at(240, 300) })
    addAttribute(m, enr.id, { name: 'grade', dataType: 'Short integer' })
    addRelationship(m, student.id, enr.id, { name: 'enrolls', dependentSide: 'B' })
    addRelationship(m, course.id, enr.id, { name: 'has_students', dependentSide: 'B' })
    addRelationship(m, prof.id, course.id, { name: 'teaches', cardinalityA: CARD.oneMany, cardinalityB: CARD.oneMany })
  }
  return m
}

const manyToMany: Lesson = {
  id: 'lesson-many-to-many',
  title: 'Many-to-many and the intermediate entity',
  teaches: 'many on both sides: a plain relationship, or an entity for the pair when the pair has data',
  guess: {
    prompt: 'A student takes many courses; a course has many students. We keep **each student’s grade in a course**. Where does `grade` go?',
    options: [
      { text: 'Into Student', why: 'A student has a different grade in every course, so one column in Student cannot hold them.' },
      { text: 'Into Course', why: 'A course has a different grade for every student, so one column in Course cannot hold them.' },
      { text: 'Into a new entity for the pair (student, course)', why: 'Right: the grade depends on both at once, so it belongs to the pair. That makes an intermediate entity.' },
    ],
    right: 2,
  },
  gist: [
    'Maximum **n on both ends** is many-to-many. With **no data about the pair** it stays a plain relationship (1,n — 1,n). The PDM adds the join table by itself.',
    'If something depends on **both ends at once** (a grade, a role, a date of a loan), make an **intermediate entity** for the pair. It is **dependent on both** parents (the triangles), with 1,1 at each parent and 0,n at the pair.',
    'Its key = the two parents’ keys, so **one row per pair**. If the same pair may **repeat** (the same book borrowed again, a second function in the same scene), give it an own id as well.',
    'Name it with a noun for the pair: Enrollment, Role, Loan, Assignment.',
  ],
  exampleNote: 'The canvas shows Actor — Role — Scene: `role_name` belongs to the pair (actor, scene). Role depends on both, so an actor has at most one role per scene. Look at ROLE’s key in the Physical view.',
  example: () => {
    const m = emptyModel('Example: intermediate entity')
    const actor = idEntity(m, 'Actor', 40, 40, ['name'])
    const scene = idEntity(m, 'Scene', 760, 40, ['studio'])
    const role = addEntity(m, { name: 'Role', ...at(400, 60) })
    addAttribute(m, role.id, { name: 'role_name', length: 100, mandatory: true })
    addRelationship(m, actor.id, role.id, { name: 'plays', dependentSide: 'B' })
    addRelationship(m, scene.id, role.id, { name: 'cast', dependentSide: 'B' })
    return m
  },
  trap: 'Giving every intermediate entity its own `_id` out of habit. The key then allows the same pair twice, and a rule like “one role per actor in a scene” silently disappears. Add an own id **only** when the text lets the pair repeat.',
  checks: [
    {
      prompt: '“A technician can do **both sound and lighting in the same scene**.” Does TechnicianFunction (technician × scene) need its own id?',
      options: [
        { text: 'Yes, the pair (technician, scene) repeats', why: 'Right: with only the two parents in the key, the second function in the same scene would be rejected.' },
        { text: 'No, the two parents are enough', why: 'Then each (technician, scene) pair could occur only once, but the text allows two functions.' },
      ],
      right: 0,
    },
    {
      prompt: '“A book can have several authors and an author writes several books.” Nothing is stored about the pair. What do you draw?',
      options: [
        { text: 'A plain many-to-many relationship', why: 'Right: no data about the pair → keep the relationship; the PDM makes the join table.' },
        { text: 'An intermediate entity Authorship', why: 'It works, but it adds an entity with no data. The course draws a plain n:m here.' },
        { text: 'A foreign key `author_id` in Book', why: 'Then a book could have only one author.' },
      ],
      right: 0,
    },
  ],
  help: ['many-to-many', 'intermediate-entity', 'intermediate-with-id'],
  practice: practice({
    id: 'lesson-many-to-many',
    title: 'Practice: a school',
    concepts: ['plain many-to-many', 'intermediate entity'],
    build: () => schoolRef(),
    start: () => ({ ...schoolRef(false), name: 'School — my model', comment: 'Lesson practice: many-to-many. Add what links the entities, and the entity the text needs for the pair.' }),
    spec: [
      'Every course is taught by one or more professors, and every professor teaches one or more courses.',
      'A student can take many courses and a course has many students; a new student may take none yet, and a new course may have no students. For each student in a course we keep the final grade. A student takes a course only once.',
    ],
    spans: [
      { p: 0, phrase: 'Every course is taught by one or more professors, and every professor teaches one or more courses', tag: 'relationship', target: 'relationship:teaches', why: 'Many on both sides and nothing about the pair → a plain many-to-many relationship (1,n — 1,n).' },
      { p: 1, phrase: 'A student can take many courses and a course has many students', tag: 'relationship', accept: ['entity'], target: 'entity:Enrollment', why: 'Many on both sides, and the pair has data (the grade) → an intermediate entity.' },
      { p: 1, phrase: 'final grade', tag: 'attribute', target: 'attribute:Enrollment.grade', why: 'Depends on the student *and* the course → attribute of the pair.' },
      { p: 1, phrase: 'A student takes a course only once', tag: 'rule', target: 'entity:Enrollment', why: 'The pair does not repeat → no own id; the key is (student, course).' },
    ],
    synonyms: { Enrollment: ['Enrolment', 'Registration', 'StudentCourse', 'CourseStudent', 'Takes', 'Grade', 'Result'], Professor: ['Teacher', 'Lecturer'] },
    hints: {
      'entity:Enrollment': ['Where does the grade belong: to the student, to the course, or to the pair?', 'Can the same student take the same course twice?'],
      'relationship:enrolls': ['The pair entity depends on both parents: tick “dependent” on its side.'],
      'relationship:has_students': ['The pair entity depends on both parents: tick “dependent” on its side.'],
      'relationship:teaches': ['Does the text keep anything about a (professor, course) pair?'],
    },
    walk: { order: ['Student', 'Course', 'Professor', 'Enrollment'] },
  }),
}

// ---------------------------------------------------------------- 5. dependency

function invoiceRef(links = true): Model {
  const m = emptyModel('Invoices')
  const cust = idEntity(m, 'Customer', 40, 40, ['name'])
  const inv = addEntity(m, { name: 'Invoice', ...at(420, 40) })
  addAttribute(m, inv.id, { name: 'invoice_no', dataType: 'Integer', primary: true })
  addAttribute(m, inv.id, { name: 'issue_date', dataType: 'Date', mandatory: true })
  const line = addEntity(m, { name: 'InvoiceLine', ...at(800, 40) })
  addAttribute(m, line.id, { name: 'line_no', dataType: 'Short integer', mandatory: true, primary: links })
  addAttribute(m, line.id, { name: 'description', length: 200, mandatory: true })
  addAttribute(m, line.id, { name: 'quantity', dataType: 'Integer', mandatory: true })
  addAttribute(m, line.id, { name: 'price', dataType: 'Decimal', length: 10, precision: 2, mandatory: true })
  if (links) {
    addRelationship(m, cust.id, inv.id, { name: 'is_billed' })
    addRelationship(m, inv.id, line.id, { name: 'has_lines', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  }
  return m
}

const dependency: Lesson = {
  id: 'lesson-dependency',
  title: 'Dependency: the triangle',
  teaches: 'a child identified through its parent: “identified by the X it belongs to and a number”',
  guess: {
    prompt: 'Is **every** one-to-many “parent → children” relationship a dependency?',
    options: [
      { text: 'Yes, a child always depends on its parent', why: 'An episode belongs to a show, but `episode_id` is unique on its own. That is an ordinary relationship.' },
      { text: 'No, only when the child is not unique without the parent', why: 'Right: scene 10 exists in every episode, and only the episode tells them apart. That needs a dependency.' },
    ],
    right: 1,
  },
  gist: [
    'The signal: “**identified by the X it belongs to and a number**”, “line 3 *of* an invoice”, “room 12 *of* a building”.',
    'Mark the relationship **dependent** on the child’s side (the triangle). The parent’s key then becomes **part of the child’s key**: PK of SCENE = (`episode_id`, `order_no`).',
    'The child keeps only its **partial** identifier (`order_no` <pi>). Scene 10 of episode 1 and scene 10 of episode 2 are different rows.',
    'At the parent’s end it is always 1,1: a dependent child cannot exist without its parent and cannot move to another one.',
  ],
  exampleNote: 'The canvas shows Episode — Scene with the triangle at Scene. Open the Physical view: SCENE’s primary key has two columns.',
  example: () => {
    const m = emptyModel('Example: dependency')
    const ep = idEntity(m, 'Episode', 40, 40, ['title'])
    const scene = addEntity(m, { name: 'Scene', ...at(420, 40) })
    addAttribute(m, scene.id, { name: 'order_no', dataType: 'Integer', primary: true })
    addAttribute(m, scene.id, { name: 'description', length: 100 })
    addRelationship(m, ep.id, scene.id, { name: 'has_scenes', cardinalityB: CARD.oneMany, dependentSide: 'B' })
    return m
  },
  trap: 'Ticking “dependent” on every one-to-many “to be safe”. The keys then grow down the chain (show + episode + scene…) and are copied into every table below. Ask first: is the child unique on its own?',
  checks: [
    {
      prompt: 'Scene has only `order_no` <pi> and an **ordinary** relationship to Episode. What breaks?',
      options: [
        { text: 'Scene 10 of episode 2 cannot be added if episode 1 has a scene 10', why: 'Right: `order_no` alone would be unique across the whole database, but it is unique only within an episode.' },
        { text: 'Nothing, the relationship already ties a scene to its episode', why: 'The relationship ties them, but uniqueness comes only from the key, and the episode is not in it.' },
      ],
      right: 0,
    },
    {
      prompt: 'Orders are numbered across the whole shop, and each order belongs to one customer. Is Order dependent on Customer?',
      options: [
        { text: 'Yes', why: 'The order number is unique on its own, so the customer is not needed to identify it.' },
        { text: 'No, an ordinary one-to-many', why: 'Right: a dependency is needed only when the child is identified *through* the parent.' },
      ],
      right: 1,
    },
  ],
  help: ['dependent-entity'],
  practice: practice({
    id: 'lesson-dependency',
    title: 'Practice: invoices',
    concepts: ['dependent entity', 'ordinary one-to-many'],
    build: () => invoiceRef(),
    start: () => ({ ...invoiceRef(false), name: 'Invoices — my model', comment: 'Lesson practice: dependency. Add the relationships and the identifier the lines need.' }),
    spec: [
      'Each invoice is issued to one customer, and a customer can receive many invoices. Invoices are numbered across the whole company.',
      'An invoice has one or more lines. A line is identified by its invoice and a line number (1, 2, 3… within each invoice) and has a description, a quantity and a price.',
    ],
    spans: [
      { p: 0, phrase: 'Each invoice is issued to one customer, and a customer can receive many invoices', tag: 'relationship', target: 'relationship:is_billed', why: 'One-to-many: 1,1 at Customer, 0,n at Invoice.' },
      { p: 0, phrase: 'numbered across the whole company', tag: 'rule', target: 'entity:Invoice', why: 'The invoice number is unique on its own → the relationship to Customer is an ordinary one, not a dependency.' },
      { p: 1, phrase: 'An invoice has one or more lines', tag: 'relationship', target: 'relationship:has_lines', why: '“One or more” → 1,n at InvoiceLine.' },
      { p: 1, phrase: 'identified by its invoice and a line number', tag: 'rule', target: 'relationship:has_lines', why: 'Identified through the invoice → dependent relationship (the triangle at InvoiceLine); `line_no` <pi> is the partial key.' },
    ],
    synonyms: { InvoiceLine: ['Line', 'InvoiceItem', 'Item', 'Invoice_line'], Customer: ['Client'] },
    hints: {
      'relationship:has_lines': ['How is a line identified, by its number alone?', 'Line 1 exists in every invoice: what tells them apart?'],
      'identifier:InvoiceLine': ['A dependent entity still needs its own partial identifier: the line number.'],
      'relationship:is_billed': ['Is an invoice identified through its customer, or by its own number?'],
    },
    walk: { order: ['Customer', 'Invoice', 'InvoiceLine'] },
  }),
}

// ---------------------------------------------------------------- 6. inheritance

function fleetRef(links = true): Model {
  const m = emptyModel('Fleet')
  const v = idEntity(m, 'Vehicle', 260, 40, [], 'vehicle_id')
  const plate = addAttribute(m, v.id, { name: 'plate', length: 10, mandatory: true })
  addIdentifier(m, v.id, { name: 'plate', isPrimary: false, attributeIds: [plate.id] })
  addAttribute(m, v.id, { name: 'year', dataType: 'Short integer' })
  const car = addEntity(m, { name: 'Car', ...at(60, 340) })
  addAttribute(m, car.id, { name: 'seats', dataType: 'Short integer' })
  const truck = addEntity(m, { name: 'Truck', ...at(480, 340) })
  addAttribute(m, truck.id, { name: 'max_load', dataType: 'Integer' })
  if (links) addInheritance(m, v.id, [car.id, truck.id], { name: 'kind', mutuallyExclusive: true, complete: true, position: { x: 330, y: 250 } })
  return m
}

const inheritance: Lesson = {
  id: 'lesson-inheritance',
  title: 'Inheritance',
  teaches: 'kinds of one thing: what the parent holds, what the children add, and the two flags',
  guess: {
    prompt: 'Actors and directors are both participants. **Can one person be an actor and a director at the same time?** What does that change?',
    options: [
      { text: 'Yes, so the inheritance is not exclusive', why: 'Right: “exclusive” (×) would allow each person to be only one of the kinds.' },
      { text: 'No, every person is exactly one kind', why: 'The text allows it: a person may act in one episode and direct another.' },
    ],
    right: 0,
  },
  gist: [
    'The **parent** holds what all kinds share: the identifier and the common attributes. The **children** inherit them and add only their own.',
    'A child is justified by **different attributes** (indoor scene: studio; outdoor: location) or **different relationships** (only actors have roles). A difference only in a value (comedy / drama) is an attribute, not inheritance.',
    'Two flags, two questions to the text. “Can it be both at once?” If not, it is **exclusive** (×). “Can it be none of them?” If not, it is **complete**.',
    'A child has **no identifier of its own** and does not repeat the parent’s attributes.',
  ],
  exampleNote: 'The canvas shows Person → Actor, Director: not exclusive (one person can be both). Only actors act in scenes, which justifies Actor even with no attributes of its own.',
  example: () => {
    const m = emptyModel('Example: inheritance')
    const person = idEntity(m, 'Person', 280, 40, ['name', 'email'], 'person_id')
    const actor = addEntity(m, { name: 'Actor', ...at(60, 340) })
    const director = addEntity(m, { name: 'Director', ...at(500, 340) })
    addAttribute(m, director.id, { name: 'guild_no', length: 20 })
    const scene = idEntity(m, 'Scene', 60, 560, ['studio'], 'scene_id')
    addRelationship(m, actor.id, scene.id, { name: 'acts_in', cardinalityA: CARD.zeroMany })
    addInheritance(m, person.id, [actor.id, director.id], { name: 'kind', mutuallyExclusive: false, complete: true, position: { x: 350, y: 250 } })
    return m
  },
  trap: 'Copying the parent’s attributes into the children (`name` again in Actor) or giving a child its own `_id`. The child already has both from the parent; a second key breaks “one person, one record”.',
  checks: [
    {
      prompt: 'Actors and Technicians have **no attributes of their own**, but only actors have roles and only technicians have functions. Are they justified children?',
      options: [
        { text: 'Yes, different relationships are enough', why: 'Right: each child takes part in its own relationships.' },
        { text: 'No, a child needs its own attributes', why: 'Different attributes are one reason, and different relationships are the other.' },
      ],
      right: 0,
    },
    {
      prompt: '“A scene is **either** indoors **or** outdoors.” Which flags?',
      options: [
        { text: 'Exclusive and complete', why: 'Right: never both (exclusive), and there is no third kind (complete).' },
        { text: 'Exclusive, not complete', why: '“Not complete” would allow a scene that is neither indoors nor outdoors.' },
        { text: 'Neither', why: 'Then a scene could be indoors and outdoors at once.' },
      ],
      right: 0,
    },
  ],
  help: ['inheritance', 'inheritance-generation'],
  practice: practice({
    id: 'lesson-inheritance',
    title: 'Practice: a fleet',
    concepts: ['inheritance', 'exclusive', 'complete'],
    build: () => fleetRef(),
    start: () => ({ ...fleetRef(false), name: 'Fleet — my model', comment: 'Lesson practice: inheritance. Connect the kinds of vehicle to Vehicle and set the flags.' }),
    spec: [
      'The company keeps its vehicles: each has a plate (unique) and a year.',
      'A vehicle is either a car or a truck, never both, and there are no other kinds. For a car we keep the number of seats; for a truck, the maximum load.',
    ],
    spans: [
      { p: 0, phrase: 'vehicles', tag: 'entity', target: 'entity:Vehicle', why: 'The parent: it holds the identifier and the shared facts.' },
      { p: 1, phrase: 'either a car or a truck', tag: 'inheritance', target: 'inheritance:kind', why: 'Kinds of vehicle with different facts → inheritance Vehicle → Car, Truck.' },
      { p: 1, phrase: 'never both', tag: 'rule', target: 'inheritance:kind', why: 'Never both → exclusive (×).' },
      { p: 1, phrase: 'there are no other kinds', tag: 'rule', target: 'inheritance:kind', why: 'Every vehicle is one of them → complete.' },
    ],
    synonyms: { Truck: ['Lorry'], Car: ['Automobile'] },
    hints: {
      'inheritance:kind': ['Draw an inheritance from Vehicle to Car and Truck.', 'Can a vehicle be both? Can it be neither? Set the two flags from the answers.'],
    },
    walk: { order: ['Vehicle', 'Car', 'Truck'] },
  }),
}

export const LESSONS: Lesson[] = [entities, identifiers, relationships, manyToMany, dependency, inheritance]

// While the lesson is read (level 0), the canvas shows its example, not the practice answer.
for (const l of LESSONS) l.practice.example = l.example

/** The practice cases, found by `caseById` but not listed among the trainer cases. */
export const LESSON_CASES: TrainerCase[] = LESSONS.map((l) => l.practice)

/** A lesson counts as done when its practice check reached `DONE_AT` (progress key `id:3`). */
export const lessonDoneKey = (id: string) => `${id}:3`

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id)
}

// Help cards — SPEC §8. One card per concept. The mini-model is a tiny CDM built with the editor's
// own operations; the card's PDM and SQL are generated from it, so they can never go stale.
// Text markup: **bold**, *italic*, `code`.

import { CARD, emptyModel, type Model } from '../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addInheritance, addPhysicalKey, addRelationship } from '../core/ops'

export interface HelpCard {
  id: string
  title: string
  oneLiner: string
  /** Explanation, one paragraph per item. */
  body: string[]
  /** Signals in a requirements text that point to this construct. */
  whenToUse: string[]
  typicalMistake: string
  /** A tiny CDM shown as a diagram, with the PDM and SQL generated from it. */
  miniModel?: () => Model
  seeAlso: string[]
  /** Where the concept appears in the course cases (`cases/*.md`). */
  caseRefs: string[]
}

type M = Model
const at = (x: number, y: number) => ({ position: { x, y } })

function idEntity(m: M, name: string, x: number, y: number, attrs: string[] = [], id = `${name.toLowerCase()}_id`) {
  const e = addEntity(m, { name, ...at(x, y) })
  addAttribute(m, e.id, { name: id, dataType: 'Integer', primary: true })
  for (const a of attrs) addAttribute(m, e.id, { name: a, length: 50 })
  return e
}

export const HELP_CARDS: HelpCard[] = [
  {
    id: 'entity',
    title: 'Entity',
    oneLiner: 'A kind of thing the business needs to remember facts about. Becomes a table.',
    body: [
      'An entity groups instances that are described by the **same attributes** and take part in the **same relationships**: every car has a plate and a make, every trip has a rider.',
      'Name it with a singular noun (`Car`, not `Cars`). In the PDM the entity becomes a table named after its **code** (PowerDesigner default: the name upper-cased, spaces → `_`).',
    ],
    whenToUse: ['A noun the text says something about: “a **car** has a plate, a make…”', 'Something that is counted, listed or referenced by other things'],
    typicalMistake: 'Turning a single value into an entity (`Color` with nothing but a name) or a whole entity into an attribute (`driver_name` in Trip instead of a link to Driver).',
    miniModel: () => {
      const m = emptyModel('Entity')
      idEntity(m, 'Car', 0, 0, ['plate', 'make', 'model'])
      return m
    },
    seeAlso: ['attribute', 'identifier', 'names-and-codes'],
    caseRefs: ['ride-hailing: Car, Driver, Rider', 'tv-shows: TVShow, Episode'],
  },
  {
    id: 'attribute',
    title: 'Attribute',
    oneLiner: 'One fact about an entity, with a data type. Becomes a column.',
    body: [
      'An attribute holds **one value** per instance: a name, a date, a price. Lists (`phone1`, `phone2`, `phone3`) are a sign of a missing entity.',
      '**Mandatory** `<M>` means every instance has a value → `NOT NULL`. The data type (`VA100` = varchar(100), `I` = int, `D` = date) decides the SQL type.',
    ],
    whenToUse: ['“…is characterized by a name, a phone and an email”', 'Adjectives and measures: duration, price, status'],
    typicalMistake: 'Storing the same fact twice (`customer_name` in Order when Order already links to Customer), or several values in one attribute.',
    miniModel: () => {
      const m = emptyModel('Attribute')
      const p = idEntity(m, 'Person', 0, 0)
      addAttribute(m, p.id, { name: 'name', length: 100, mandatory: true })
      addAttribute(m, p.id, { name: 'birth_date', dataType: 'Date' })
      addAttribute(m, p.id, { name: 'email', length: 100 })
      return m
    },
    seeAlso: ['domain', 'derived-data', 'entity'],
    caseRefs: ['tv-shows: Person (name, phone, email)'],
  },
  {
    id: 'identifier',
    title: 'Primary identifier',
    oneLiner: 'The attribute(s) whose value tells one instance from all others. Becomes the primary key.',
    body: [
      'Every entity needs a primary identifier `<pi>`: without it two rows could be identical and nothing could reference one of them.',
      'Use a **stable** value. A surrogate number (`car_id`) is the usual choice; natural values like plates or emails change and become alternate identifiers instead.',
      'A **dependent** entity is identified *through* its parent, and an inheritance child takes its parent\'s identifier — they may have no own `<pi>` at all.',
    ],
    whenToUse: ['“…is identified by…”', 'Every independent entity'],
    typicalMistake: 'An entity without identifier (linter L01), or a changeable value (name, plate) as the primary key.',
    miniModel: () => {
      const m = emptyModel('Primary identifier')
      idEntity(m, 'Student', 0, 0, ['name'], 'student_no')
      return m
    },
    seeAlso: ['alternate-identifier', 'dependent-entity'],
    caseRefs: ['all cases'],
  },
  {
    id: 'alternate-identifier',
    title: 'Alternate identifier',
    oneLiner: 'Another attribute set that must be unique too. Becomes an AK (UNIQUE constraint).',
    body: [
      'A car is identified by `car_id`, but its **plate** must also be unique. Declare an alternate identifier `<ai>` → `UNIQUE (plate)` in SQL.',
      'Alternate keys are **business rules for free**: the database itself rejects the second car with the same plate. In the Physical view you can even declare them over migrated columns (Timetables: no two classes in one room at the same time).',
    ],
    whenToUse: ['“…must be unique”, “no two … can have the same …”', 'Natural codes: plate, licence number, email, ISBN'],
    typicalMistake: 'Making the natural code the primary key — then every FK copies it and a change ripples through all tables.',
    miniModel: () => {
      const m = emptyModel('Alternate identifier')
      const car = idEntity(m, 'Car', 0, 0)
      const plate = addAttribute(m, car.id, { name: 'plate', length: 10, mandatory: true })
      addAttribute(m, car.id, { name: 'make', length: 50 })
      addIdentifier(m, car.id, { name: 'plate_ak', isPrimary: false, attributeIds: [plate.id] })
      return m
    },
    seeAlso: ['identifier', 'business-rule'],
    caseRefs: ['ride-hailing: Car.plate, Driver.license_no', 'timetables: AK_ROOM_TIME'],
  },
  {
    id: 'domain',
    title: 'Domain',
    oneLiner: 'A named, reusable data type (Email, Phone, Money) shared by several attributes.',
    body: [
      'Define `Email = varchar(100)` once and use it for every email attribute. Changing the domain changes all of them — the model stays consistent.',
      'In the PDM a domain is just the column type; the benefit is in the CDM.',
    ],
    whenToUse: ['The same kind of value appears in several entities', 'Values with a fixed format: phone, email, coordinates'],
    typicalMistake: '`email varchar(50)` in one entity and `varchar(100)` in another — the same value suddenly does not fit.',
    miniModel: () => {
      const m = emptyModel('Domain')
      const email = addDomain(m, { name: 'Email', dataType: 'Variable characters', length: 100 })
      const rider = idEntity(m, 'Rider', 0, 0)
      addAttribute(m, rider.id, { name: 'email', domainId: email.id })
      const driver = idEntity(m, 'Driver', 240, 0)
      addAttribute(m, driver.id, { name: 'email', domainId: email.id })
      return m
    },
    seeAlso: ['attribute'],
    caseRefs: ['tv-shows: Email, Phone', 'ride-hailing: Coordinate'],
  },
  {
    id: 'relationship',
    title: 'Relationship',
    oneLiner: 'A link between two entities. In the PDM it becomes a foreign key (or a join table).',
    body: [
      'A relationship says how instances are connected: a rider requests trips. Its **cardinalities** say how many on each side.',
      'One-to-many: the FK goes to the **many** side (`TRIP.rider_id` → `RIDER`). It is `NOT NULL` when the minimum on the one side is 1.',
    ],
    whenToUse: ['A verb between two nouns: “a rider **requests** trips”', '“each … belongs to …”, “… has several …”'],
    typicalMistake: 'Copying an identifier as an ordinary attribute (`rider_id` typed into Trip by hand) instead of drawing the relationship — the FK then does not exist.',
    miniModel: () => {
      const m = emptyModel('Relationship')
      const rider = idEntity(m, 'Rider', 0, 0, ['name'])
      const trip = idEntity(m, 'Trip', 280, 0, ['status'])
      addRelationship(m, rider.id, trip.id, { name: 'requests' })
      return m
    },
    seeAlso: ['cardinality', 'one-to-one', 'many-to-many', 'foreign-key-attribute'],
    caseRefs: ['ride-hailing: Rider — Trip'],
  },
  {
    id: 'cardinality',
    title: 'Cardinality',
    oneLiner: '`min,max` at each end: how many of this entity one instance of the other is linked to.',
    body: [
      'Read it from the far side: the `0,1` next to CarShift in “CarShift 0,1 — 0,n Trip” means *each trip has at most one car shift*.',
      '**min** 0 = optional, 1 = mandatory → decides `NULL` / `NOT NULL` of the FK. **max** 1 or n → decides where the FK goes (1:N), whether a join table is needed (M:N), or a UNIQUE (1:1).',
      'In IE notation: a bar = 1, a circle = 0, a crow\'s foot = many. The inner symbol is the max, the outer one the min.',
    ],
    whenToUse: ['“each”, “exactly one”, “at most one”, “several”, “in some cases”', 'Optional facts: a trip has no shift until a driver accepts it'],
    typicalMistake: 'Reading the cardinality from the wrong end. Use the plain-language reading in the relationship panel to check.',
    miniModel: () => {
      const m = emptyModel('Cardinality')
      const shift = idEntity(m, 'CarShift', 0, 0, ['start_time'], 'shift_id')
      const trip = idEntity(m, 'Trip', 300, 0, ['status'])
      addRelationship(m, shift.id, trip.id, { name: 'serves', cardinalityA: CARD.zeroOne, cardinalityB: CARD.zeroMany })
      return m
    },
    seeAlso: ['relationship', 'one-to-one'],
    caseRefs: ['ride-hailing: CarShift 0,1 — 0,n Trip (nullable FK while “Requested”)'],
  },
  {
    id: 'one-to-one',
    title: 'One-to-one relationship',
    oneLiner: 'Max 1 on both ends. The FK goes to one side and gets a UNIQUE constraint.',
    body: [
      'Either table could hold the FK. Prefer the side that **must** have a partner: its FK can be `NOT NULL`. The UNIQUE on the FK is what keeps it one-to-one.',
      'Ask whether the two entities are really separate: a 1:1 with mandatory ends on both sides is often one entity drawn twice.',
    ],
    whenToUse: ['“each … has at most one …, and each … belongs to exactly one …”', 'Optional extra data with its own life cycle (a passport for a person)'],
    typicalMistake: 'Putting FKs on both sides — then they can contradict each other.',
    miniModel: () => {
      const m = emptyModel('One-to-one')
      const person = idEntity(m, 'Person', 0, 0, ['name'])
      const passport = idEntity(m, 'Passport', 280, 0, ['expires_on'], 'passport_no')
      addRelationship(m, person.id, passport.id, { name: 'holds', cardinalityA: CARD.oneOne, cardinalityB: CARD.zeroOne })
      return m
    },
    seeAlso: ['cardinality', 'dependent-entity'],
    caseRefs: ['ride-hailing: Trip 1,1 — 0,1 DriverRating (dependent 1:1)'],
  },
  {
    id: 'dependent-entity',
    title: 'Dependent (weak) entity',
    oneLiner: 'Identified *through* another entity: its key = the parent\'s key + its own part.',
    body: [
      'A scene is identified by **its episode and an order number**. Mark the relationship as dependent: the parent\'s key migrates **into the child\'s primary key**.',
      'PK of SCENE = (`episode_id`, `order_no`) — scene 10 of episode 1 and scene 10 of episode 2 are different rows.',
      'The dependent needs its own identifier part unless the relationship is one-to-one; otherwise one parent could have only one child (linter L07).',
    ],
    whenToUse: ['“identified by the … they relate to **and** a number”', 'Things that cannot exist without the parent: order lines, trip stops, positions'],
    typicalMistake: 'A dependent entity with no own identifier and only one parent (L07), or giving it its own global id when the text says how it is identified.',
    miniModel: () => {
      const m = emptyModel('Dependent entity')
      const ep = idEntity(m, 'Episode', 0, 0, ['title'])
      const scene = addEntity(m, { name: 'Scene', ...at(280, 0) })
      addAttribute(m, scene.id, { name: 'order_no', dataType: 'Integer', primary: true })
      addAttribute(m, scene.id, { name: 'description', length: 100 })
      addRelationship(m, ep.id, scene.id, { name: 'has_scenes', cardinalityB: CARD.oneMany, dependentSide: 'B' })
      return m
    },
    seeAlso: ['intermediate-entity', 'identifier'],
    caseRefs: ['tv-shows: Scene', 'ride-hailing: TripStop, DriverPosition'],
  },
  {
    id: 'intermediate-entity',
    title: 'Intermediate entity (no own identifier)',
    oneLiner: 'An entity that depends on two others and stores data about the pair. PK = both keys → one row per pair.',
    body: [
      'Data that belongs to neither side alone but to the **pair**: the role name belongs to (actor, scene). The course uses an entity here, not a PD “association”.',
      'Make it **dependent on both** and give it no own identifier: PK = (`person_id`, `episode_id`, `order_no`). The database then rejects a second role for the same actor in the same scene.',
    ],
    whenToUse: ['A many-to-many relationship that has attributes', '“just one … in each …”'],
    typicalMistake: 'Putting `role_name` in Actor (an actor has many roles) or in Scene (a scene has many actors).',
    miniModel: () => {
      const m = emptyModel('Intermediate entity')
      const actor = idEntity(m, 'Actor', 0, 0, ['name'])
      const scene = idEntity(m, 'Scene', 520, 0, ['studio'])
      const role = addEntity(m, { name: 'Role', ...at(260, 0) })
      addAttribute(m, role.id, { name: 'role_name', length: 100, mandatory: true })
      addRelationship(m, actor.id, role.id, { name: 'plays', dependentSide: 'B' })
      addRelationship(m, scene.id, role.id, { name: 'cast', dependentSide: 'B' })
      return m
    },
    seeAlso: ['intermediate-with-id', 'many-to-many', 'n-ary-relationship'],
    caseRefs: ['tv-shows: Role', 'timetables: ProgramCourse'],
  },
  {
    id: 'intermediate-with-id',
    title: 'Intermediate entity with own identifier',
    oneLiner: 'Like an intermediate entity, plus an own id in the PK → the same pair may repeat.',
    body: [
      'A technician can have **several functions in the same scene**. With PK = (technician, scene) the second function would be rejected, so add an own identifier: PK = (`person_id`, `episode_id`, `order_no`, `function_no`).',
      'Choose deliberately: no own id = “at most once per pair”; own id = “any number of times per pair”.',
    ],
    whenToUse: ['“…can even assume different functions in the same scene”', 'The same pair can occur several times (shifts, bookings, visits)'],
    typicalMistake: 'Leaving out the own id when the text allows repetition — valid data is then rejected.',
    miniModel: () => {
      const m = emptyModel('Intermediate entity with own id')
      const tech = idEntity(m, 'Technician', 0, 0, ['name'], 'person_id')
      const scene = idEntity(m, 'Scene', 560, 0, ['studio'])
      const tf = addEntity(m, { name: 'TechnicianFunction', ...at(270, 0) })
      addAttribute(m, tf.id, { name: 'function_no', dataType: 'Integer', primary: true })
      addAttribute(m, tf.id, { name: 'function_name', length: 50, mandatory: true })
      addRelationship(m, tech.id, tf.id, { name: 'works_as', dependentSide: 'B' })
      addRelationship(m, scene.id, tf.id, { name: 'crew', dependentSide: 'B' })
      return m
    },
    seeAlso: ['intermediate-entity', 'history-temporal'],
    caseRefs: ['tv-shows: TechnicianFunction', 'ride-hailing: CarShift (Driver × Car over time)'],
  },
  {
    id: 'many-to-many',
    title: 'Many-to-many relationship',
    oneLiner: 'Max n on both ends. Generates a join table whose PK is both foreign keys.',
    body: [
      'A student takes many courses, a course has many students. No single table can hold the FK, so the PDM adds a **join table** with PK = (`student_id`, `course_id`).',
      'As soon as the pair has data (a grade, a date) or must be referenced, replace the relationship with an **intermediate entity** (linter L03).',
    ],
    whenToUse: ['“several … and several …” in both directions', 'A pure link without any data of its own'],
    typicalMistake: 'Adding attributes to the relationship in your head — a relationship cannot store them.',
    miniModel: () => {
      const m = emptyModel('Many-to-many')
      const s = idEntity(m, 'Student', 0, 0, ['name'])
      const c = idEntity(m, 'Course', 300, 0, ['title'])
      addRelationship(m, s.id, c.id, { name: 'enrolled_in', cardinalityA: CARD.zeroMany, cardinalityB: CARD.zeroMany })
      return m
    },
    seeAlso: ['intermediate-entity'],
    caseRefs: ['tv-shows: TVShow — Director becomes ShowDirector'],
  },
  {
    id: 'multiple-relationships',
    title: 'Several relationships between two entities',
    oneLiner: 'The same pair linked twice, each with a different meaning. Roles name the meaning and the FK columns.',
    body: [
      'A flight leaves **from** one airport and arrives **at** another. Two relationships, two FKs. Without roles both would want the column `airport_id`.',
      'With roles `origin` / `destination` the columns become `origin_airport_id` and `destination_airport_id` (linter L08 asks for them).',
    ],
    whenToUse: ['The same entity plays two parts: origin/destination, buyer/seller, home/away team'],
    typicalMistake: 'One relationship with max n, hoping to “pick” two airports — the model cannot tell which is which.',
    miniModel: () => {
      const m = emptyModel('Multiple relationships')
      const airport = idEntity(m, 'Airport', 0, 0, ['city'], 'airport_code')
      const flight = idEntity(m, 'Flight', 320, 0, ['departs_at'], 'flight_no')
      addRelationship(m, airport.id, flight.id, { name: 'departs_from', roleA: 'origin' })
      addRelationship(m, airport.id, flight.id, { name: 'arrives_at', roleA: 'destination' })
      return m
    },
    seeAlso: ['reflexive-relationship', 'relationship'],
    caseRefs: ['timetables: Professor / Room links of a class'],
  },
  {
    id: 'reflexive-relationship',
    title: 'Reflexive relationship',
    oneLiner: 'An entity linked to itself: an employee has a manager who is also an employee.',
    body: [
      'Draw the relationship from the entity to itself. The FK references its own table: `EMPLOYEE.manager_employee_id → EMPLOYEE`.',
      'Give it roles (`manager` / `subordinate`): they name the column and make the reading unambiguous. The top of the hierarchy has no manager → min 0.',
    ],
    whenToUse: ['Hierarchies and networks of the same kind: manager, prerequisite course, previous version'],
    typicalMistake: 'A separate `Manager` entity holding copies of employee data.',
    miniModel: () => {
      const m = emptyModel('Reflexive relationship')
      const e = idEntity(m, 'Employee', 0, 30, ['name'])
      addRelationship(m, e.id, e.id, { name: 'manages', cardinalityA: CARD.zeroOne, cardinalityB: CARD.zeroMany, roleA: 'manager', roleB: 'subordinate' })
      return m
    },
    seeAlso: ['multiple-relationships'],
    caseRefs: [],
  },
  {
    id: 'n-ary-relationship',
    title: 'N-ary relationship',
    oneLiner: 'A fact that links three or more entities at once. Modeled as an intermediate entity depending on all of them.',
    body: [
      '“Professor X teaches course Y in academic year Z” is one fact about **three** things. Splitting it into three binary relationships loses which professor taught which course in which year.',
      'Create an intermediate entity dependent on all three: PK = (`course_id`, `professor_id`, `year_id`). Other entities can then reference it (Class → TeachingAssignment).',
    ],
    whenToUse: ['A sentence with three nouns that only make sense together', '“assignment”, “allocation”, “registration of … for … in …”'],
    typicalMistake: 'Three pairwise M:N relationships — they allow combinations that never happened.',
    miniModel: () => {
      const m = emptyModel('N-ary relationship')
      const c = idEntity(m, 'Course', 0, 0, ['ects'])
      const p = idEntity(m, 'Professor', 520, 0, ['name'])
      const y = idEntity(m, 'AcademicYear', 260, 170, [], 'year_id')
      const ta = addEntity(m, { name: 'TeachingAssignment', ...at(250, 0) })
      addRelationship(m, c.id, ta.id, { name: 'course_ta', dependentSide: 'B' })
      addRelationship(m, p.id, ta.id, { name: 'professor_ta', dependentSide: 'B' })
      addRelationship(m, y.id, ta.id, { name: 'year_ta', dependentSide: 'B' })
      return m
    },
    seeAlso: ['intermediate-entity'],
    caseRefs: ['timetables: TeachingAssignment'],
  },
  {
    id: 'inheritance',
    title: 'Inheritance',
    oneLiner: 'Children share the parent\'s attributes and identifier, and add their own attributes or relationships.',
    body: [
      'Actors, technicians and directors all have a name, a phone and an email → parent `Person`. Each child is justified by **different attributes or different relationships** (only actors have roles). A child with neither is not justified (L06), and a child must not repeat a parent attribute (L05).',
      '**Exclusive** (×): an instance belongs to at most one child. **Complete** (solid line): every instance belongs to some child. A person may act *and* direct → Person is not exclusive.',
    ],
    whenToUse: ['“… can be indoors **or** outdoors; for indoor … for outdoor …”', 'Several kinds with the same data but different links'],
    typicalMistake: 'Three separate entities with copied attributes — then “a participant” cannot be referenced as one thing.',
    miniModel: () => {
      const m = emptyModel('Inheritance')
      const person = idEntity(m, 'Person', 150, 0, ['name', 'email'])
      const actor = addEntity(m, { name: 'Actor', ...at(0, 210) })
      const director = addEntity(m, { name: 'Director', ...at(300, 210) })
      addAttribute(m, director.id, { name: 'guild_no', length: 20 })
      const scene = idEntity(m, 'Scene', -10, 360)
      addRelationship(m, actor.id, scene.id, { name: 'acts_in', cardinalityA: CARD.zeroMany })
      addInheritance(m, person.id, [actor.id, director.id], { name: 'kind', mutuallyExclusive: false, position: { x: 220, y: 140 } })
      return m
    },
    seeAlso: ['inheritance-generation'],
    caseRefs: ['tv-shows: Person → Actor, Technician, Director; Scene → IndoorScene, OutdoorScene'],
  },
  {
    id: 'inheritance-generation',
    title: 'Inheritance: PDM generation',
    oneLiner: 'Parent + children tables, parent table only, or children tables only.',
    body: [
      '**Parent + children** (course default): PERSON plus one table per child; the child PK is also a FK to PERSON.',
      'PowerDesigner also ticks **Inherit all attributes** by default: the child tables then get *copies* of the parent columns too (ACTOR: person_id, name, phone, email). StrataSQL leaves it off — the same name stored twice can disagree — but the checkbox in the inheritance panel turns it on, and imported PowerDesigner models keep it on.',
      '**Parent only**: one table, child columns become nullable, a **discriminator** column says which child a row is (with a CHECK). Simple, but NOT NULL rules for child columns are lost.',
      '**Children only**: parent columns are copied into each child table; no PERSON table — so nothing can reference “any person”.',
    ],
    whenToUse: ['Parent only: children differ in a few optional columns', 'Children only: the parent is never referenced on its own'],
    typicalMistake: 'Choosing “children only” and then needing a FK to the parent — there is no parent table to point at.',
    miniModel: () => {
      const m = emptyModel('Inheritance generation')
      const scene = idEntity(m, 'Scene', 120, 0, ['description'])
      const indoor = addEntity(m, { name: 'IndoorScene', ...at(0, 190) })
      addAttribute(m, indoor.id, { name: 'studio', length: 50 })
      const outdoor = addEntity(m, { name: 'OutdoorScene', ...at(260, 190) })
      addAttribute(m, outdoor.id, { name: 'location', length: 50 })
      addInheritance(m, scene.id, [indoor.id, outdoor.id], { name: 'scene_kind', generation: 'parent', discriminator: 'scene_type', position: { x: 190, y: 130 } })
      return m
    },
    seeAlso: ['inheritance', 'lookup-vs-check'],
    caseRefs: ['tv-shows: both inheritances use parent + children'],
  },
  {
    id: 'foreign-key-attribute',
    title: 'Foreign keys in the CDM',
    oneLiner: 'The CDM has no foreign keys. Draw a relationship; the PDM creates the FK column from it.',
    body: [
      'A foreign key is how a **table** stores a link. In the conceptual model the link itself is drawn: a relationship `Publisher — Book`. When the PDM is generated, `BOOK` gets the column `publisher_id` with `FOREIGN KEY … REFERENCES PUBLISHER` (this mini-model).',
      'Typing `publisher_id` into Book by hand gives an ordinary column: no constraint, so a book can point at a publisher that does not exist. If you also draw the relationship, the PDM has the column twice. Linter L11 points out such attributes.',
      'The same holds for intermediate and dependent entities: their keys come from **dependent relationships**, never from copied attributes.',
    ],
    whenToUse: ['You are about to type `<something>_id` into an entity', '“each book has one publisher” — a verb between two nouns is a relationship'],
    typicalMistake: '`PublisherID` as an attribute of Book with no Publisher entity at all: the publisher’s name, address… then have nowhere to go.',
    miniModel: () => {
      const m = emptyModel('Relationship instead of FK')
      const pub = idEntity(m, 'Publisher', 0, 0, ['name'])
      const book = idEntity(m, 'Book', 280, 0, ['title'])
      addRelationship(m, pub.id, book.id, { name: 'publishes' })
      return m
    },
    seeAlso: ['relationship', 'dependent-entity', 'intermediate-entity'],
    caseRefs: ['ride-hailing: Trip gets rider_id from the relationship requests'],
  },
  {
    id: 'circular-relationship',
    title: 'Cycle of relationships',
    oneLiner: 'Two paths between the same entities can disagree. Close the cycle with a shared key, or remove it.',
    body: [
      'TV Shows: an episode belongs to a show, and a show has directors (ShowDirector). If Episode also points straight at **Director**, nothing stops storing an episode directed by someone who is **not** a director of its show.',
      'Fix: point Episode at **ShowDirector** instead. Episode then gets (`show_id`, `person_id`) from ShowDirector and `show_id` from TVShow — the PDM keeps **one shared** `show_id`, so both paths reach the same show by construction (this mini-model). Linter L04 flags cycles that are not closed this way.',
    ],
    whenToUse: ['You can walk from one entity back to itself along relationships', '“…directed by one person, who must be a director of that show”'],
    typicalMistake: 'Linking to the “obvious” entity (Director) instead of the pair that already exists (ShowDirector).',
    miniModel: () => {
      const m = emptyModel('Cycle closed by a shared key')
      const show = idEntity(m, 'TVShow', 0, 0, ['title'], 'show_id')
      const sd = addEntity(m, { name: 'ShowDirector', ...at(300, 0) })
      const director = idEntity(m, 'Director', 590, 0, ['name'], 'person_id')
      const ep = idEntity(m, 'Episode', 150, 190, ['title'])
      addRelationship(m, show.id, ep.id, { name: 'has_episodes', cardinalityB: CARD.oneMany })
      addRelationship(m, show.id, sd.id, { name: 'show_directors', cardinalityB: CARD.oneMany, dependentSide: 'B' })
      addRelationship(m, director.id, sd.id, { name: 'director_shows', dependentSide: 'B' })
      addRelationship(m, sd.id, ep.id, { name: 'directs_episode' })
      return m
    },
    seeAlso: ['intermediate-entity', 'dependent-entity'],
    caseRefs: ['tv-shows §6.5'],
  },
  {
    id: 'derived-data',
    title: 'Derived data',
    oneLiner: 'Values that can be computed (averages, totals, counts, age) are computed in queries, not stored.',
    body: [
      'A driver\'s average rating is `AVG(score)` over the ratings. Store the **history** (each rating) and compute the average in a query — a stored `avg_rating` has to be updated by hand on every new rating and soon disagrees.',
      'The same holds for `age` (store `birth_date`) and counts (`number_of_trips`). Linter L09 points them out.',
    ],
    whenToUse: ['“from the ratings history”, “total of”, “number of”'],
    typicalMistake: '`avg_rating` in Driver next to a Rating entity that already has every score.',
    miniModel: () => {
      const m = emptyModel('Derived data')
      const driver = idEntity(m, 'Driver', 0, 0, ['name'])
      const rating = idEntity(m, 'Rating', 280, 0, [], 'rating_id')
      addAttribute(m, rating.id, { name: 'score', dataType: 'Short integer', mandatory: true })
      addAttribute(m, rating.id, { name: 'rated_at', dataType: 'Date & time' })
      addRelationship(m, driver.id, rating.id, { name: 'receives' })
      return m
    },
    seeAlso: ['history-temporal'],
    caseRefs: ['ride-hailing §6.4'],
  },
  {
    id: 'lookup-vs-check',
    title: 'Lookup table vs CHECK constraint',
    oneLiner: 'A fixed list of values: either a small entity referenced by FK, or a CHECK on a column.',
    body: [
      '**Lookup entity** (`Shift`: TP, P1–P4): new values are rows, not code changes; values can carry data (a description) and be referenced.',
      '**CHECK** (`status IN (\'Requested\', \'Ongoing\', \'Finished\')`): simplest for a short list that never changes and has no data of its own.',
    ],
    whenToUse: ['“types”, “categories”, “status”, “one of …”'],
    typicalMistake: 'A free-text column for a closed list — then “Finished”, “finished” and “done” all appear.',
    miniModel: () => {
      const m = emptyModel('Lookup table')
      const shift = addEntity(m, { name: 'Shift', ...at(0, 0) })
      addAttribute(m, shift.id, { name: 'shift_code', length: 2, primary: true })
      addAttribute(m, shift.id, { name: 'description', length: 50 })
      const cls = idEntity(m, 'Class', 280, 0, ['weekday'])
      addRelationship(m, shift.id, cls.id, { name: 'of_shift' })
      return m
    },
    seeAlso: ['inheritance-generation', 'business-rule'],
    caseRefs: ['timetables: Shift', 'ride-hailing: trip status'],
  },
  {
    id: 'history-temporal',
    title: 'History / temporal entity',
    oneLiner: 'When something changes over time and the past matters, store each period or event as a row.',
    body: [
      'A driver uses different cars at **different time intervals**. A plain Driver–Car link forgets when; an entity `CarShift` with `start_time` / `end_time` keeps every interval (end = NULL while still driving).',
      'Positions, prices, statuses: a dependent entity with a timestamp in its key (`recorded_at`) keeps the history.',
    ],
    whenToUse: ['“at different times”, “history of”, “each time …”, “over time”'],
    typicalMistake: 'Overwriting the current value (`current_car_id` in Driver) when the questions are about the past.',
    miniModel: () => {
      const m = emptyModel('History')
      const driver = idEntity(m, 'Driver', 0, 0, ['name'])
      const pos = addEntity(m, { name: 'DriverPosition', ...at(280, 0) })
      addAttribute(m, pos.id, { name: 'recorded_at', dataType: 'Date & time', primary: true })
      addAttribute(m, pos.id, { name: 'lat', dataType: 'Decimal', length: 9, precision: 6 })
      addAttribute(m, pos.id, { name: 'lng', dataType: 'Decimal', length: 9, precision: 6 })
      addRelationship(m, driver.id, pos.id, { name: 'positions', dependentSide: 'B' })
      return m
    },
    seeAlso: ['intermediate-with-id', 'dependent-entity', 'derived-data'],
    caseRefs: ['ride-hailing: CarShift, DriverPosition', 'timetables: Period'],
  },
  {
    id: 'business-rule',
    title: 'Business rules beyond the diagram',
    oneLiner: 'Some rules fit keys and constraints; the rest need triggers or application code. Write them down.',
    body: [
      'Many rules **can** be keys: “no two classes in one room at the same time” is a UNIQUE over (`room_id`, `period_id`, `weekday`, `slot_id`) — declared in the Physical view over migrated columns.',
      'Others **cannot**: “a director must have directed at least one show”, “end time after start time across tables”. List them next to the model (case files, §7) so they are implemented elsewhere.',
    ],
    whenToUse: ['“must”, “cannot”, “never”, “at least”, “only if”'],
    typicalMistake: 'Silently dropping a rule because the diagram has no symbol for it.',
    miniModel: () => {
      const m = emptyModel('Rule as a key')
      const room = idEntity(m, 'Room', 0, 0, ['name'])
      const booking = addEntity(m, { name: 'Booking', ...at(280, 0) })
      addAttribute(m, booking.id, { name: 'booking_id', dataType: 'Integer', primary: true })
      addAttribute(m, booking.id, { name: 'day', dataType: 'Date', mandatory: true })
      addAttribute(m, booking.id, { name: 'slot', dataType: 'Short integer', mandatory: true })
      addRelationship(m, room.id, booking.id, { name: 'booked' })
      addPhysicalKey(m, booking.id, { name: 'AK_ROOM_TIME', columns: ['room_id', 'day', 'slot'] })
      return m
    },
    seeAlso: ['alternate-identifier', 'lookup-vs-check'],
    caseRefs: ['timetables §5', 'tv-shows §7'],
  },
  {
    id: 'names-and-codes',
    title: 'Names and codes',
    oneLiner: 'Names are for people, codes are for the database. Both must be unique.',
    body: [
      'The entity **code** is the table name (`Car Shift` → `CAR_SHIFT`); the attribute code is the column name. They follow the name until you edit them.',
      'Two entities with the same name or code would produce two tables with one name; two attributes with the same name, two columns with one name (linter L10).',
    ],
    whenToUse: ['Always: singular nouns for entities, snake_case for attributes'],
    typicalMistake: 'Reserved words as names (`Order`, `User`) — allowed, but the SQL then needs brackets: `[ORDER]`.',
    seeAlso: ['entity', 'attribute'],
    caseRefs: ['ride-hailing: Car Shift → CAR_SHIFT'],
  },
]

export function helpCard(id: string): HelpCard | undefined {
  return HELP_CARDS.find((c) => c.id === id)
}

/** Glossary search over title, one-liner and signals. */
export function searchHelp(query: string): HelpCard[] {
  const q = query.trim().toLowerCase()
  if (!q) return HELP_CARDS
  return HELP_CARDS.filter((c) => [c.title, c.oneLiner, ...c.whenToUse, ...c.body].join(' ').toLowerCase().includes(q))
}

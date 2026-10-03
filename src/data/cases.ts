// Trainer cases (SPEC §9–10): the machine form of `cases/*.md` — specification text, the phrases
// that map to model elements (level 0 links, level 1 tagging), synonyms for the comparator and hints.

import type { Model } from '../core/metamodel'
import { buildLibrary } from './examples/library'
import { buildRideHailing } from './examples/ride-hailing'
import { buildTimetables } from './examples/timetables'
import { buildTvShows } from './examples/tv-shows'

export type Tag = 'entity' | 'attribute' | 'relationship' | 'inheritance' | 'rule'

export const TAGS: { id: Tag; label: string; hint: string }[] = [
  { id: 'entity', label: 'Entity', hint: 'a thing the database remembers' },
  { id: 'attribute', label: 'Attribute', hint: 'one fact about a thing' },
  { id: 'relationship', label: 'Relationship', hint: 'a link between things' },
  { id: 'inheritance', label: 'Inheritance', hint: 'kinds of one thing' },
  { id: 'rule', label: 'Rule', hint: 'a constraint the diagram alone does not draw' },
]

/** A phrase of the specification and what it becomes in the reference model. */
export interface TagSpan {
  /** Paragraph index in `spec`. */
  p: number
  /** Exact text; found in the paragraph after the previous span of that paragraph. */
  phrase: string
  tag: Tag
  /** Other tags that are also accepted (e.g. an M:N that becomes an intermediate entity). */
  accept?: Tag[]
  /** `entity:Name`, `relationship:name`, `inheritance:name` or `attribute:Entity.attr` in the reference. */
  target?: string
  why: string
  /** Walkthrough: show the phrase at the identifier step of its entity, not with the attributes. */
  step?: 'identifier'
}

/** How the walkthrough (`walkthrough.ts`) builds the reference model. */
export interface WalkPlan {
  /** Entity names in the order they are introduced; relationships follow once both ends exist. */
  order: string[]
  /** One step each for entity, attributes and identifier (starter case); otherwise one step per entity. */
  fine?: boolean
  /** Extra explanation per step key: `entity:X`, `attributes:X`, `identifier:X`, `relationship:r`, `inheritance:i`, `keys`. */
  notes?: Record<string, string>
}

export interface TrainerCase {
  id: string
  title: string
  source: string
  difficulty: 1 | 2 | 3
  concepts: string[]
  build: () => Model
  spec: string[]
  spans: TagSpan[]
  /** Key decisions, shown with the worked example (level 0). */
  lessons: string[]
  /** Reference entity name → accepted alternative names. */
  synonyms: Record<string, string[]>
  /** Reference key (`entity:Scene`, `relationship:has_scenes`…) → hints, mildest first. */
  hints: Record<string, string[]>
  walk: WalkPlan
}

export const LEVELS = [
  { level: 0, title: 'Worked example', task: 'Read the text next to the reference model. Click a highlighted phrase to see the element it became.' },
  { level: 1, title: 'Text tagging', task: 'Click each underlined phrase and say what it becomes in the model.' },
  { level: 2, title: 'Complete the model', task: 'The entities are given. Add the relationships (with cardinalities and dependencies) and the inheritances, then press Check. Stuck? Next hint.' },
  { level: 3, title: 'Build it yourself', task: 'Build the whole conceptual model from the text, then press Check. Stuck? Next hint shows what to add next, step by step.' },
] as const

const ALL: TrainerCase[] = [
  {
    id: 'library',
    title: 'Library',
    source: 'Starter case (StrataSQL)',
    difficulty: 1,
    concepts: ['entity and attributes', 'primary vs alternate identifier', 'one-to-many', 'many-to-many → join table', 'intermediate entity with own id'],
    build: buildLibrary,
    spec: [
      'A small library wants a database of its books, the people who borrow them and the loans. The library keeps one copy of each book.',
      'Each book has an ISBN, a title and a publication year. No two books share an ISBN.',
      'Books come from publishers: every book is published by one publisher, and a publisher can publish many books. For each publisher we keep its name and country.',
      'Authors write books: a book can be written by several authors, and an author can write several books. For each author we keep the name and the birth year.',
      'Members are identified by their card number. We also keep each member’s name and email; no two members share an email.',
      'A member can borrow many books, and the same book is borrowed by many members over time — the same member may even borrow the same book again later. For each loan we record the loan date, the due date and the return date, which stays empty until the book comes back.',
    ],
    spans: [
      { p: 0, phrase: 'books', tag: 'entity', target: 'entity:Book', why: 'A thing the library must remember, with facts of its own (ISBN, title…) → entity Book.' },
      { p: 0, phrase: 'the people who borrow them', tag: 'entity', target: 'entity:Member', why: 'People the library keeps data about → entity Member (paragraph 5 names them).' },
      { p: 0, phrase: 'the loans', tag: 'entity', accept: ['relationship'], target: 'entity:Loan', why: 'A loan is an event with its own dates → entity Loan (it links a member and a book).' },
      { p: 1, phrase: 'ISBN', tag: 'attribute', target: 'attribute:Book.isbn', why: 'One value per book → attribute `isbn` (13 characters).' },
      { p: 1, phrase: 'title', tag: 'attribute', target: 'attribute:Book.title', why: 'One value per book → attribute.' },
      { p: 1, phrase: 'publication year', tag: 'attribute', target: 'attribute:Book.pub_year', why: 'One value per book → attribute `pub_year`.' },
      { p: 1, phrase: 'No two books share an ISBN', tag: 'rule', accept: ['attribute'], target: 'attribute:Book.isbn', step: 'identifier', why: 'A uniqueness rule → `isbn` becomes an alternate identifier <ai>, i.e. UNIQUE in the table.' },
      { p: 2, phrase: 'publishers', tag: 'entity', target: 'entity:Publisher', why: 'Has its own facts (name, country) and many books → entity, not a text attribute of Book.' },
      { p: 2, phrase: 'every book is published by one publisher', tag: 'relationship', target: 'relationship:publishes', why: '“One publisher” per book → the Publisher end is 1,1 (exactly one).' },
      { p: 2, phrase: 'a publisher can publish many books', tag: 'relationship', target: 'relationship:publishes', why: '“Can … many” → the Book end is 0,n (zero or more). One-to-many: the FK goes into BOOK.' },
      { p: 2, phrase: 'name', tag: 'attribute', target: 'attribute:Publisher.name', why: 'A fact about the publisher → attribute of Publisher.' },
      { p: 2, phrase: 'country', tag: 'attribute', target: 'attribute:Publisher.country', why: 'A fact about the publisher → attribute.' },
      { p: 3, phrase: 'Authors', tag: 'entity', target: 'entity:Author', why: 'People with their own facts (name, birth year) → entity Author.' },
      { p: 3, phrase: 'a book can be written by several authors, and an author can write several books', tag: 'relationship', target: 'relationship:writes', why: 'Several on both sides → many-to-many. The pair (author, book) has no data of its own, so it stays a relationship; the PDM makes a join table.' },
      { p: 3, phrase: 'name', tag: 'attribute', target: 'attribute:Author.name', why: 'A fact about the author → attribute.' },
      { p: 3, phrase: 'birth year', tag: 'attribute', target: 'attribute:Author.birth_year', why: 'Store the birth year, not the age: the age changes every year (derived data).' },
      { p: 4, phrase: 'Members', tag: 'entity', target: 'entity:Member', why: 'The people who borrow → entity Member.' },
      { p: 4, phrase: 'identified by their card number', tag: 'attribute', target: 'attribute:Member.card_no', step: 'identifier', why: 'The text names the identifier: `card_no` → primary identifier <pi>.' },
      { p: 4, phrase: 'name', tag: 'attribute', target: 'attribute:Member.name', why: 'A fact about the member → attribute.' },
      { p: 4, phrase: 'email', tag: 'attribute', target: 'attribute:Member.email', why: 'A fact about the member → attribute.' },
      { p: 4, phrase: 'no two members share an email', tag: 'rule', accept: ['attribute'], target: 'attribute:Member.email', step: 'identifier', why: 'Unique too → `email` is an alternate identifier <ai> (UNIQUE).' },
      { p: 5, phrase: 'A member can borrow many books, and the same book is borrowed by many members', tag: 'relationship', accept: ['entity'], target: 'entity:Loan', why: 'Many on both sides, like authors and books — but this pair has data (dates) → intermediate entity Loan between Member and Book.' },
      { p: 5, phrase: 'the same member may even borrow the same book again later', tag: 'rule', accept: ['entity'], target: 'entity:Loan', step: 'identifier', why: 'The pair (member, book) repeats → it cannot identify a loan. Loan gets its own id `loan_id`.' },
      { p: 5, phrase: 'loan date', tag: 'attribute', target: 'attribute:Loan.loan_date', why: 'A fact of one loan (not of the member, not of the book) → attribute of Loan.' },
      { p: 5, phrase: 'due date', tag: 'attribute', target: 'attribute:Loan.due_date', why: 'A fact of one loan → attribute of Loan.' },
      { p: 5, phrase: 'return date', tag: 'attribute', target: 'attribute:Loan.return_date', why: 'A fact of one loan → attribute of Loan.' },
      { p: 5, phrase: 'stays empty until the book comes back', tag: 'rule', accept: ['attribute'], target: 'attribute:Loan.return_date', why: 'May be empty → `return_date` is not mandatory (NULL allowed). An empty return date means “still out”.' },
    ],
    lessons: [
      '**Publisher** is an entity, not a text field of Book: it has its own facts and many books.',
      '**book_id** is the primary identifier, **isbn** an alternate one: both are unique, but other tables copy the short number.',
      '**Author — Book** is many-to-many with no data → a plain relationship; the PDM adds the join table.',
      '**Loan** is many-to-many with data → an intermediate entity. The same member can borrow the same book again, so Loan has its **own id**.',
      'An empty **return_date** means “still out”: not mandatory, NULL allowed.',
    ],
    synonyms: {
      Member: ['Reader', 'Borrower', 'Customer', 'User'],
      Loan: ['Borrowing', 'Lending', 'Checkout'],
      Author: ['Writer'],
      Publisher: ['PublishingHouse'],
    },
    hints: {
      'entity:Publisher': ['A publisher has a name and a country, and many books. Is it one text field of Book, or a thing of its own?'],
      'relationship:writes': ['How many authors can one book have? How many books one author?', 'Does the pair (author, book) have any data of its own?'],
      'entity:Loan': ['Where do the loan date and the return date belong — to the member, to the book, or to the pair?', 'Can the same member borrow the same book twice?'],
      'relationship:borrows': ['Where do the loan date and the return date belong — to the member, to the book, or to the pair?'],
      'relationship:is_lent': ['Where do the loan date and the return date belong — to the member, to the book, or to the pair?'],
    },
    walk: {
      order: ['Book', 'Publisher', 'Author', 'Member', 'Loan'],
      fine: true,
      notes: {
        'entity:Book': 'Start with the nouns the text describes. Book is the centre of this text, so it comes first. An entity is drawn as a box with its name; its facts follow in the next step.',
        'identifier:Book': 'The ISBN is unique, so it *could* be the primary identifier. We still add a short number `book_id`: it is what other tables copy as their foreign key, and it never changes. The ISBN stays an alternate identifier, so the rule “no two books share an ISBN” is still enforced by UNIQUE.',
        'entity:Publisher': 'Could the publisher just be a text attribute of Book? No: it has its own facts (name, country) and many books. Typing the same publisher name into every book would repeat it — and one typo makes two publishers.',
        'relationship:writes': 'Compare with Publisher: here *both* sides are “several”. In the CDM it stays one line. A table cannot hold a list in one column, so the PDM adds a join table with one row per (author, book) pair.',
        'identifier:Member': 'This time the text gives the identifier, so no invented id is needed.',
        'entity:Loan': 'Member ↔ Book is many-to-many, like Author ↔ Book — but this pair has data (dates). Data needs a place, so the pair becomes an entity of its own: an **intermediate entity**.',
        'identifier:Loan': 'Could (member, book) identify a loan? No: the same member may borrow the same book again. The pair repeats, so Loan gets its own `loan_id`.',
      },
    },
  },
  {
    id: 'tv-shows',
    title: 'TV Shows',
    source: 'NOVA IMS DBMS 2026/27, Class 03',
    difficulty: 2,
    concepts: ['inheritance', 'dependent entity', 'intermediate entity with / without own id', 'cycles'],
    build: buildTvShows,
    spec: [
      'A TV show has a title, a genre, and a release year. A TV show has several episodes characterized by a title, a summary, and a duration (in minutes). Each episode is made of several scenes.',
      'Each episode is composed of a set of scenes that can be indoors or outdoors. For indoor scenes, it is necessary to know the scenario and the studio where the scene will be recorded. For outdoor scenes it makes sense to know the location and type of landscape. Scenes are always identified by the episode they relate to and an order number (not sequential).',
      'The participants in a scene are the actors and the technicians and are characterized by a name, a phone number, and an email. Each actor can play different roles in different scenes (but just one role in each scene) and several actors can participate in a scene. Technicians can participate in different scenes and even assume different functions in the same scene (e.g., a technician can accumulate sound and lighting in the same scene) and scenes have several technicians assigned.',
      'A TV Show can be directed by several directors, but each episode is directed by only one person. The information stored about the directors is the same that is stored for other participants (name, phone number and email).',
      'In your design you should include additional attributes to complement the database or to improve the design (e.g., keys).',
    ],
    spans: [
      { p: 0, phrase: 'TV show', tag: 'entity', target: 'entity:TVShow', why: 'A noun the text describes with its own facts (title, genre…) → entity.' },
      { p: 0, phrase: 'title', tag: 'attribute', target: 'attribute:TVShow.title', why: 'One value per show → attribute.' },
      { p: 0, phrase: 'genre', tag: 'attribute', accept: ['entity'], target: 'attribute:TVShow.genre', why: 'One value per show → attribute (a Genre lookup entity is a valid refinement).' },
      { p: 0, phrase: 'release year', tag: 'attribute', target: 'attribute:TVShow.release_year', why: 'One value per show → attribute.' },
      { p: 0, phrase: 'has several episodes', tag: 'relationship', target: 'relationship:has_episodes', why: 'A verb between two nouns; “several” marks the many side → TVShow 1,1 — 1,n Episode.' },
      { p: 0, phrase: 'summary', tag: 'attribute', target: 'attribute:Episode.summary', why: 'A fact about an episode → attribute.' },
      { p: 0, phrase: 'duration', tag: 'attribute', target: 'attribute:Episode.duration_min', why: 'A measure of an episode → attribute (`duration_min`: the unit goes into the name).' },
      { p: 0, phrase: 'made of several scenes', tag: 'relationship', target: 'relationship:has_scenes', why: 'Episode 1 — n Scene; the next paragraph says scenes are identified through it.' },
      { p: 1, phrase: 'can be indoors or outdoors', tag: 'inheritance', target: 'inheritance:scene_kind', why: 'Kinds of one thing, each with its own data → inheritance; “or” → exclusive.' },
      { p: 1, phrase: 'scenario', tag: 'attribute', target: 'attribute:IndoorScene.scenario', why: 'Only indoor scenes have it → attribute of the child IndoorScene.' },
      { p: 1, phrase: 'studio', tag: 'attribute', target: 'attribute:IndoorScene.studio', why: 'Only indoor scenes have it → attribute of IndoorScene.' },
      { p: 1, phrase: 'location', tag: 'attribute', target: 'attribute:OutdoorScene.location', why: 'Only outdoor scenes have it → attribute of OutdoorScene.' },
      { p: 1, phrase: 'type of landscape', tag: 'attribute', target: 'attribute:OutdoorScene.landscape_type', why: 'Only outdoor scenes → attribute of OutdoorScene.' },
      { p: 1, phrase: 'identified by the episode they relate to', tag: 'relationship', target: 'relationship:has_scenes', why: 'Identified through another entity → dependent relationship: Scene depends on Episode.' },
      { p: 1, phrase: 'an order number', tag: 'attribute', target: 'attribute:Scene.order_no', why: 'The own part of Scene’s identifier: PK = (episode_id, order_no).' },
      { p: 2, phrase: 'actors', tag: 'entity', target: 'entity:Actor', why: 'A kind of participant with its own relationships (roles) → entity, child of Person.' },
      { p: 2, phrase: 'technicians', tag: 'entity', target: 'entity:Technician', why: 'Another kind of participant → entity, child of Person.' },
      { p: 2, phrase: 'name', tag: 'attribute', target: 'attribute:Person.name', why: 'Every participant has it → attribute of the parent Person.' },
      { p: 2, phrase: 'phone number', tag: 'attribute', target: 'attribute:Person.phone', why: 'Shared by all participants → Person.' },
      { p: 2, phrase: 'email', tag: 'attribute', target: 'attribute:Person.email', why: 'Shared by all participants → Person.' },
      { p: 2, phrase: 'different roles in different scenes', tag: 'relationship', accept: ['entity'], target: 'entity:Role', why: 'Actor many — many Scene, and the pair has data (the role) → intermediate entity Role.' },
      { p: 2, phrase: 'just one role in each scene', tag: 'rule', target: 'entity:Role', why: 'A rule the keys can enforce: Role has no own id, so PK = (actor, scene) allows one row per pair.' },
      { p: 2, phrase: 'different functions in the same scene', tag: 'relationship', accept: ['entity'], target: 'entity:TechnicianFunction', why: 'The pair (technician, scene) repeats → intermediate entity with its own id (`function_no`).' },
      { p: 3, phrase: 'directed by several directors', tag: 'relationship', accept: ['entity'], target: 'entity:ShowDirector', why: 'Show many — many Director → intermediate entity ShowDirector.' },
      { p: 3, phrase: 'each episode is directed by only one person', tag: 'relationship', target: 'relationship:directs_episode', why: 'One director per episode — and it must be a director of that show → link Episode to ShowDirector, not to Director (no cycle).' },
      { p: 3, phrase: 'the same that is stored for other participants', tag: 'inheritance', target: 'inheritance:participant_kind', why: 'Same data, different relationships → parent Person with children Actor, Technician, Director (not exclusive).' },
    ],
    lessons: [
      'Actor, Technician and Director have the same attributes but **different relationships** — that alone justifies inheritance.',
      '**Role** has no own id: “just one role in each scene” → PK = (actor, scene).',
      '**TechnicianFunction** has its own id: several functions in the same scene → the pair repeats.',
      '**Scene** is dependent: “identified by the episode … and an order number”.',
      'Episode links to **ShowDirector**, not Director: otherwise an episode could be directed by someone who does not direct its show (cycle).',
    ],
    synonyms: {
      TVShow: ['Show', 'Series', 'TVSeries'],
      Role: ['Casting', 'Participation', 'ActorScene', 'ActorRole'],
      TechnicianFunction: ['Assignment', 'TechnicianScene', 'Crew', 'Function'],
      Person: ['Participant'],
      ShowDirector: ['Direction', 'DirectorShow'],
    },
    hints: {
      'entity:Scene': ['Read how scenes are *identified*.', 'Identified by the episode **and** a number → what kind of entity?'],
      'relationship:has_scenes': ['Read how scenes are *identified*.', 'Identified by the episode **and** a number → what kind of entity?'],
      'entity:Role': ['Where does the role name belong — to the actor or to the scene?', 'Neither: it belongs to the pair.'],
      'relationship:actor_role': ['Where does the role name belong — to the actor or to the scene?', 'Neither: it belongs to the pair.'],
      'relationship:scene_role': ['Where does the role name belong — to the actor or to the scene?', 'Neither: it belongs to the pair.'],
      'entity:TechnicianFunction': ['Can the same technician appear twice in the same scene?'],
      'relationship:technician_function': ['Can the same technician appear twice in the same scene?'],
      'relationship:scene_function': ['Can the same technician appear twice in the same scene?'],
      'entity:Person': ['Three kinds of participants share the same data. What construct avoids repeating it?'],
      'inheritance:participant_kind': ['Three kinds of participants share the same data. What construct avoids repeating it?', 'Can the same person act in one show and direct another?'],
      'inheritance:scene_kind': ['Indoor and outdoor scenes have different data. Can a scene be both?'],
      'relationship:directs_episode': ['Draw every path between Episode and Director. How many are there?', 'The director of an episode must direct its show. Which entity already holds (show, director) pairs?'],
    },
    walk: {
      order: ['TVShow', 'Episode', 'Scene', 'IndoorScene', 'OutdoorScene', 'Person', 'Director', 'Actor', 'Technician', 'ShowDirector', 'Role', 'TechnicianFunction'],
      notes: {
        'entity:Person': 'The text never says “person”: Person collects what actors, technicians and directors share, so it is written once.',
      },
    },
  },
  {
    id: 'timetables',
    title: 'Timetables',
    source: 'NOVA IMS DBMS 2026/27, Class 03',
    difficulty: 3,
    concepts: ['intermediate entity that is referenced', 'M:N with attributes', 'time slots', 'alternate keys as rules'],
    build: buildTimetables,
    spec: [
      'The same course may be shared by several programs and may take different names in those programs - e.g., Databases (LSTI) and Databases I (LGI) are the same course for different programs.',
      'Consider also the possibility that the course corresponds to different years depending on the program (e.g., Databases could be a 2nd year course for LGI and a 1st year course for LSTI).',
      'For each course there may be several professors, and one professor may teach several courses. The assignment of courses to teachers is done by academic year - "Assignment of Teaching Service".',
      'Each class takes place in a room at a predefined time interval (hh:mm - hh:mm), with slots of 30 minutes, on a particular day of the week and for a given shift (TP, P1, P2, P3, P4).',
      'One class corresponds to one course, and one course can have several classes.',
      'Class scheduling can be different depending on the time period (i.e., the timetable can be different depending on the week).',
      'Rule 1: Two classes can’t occur in the same place at the same time.',
      'Rule 2: A professor cannot teach at two different places at the same time.',
      'Rule 3: Two classes of the same course and the same shift cannot coexist in time (time and day of the week).',
    ],
    spans: [
      { p: 0, phrase: 'course', tag: 'entity', target: 'entity:Course', why: 'The “real” course, independent of the program → entity.' },
      { p: 0, phrase: 'shared by several programs', tag: 'relationship', accept: ['entity'], target: 'entity:ProgramCourse', why: 'Program many — many Course, with data of the pair → intermediate entity ProgramCourse.' },
      { p: 0, phrase: 'different names in those programs', tag: 'attribute', target: 'attribute:ProgramCourse.name_in_program', why: 'The name depends on the (program, course) pair → attribute of ProgramCourse, not of Course.' },
      { p: 1, phrase: 'different years depending on the program', tag: 'attribute', target: 'attribute:ProgramCourse.curricular_year', why: 'Another fact about the pair → ProgramCourse.curricular_year.' },
      { p: 2, phrase: 'several professors', tag: 'entity', target: 'entity:Professor', why: 'A person the timetable refers to → entity.' },
      { p: 2, phrase: 'professor may teach several courses', tag: 'relationship', accept: ['entity'], target: 'entity:TeachingAssignment', why: 'Course many — many Professor, per year → intermediate entity TeachingAssignment.' },
      { p: 2, phrase: 'academic year', tag: 'entity', target: 'entity:AcademicYear', why: 'The assignment is “by academic year” → a third parent of TeachingAssignment.' },
      { p: 2, phrase: 'Assignment of Teaching Service', tag: 'entity', accept: ['relationship'], target: 'entity:TeachingAssignment', why: 'A named link that Class must reference → a real entity (Course × Professor × AcademicYear).' },
      { p: 3, phrase: 'class', tag: 'entity', target: 'entity:Class', why: 'One weekly meeting → entity, identified by its context.' },
      { p: 3, phrase: 'takes place in a room', tag: 'relationship', target: 'relationship:room_classes', why: 'Class n — 1 Room (dependent here, so room_id reaches ClassSlot for the rules).' },
      { p: 3, phrase: 'slots of 30 minutes', tag: 'entity', accept: ['attribute'], target: 'entity:Slot', why: 'Cut time into equal slots (Slot) and store one ClassSlot row per slot: overlaps become equal values that UNIQUE can catch.' },
      { p: 3, phrase: 'day of the week', tag: 'attribute', target: 'attribute:Class.weekday', why: 'A fact of the class → `weekday`, the own part of Class’s identifier.' },
      { p: 3, phrase: 'shift', tag: 'entity', accept: ['attribute'], target: 'entity:Shift', why: 'A fixed list (TP, P1…P4) → lookup entity Shift (or a CHECK on an attribute).' },
      { p: 4, phrase: 'One class corresponds to one course', tag: 'relationship', target: 'relationship:taught_in', why: 'Through TeachingAssignment, which gives the course **and** the professor.' },
      { p: 5, phrase: 'time period', tag: 'entity', target: 'entity:Period', why: 'Weeks in which one version of the timetable is valid → entity Period.' },
      { p: 6, phrase: 'can’t occur in the same place at the same time', tag: 'rule', target: 'entity:ClassSlot', why: 'Becomes AK_ROOM_TIME (room_id, period_id, weekday, slot_id) on CLASSSLOT.' },
      { p: 7, phrase: 'cannot teach at two different places at the same time', tag: 'rule', target: 'entity:ClassSlot', why: 'Becomes AK_PROFESSOR_TIME on CLASSSLOT.' },
      { p: 8, phrase: 'cannot coexist in time', tag: 'rule', target: 'entity:ClassSlot', why: 'Becomes AK_COURSE_SHIFT_TIME on CLASSSLOT.' },
    ],
    lessons: [
      '**TeachingAssignment** is an intermediate entity that Class must *reference* — so it is a real entity.',
      'The course name and year depend on the program → **ProgramCourse**.',
      'A UNIQUE cannot compare intervals; cut time into **30-minute slots** and overlaps become equal values.',
      'Class is identified by its context, so room, professor, course, shift, period and weekday **migrate** into CLASSSLOT, where the three rules become alternate keys.',
      '**Period** lets the timetable differ from week to week.',
    ],
    synonyms: {
      TeachingAssignment: ['TeachingService', 'Lecturing', 'CourseProfessor', 'Assignment', 'Teaching'],
      ProgramCourse: ['Curriculum', 'StudyPlan', 'CourseProgram'],
      ClassSlot: ['Schedule', 'Occupation'],
      Period: ['Term', 'WeekRange'],
      Slot: ['TimeSlot'],
      Class: ['Lesson', 'Session'],
      AcademicYear: ['Year', 'SchoolYear'],
    },
    hints: {
      'entity:ProgramCourse': ['Where does “Databases I” live — in Course or somewhere else?'],
      'relationship:program_courses': ['Where does “Databases I” live — in Course or somewhere else?'],
      'relationship:course_programs': ['Where does “Databases I” live — in Course or somewhere else?'],
      'entity:TeachingAssignment': ['Class must know both course and professor. Which entity already holds that pair?'],
      'relationship:taught_in': ['Class must know both course and professor. Which entity already holds that pair?'],
      'entity:ClassSlot': ['Can a UNIQUE constraint compare time intervals? What if time were cut into equal pieces?'],
      'entity:Slot': ['Can a UNIQUE constraint compare time intervals? What if time were cut into equal pieces?'],
      'relationship:occupies': ['Can a UNIQUE constraint compare time intervals? What if time were cut into equal pieces?'],
      'entity:Class': ['Only key columns migrate through a FK. Which columns do the three rules need in the slot table?'],
    },
    walk: {
      order: ['Program', 'Course', 'ProgramCourse', 'Professor', 'AcademicYear', 'TeachingAssignment', 'Room', 'Shift', 'Period', 'Class', 'Slot', 'ClassSlot'],
      notes: {
        keys: 'Each rule says “not twice at the same time”: two CLASSSLOT rows with the same time and the same room (or professor, or course and shift) must not exist. That is exactly a UNIQUE key over those columns — and they are all in CLASSSLOT because they migrated through the dependent relationships.',
      },
    },
  },
  {
    id: 'ride-hailing',
    title: 'Ride Hailing',
    source: 'NOVA IMS DBMS 2026/27, Shadow Project — Part I',
    difficulty: 2,
    concepts: ['M:N with time intervals (history)', 'dependent entity with order', 'ratings in both directions', 'derived data'],
    build: buildRideHailing,
    spec: [
      'The database must store trip requests (made by riders) and assignments (to drivers/cars).',
      'Cars, driven by drivers. A car can be shared by several drivers, and a driver can drive several cars in different time intervals.',
      'Ratings between riders and drivers.',
      'Riders request trips by providing pickup and drop-off locations and in some cases stop-over locations; riders rate drivers after trips.',
      'Drivers offer rides using registered vehicles; accept or decline trip requests that have been assigned to them (based on location); drivers rate riders after trips.',
      'Trip request & assignment: the system searches nearby available drivers/cars, which needs the positions of riders and drivers/cars, and must compute the drivers’ and riders’ rating averages from the ratings history. One driver accepts: the status goes from “Requested” to “Accepted”.',
      'Trip execution: at pick-up the status becomes “Ongoing”; at completion, “Finished”. Both rider and driver can rate each other.',
    ],
    spans: [
      { p: 0, phrase: 'trip requests', tag: 'entity', target: 'entity:Trip', why: 'The central thing the database remembers → entity Trip.' },
      { p: 0, phrase: 'made by riders', tag: 'relationship', target: 'relationship:requests', why: 'Rider 1,1 — 0,n Trip.' },
      { p: 0, phrase: 'assignments (to drivers/cars)', tag: 'relationship', target: 'relationship:serves', why: 'Trip → CarShift (0,1 while still “Requested”): one FK gives the driver **and** the car.' },
      { p: 1, phrase: 'Cars', tag: 'entity', target: 'entity:Car', why: 'A thing with its own data (plate, make…) → entity.' },
      { p: 1, phrase: 'shared by several drivers', tag: 'relationship', accept: ['entity'], target: 'entity:Car Shift', why: 'Car many — many Driver → an intermediate entity.' },
      { p: 1, phrase: 'in different time intervals', tag: 'entity', accept: ['attribute', 'relationship'], target: 'entity:Car Shift', why: 'The same pair repeats over time → CarShift with its own id and start/end time.' },
      { p: 2, phrase: 'Ratings', tag: 'entity', accept: ['relationship'], target: 'entity:Driver Rating', why: 'Two directions → DriverRating and RiderRating, each dependent 1:1 on Trip.' },
      { p: 3, phrase: 'Riders', tag: 'entity', target: 'entity:Rider', why: 'An actor with its own data → entity.' },
      { p: 3, phrase: 'pickup and drop-off locations', tag: 'attribute', target: 'attribute:Trip.pickup_lat', why: 'One pickup and one drop-off per trip → attributes of Trip (lat, lng, address).' },
      { p: 3, phrase: 'in some cases stop-over locations', tag: 'entity', accept: ['relationship'], target: 'entity:Trip Stop', why: '“In some cases”, possibly several → dependent entity TripStop with `stop_order`, not stop1/stop2 columns.' },
      { p: 3, phrase: 'riders rate drivers after trips', tag: 'relationship', accept: ['entity'], target: 'relationship:driver_rated', why: 'At most one rating of the driver per trip → DriverRating, dependent 1:1 on Trip.' },
      { p: 4, phrase: 'Drivers', tag: 'entity', target: 'entity:Driver', why: 'An actor with its own data → entity.' },
      { p: 4, phrase: 'accept or decline', tag: 'rule', accept: ['entity', 'attribute'], why: 'The reference keeps only the accepted assignment and the status; storing declines needs a TripOffer entity (open point for the group).' },
      { p: 4, phrase: 'based on location', tag: 'rule', why: 'A business rule computed from positions — not drawn in the model.' },
      { p: 4, phrase: 'drivers rate riders after trips', tag: 'relationship', accept: ['entity'], target: 'relationship:rider_rated', why: 'At most one rating of the rider per trip → RiderRating, dependent 1:1 on Trip.' },
      { p: 5, phrase: 'positions of riders and drivers/cars', tag: 'entity', accept: ['attribute'], target: 'entity:Driver Position', why: 'Positions change over time → history entities DriverPosition and RiderPosition (who, recorded_at, lat, lng).' },
      { p: 5, phrase: 'rating averages from the ratings history', tag: 'rule', accept: ['attribute'], why: 'Derived data: computed with AVG over the ratings, never stored (linter L09).' },
      { p: 5, phrase: 'status', tag: 'attribute', target: 'attribute:Trip.status', why: 'Trip.status, with a timestamp per stage (accepted_at, started_at…).' },
      { p: 6, phrase: 'at pick-up', tag: 'attribute', accept: ['rule'], target: 'attribute:Trip.started_at', why: 'The moment of the change → Trip.started_at. The order of the statuses itself is a business rule.' },
    ],
    lessons: [
      '**CarShift** instead of a plain Driver–Car link: “different time intervals” → the pair repeats → own id + start/end.',
      'Trip → CarShift is **0,1**: NULL while the trip is “Requested”; one FK gives driver and car.',
      'Ratings: two dependent 1:1 entities, PK = trip_id → at most one rating per direction per trip.',
      'Store the history, compute the average: no `avg_rating` column.',
      '**TripStop** is dependent with an order: “in some cases” → 0..n rows, not stop1/stop2 columns.',
    ],
    synonyms: {
      'Car Shift': ['DriverCar', 'Assignment', 'VehicleUsage', 'Shift', 'CarAssignment'],
      Trip: ['Ride', 'TripRequest'],
      'Trip Stop': ['Stopover', 'Waypoint', 'Stop'],
      'Driver Rating': ['RatingOfDriver', 'DriverReview'],
      'Rider Rating': ['RatingOfRider', 'RiderReview'],
      Car: ['Vehicle'],
      'Driver Position': ['DriverLocation'],
      'Rider Position': ['RiderLocation'],
    },
    hints: {
      'entity:Car Shift': ['A driver drives a car *during a time interval*. Where does the interval live?'],
      'relationship:drives': ['A driver drives a car *during a time interval*. Where does the interval live?'],
      'relationship:is_driven': ['A driver drives a car *during a time interval*. Where does the interval live?'],
      'relationship:serves': ['Which entity tells you both the driver and the car of a trip?', 'Is there a shift while the trip is still “Requested”?'],
      'entity:Driver Rating': ['How many ratings of the driver can one trip have?'],
      'entity:Rider Rating': ['How many ratings of the rider can one trip have?'],
      'entity:Trip Stop': ['“In some cases stop-over locations” — how many, and in which order?'],
    },
    walk: {
      order: ['Rider', 'Trip', 'Trip Stop', 'Driver', 'Car', 'Car Shift', 'Driver Rating', 'Rider Rating', 'Driver Position', 'Rider Position'],
    },
  },
]

/** Easiest first: the walkthrough and the case picker follow this order. */
const ORDER = ['library', 'ride-hailing', 'tv-shows', 'timetables']
export const CASES: TrainerCase[] = ORDER.map((id) => ALL.find((c) => c.id === id)!)

export function caseById(id: string): TrainerCase | undefined {
  return CASES.find((c) => c.id === id)
}

/** A paragraph cut into plain text and spans, in order. Throws if a phrase is not found (tested). */
export function splitParagraph(c: TrainerCase, p: number): ({ text: string } | { text: string; span: TagSpan; index: number })[] {
  const text = c.spec[p]
  const out: ({ text: string } | { text: string; span: TagSpan; index: number })[] = []
  let at = 0
  c.spans.forEach((span, index) => {
    if (span.p !== p) return
    const k = text.indexOf(span.phrase, at)
    if (k < 0) throw new Error(`${c.id}: phrase “${span.phrase}” not found in paragraph ${p}`)
    if (k > at) out.push({ text: text.slice(at, k) })
    out.push({ text: span.phrase, span, index })
    at = k + span.phrase.length
  })
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** Hints for a reference element: its own, else those of the entities it involves. */
export function hintsFor(c: TrainerCase, refKey: string | undefined, refEntities: string[]): string[] {
  if (refKey && c.hints[refKey]) return c.hints[refKey]
  for (const e of refEntities) if (c.hints[`entity:${e}`]) return c.hints[`entity:${e}`]
  return []
}

/** Phrases of the text that point at a reference element — “look at the words …”. */
export function phrasesFor(c: TrainerCase, refKey: string | undefined): string[] {
  if (!refKey) return []
  return c.spans.filter((s) => s.target === refKey).map((s) => s.phrase)
}

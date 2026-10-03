// Open exercises (stage 5+): a specification text with no reference model, so no score. The student
// models it, the linter and the Sandbox give feedback, and a checklist of questions guides a
// self-review. Texts are written for StrataSQL.

export interface Exercise {
  id: string
  title: string
  difficulty: 1 | 2 | 3
  /** What the exercise practises — shown in the picker. */
  concepts: string[]
  spec: string[]
  /** Self-review questions, one decision each. */
  checklist: string[]
}

export const EXERCISES: Exercise[] = [
  {
    id: 'car-rental',
    title: 'Car Rental',
    difficulty: 1,
    concepts: ['lookup entity', 'history with own id', 'optional attribute'],
    spec: [
      'A car rental company has several branches, each with an address and a phone. Every car belongs to one branch and has a plate number, a model and the number of kilometres on the clock.',
      'Cars are grouped into categories (economy, family, van…); the daily price depends only on the category.',
      'Customers rent cars: a rental is for one customer and one car, starts on a pick-up date and ends on a return date, which stays empty until the car is back. The same customer may rent the same car again later.',
      'For each customer we keep the driving licence number, which is unique, the name and the email.',
    ],
    checklist: [
      'Is the daily price stored once (in the category) and not in every car?',
      'Does a rental have its own identifier? Why can (customer, car) not be its key?',
      'Is the return date optional?',
      'Is the plate number an identifier (primary or alternate) of Car?',
      'Is the licence number unique — as primary or alternate identifier?',
      'Open the Physical view: does RENTAL have FKs to CUSTOMER and CAR, and CAR one to BRANCH?',
    ],
  },
  {
    id: 'gym',
    title: 'Gym',
    difficulty: 1,
    concepts: ['many-to-many with and without data', 'alternate identifier'],
    spec: [
      'A gym has members, identified by a member number, with a name, an email (unique) and a join date.',
      'The gym offers classes (yoga, spinning, boxing…). Each class has a name, a level and a duration, and is taught by one or more trainers; a trainer can teach several classes. For trainers we keep the name and the phone.',
      'Members sign up for classes. For each sign-up we keep the date it was made; a member can sign up for the same class only once.',
    ],
    checklist: [
      'Class — Trainer: is it a plain many-to-many (no data on the pair)?',
      'Member — Class: where does the sign-up date go? Did the pair become an entity?',
      'Does the sign-up entity have its own id? Should it, if a member signs up only once per class?',
      'Is the email an alternate identifier of Member?',
      'In the Sandbox, try to sign up the same member for the same class twice — which key rejects it?',
    ],
  },
  {
    id: 'cinema',
    title: 'Cinema',
    difficulty: 2,
    concepts: ['dependent entity numbered in its parent', 'composite foreign key', 'rule as a key over migrated columns'],
    spec: [
      'A cinema has several halls, each with a name. Seats are identified inside each hall by a row letter and a seat number (row F, seat 12); some seats are marked as accessible.',
      'Films have a title, a duration and an age rating. A screening shows one film in one hall at a date and time; a film has many screenings.',
      'Customers buy tickets: a ticket is for one screening and one seat, with the price paid. A seat can be sold only once per screening.',
    ],
    checklist: [
      'Is Seat dependent on Hall, with (row, number) as its own part of the key?',
      'What does the FK from TICKET to SEAT look like in the Physical view (how many columns)?',
      'Does Ticket need its own id, or is (screening, seat) enough? What does “sold only once per screening” suggest?',
      'Is the price stored on the ticket (price paid), and why not read from the film?',
      'Could two screenings use the same hall at the same time? Which rule would prevent it, and can a key express it?',
    ],
  },
  {
    id: 'conference',
    title: 'Conference',
    difficulty: 2,
    concepts: ['inheritance', 'reflexive or role-named relationships', 'many-to-many with data'],
    spec: [
      'A scientific conference stores people: authors, reviewers and organisers. Everyone has a name, an email (unique) and an institution; the same person can be an author and a reviewer at the same time.',
      'Papers have a title and an abstract and are written by one or more authors, in a given author order (first author, second author…).',
      'Each paper is reviewed by three reviewers; a review has a score from 1 to 5 and a comment. A reviewer can never review a paper they wrote.',
      'Papers are presented in sessions. A session has a room and a start time and is chaired by one organiser; each accepted paper is presented in exactly one session.',
    ],
    checklist: [
      'Inheritance Person → Author, Reviewer, Organiser: exclusive or not? complete or not?',
      'Where does the author order go? Is Paper — Author still a plain many-to-many?',
      'Is Review an intermediate entity between Reviewer and Paper? Does it need an own id?',
      'How is “a score from 1 to 5” enforced — CHECK, lookup, or nothing?',
      'Which rules stay outside the diagram (three reviewers, not reviewing your own paper)?',
      'Is “accepted” stored, or is it known from the paper having a session?',
    ],
  },
  {
    id: 'airline',
    title: 'Airline',
    difficulty: 3,
    concepts: ['two links to the same entity (roles)', 'scheduled vs actual (history)', 'dependent entities', 'rules as keys'],
    spec: [
      'An airline flies between airports. An airport has a three-letter code (LIS, OPO…), a name and a city. A route goes from one airport to another; the flight number (TP1234) identifies a route and the scheduled departure time.',
      'Each route is flown on many dates. A flight on a date has a status (scheduled, boarding, departed, cancelled), the actual departure time once known, and is operated by one aircraft. Aircraft have a registration (CS-TUA), a model and a number of seats.',
      'Crew members are pilots or cabin staff; pilots have a licence, cabin staff speak several languages. Each dated flight has a crew: one captain, one first officer and several cabin staff.',
      'Passengers book seats on dated flights. A seat number (14C) can be booked only once per dated flight, and a passenger cannot hold two seats on the same flight.',
    ],
    checklist: [
      'Route — Airport: two relationships (from / to) with roles? What are the FK columns called?',
      'Is the dated flight dependent on the route (route + date as key), or does it have its own id? What changes in the tables?',
      'Captain and first officer: two relationships with roles, or one crew assignment entity with a role attribute? What can each version enforce?',
      'Cabin staff languages: a many-to-many to a Language entity, or a text attribute? Why?',
      'Which two booking rules become UNIQUE keys, and over which columns?',
      'Is the actual departure time optional? Is the status a CHECK list?',
    ],
  },
]

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id)
}

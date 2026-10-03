// "Try this" scenarios for the SQL sandbox: a valid insert, then the conflicting one, so the
// student sees which key rejects it. Each scenario starts on an empty database.
// tests/sandbox.test.ts runs every step against the generated schema and checks `expect`.

export interface ScenarioStep {
  title: string
  /** What the step shows; displayed after it ran. */
  why: string
  sql: string
  /** 'ok', or what must reject it: a constraint name of the PDM or `NOT NULL TABLE.column`. */
  expect: 'ok' | { rejectedBy: string }
}

export interface Scenario {
  id: string
  /** Name of the reference model the scenario is written for. */
  model: string
  title: string
  intro: string
  steps: ScenarioStep[]
}

export const SCENARIOS: Scenario[] = [
  // ------------------------------------------------------------------ TV Shows
  {
    id: 'tv-director',
    model: 'TV Shows',
    title: 'An episode is directed by a director of its show',
    intro: 'Episode references ShowDirector (show_id, person_id), not Director. One shared show_id column makes the database check that the director really directs this show.',
    steps: [
      {
        title: 'Setup: two shows, one director of “Dark”',
        why: 'Parents first: PERSON → DIRECTOR (inheritance child) → SHOWDIRECTOR (intermediate entity).',
        sql: `INSERT INTO TVSHOW (show_id, title) VALUES (1, 'Dark'), (2, 'Lost');
INSERT INTO PERSON (person_id, name) VALUES (10, 'Baran bo Odar'), (11, 'Jantje Friese');
INSERT INTO DIRECTOR (person_id) VALUES (10);
INSERT INTO SHOWDIRECTOR (show_id, person_id) VALUES (1, 10);`,
        expect: 'ok',
      },
      {
        title: 'Episode of Dark directed by its director',
        why: '(show_id, person_id) = (1, 10) exists in SHOWDIRECTOR, so both foreign keys are satisfied.',
        sql: `INSERT INTO EPISODE (episode_id, title, show_id, person_id) VALUES (100, 'Secrets', 1, 10);`,
        expect: 'ok',
      },
      {
        title: 'Episode of Lost “directed” by the director of Dark',
        why: 'Person 10 directs show 1, not show 2. Linking Episode to Director directly would have accepted this row.',
        sql: `INSERT INTO EPISODE (episode_id, title, show_id, person_id) VALUES (101, 'Pilot', 2, 10);`,
        expect: { rejectedBy: 'FK_EPISODE_DIRECTS_EPISODE_SHOWDIRECTOR' },
      },
      {
        title: 'A person who is not a director directs a show',
        why: 'Person 11 has no DIRECTOR row. Inheritance generation “both”: the child table holds who is a director.',
        sql: `INSERT INTO SHOWDIRECTOR (show_id, person_id) VALUES (2, 11);`,
        expect: { rejectedBy: 'FK_SHOWDIRECTOR_DIRECTOR_SHOWS_DIRECTOR' },
      },
      {
        title: 'Episode without a director',
        why: 'The cardinality Episode → ShowDirector is 1,1, so person_id is NOT NULL.',
        sql: `INSERT INTO EPISODE (episode_id, title, show_id) VALUES (102, 'Origins', 1);`,
        expect: { rejectedBy: 'NOT NULL EPISODE.person_id' },
      },
    ],
  },
  {
    id: 'tv-role',
    model: 'TV Shows',
    title: 'One role per actor per scene',
    intro: 'Scene is dependent on Episode, and Role is identified by Actor + Scene. Watch the migrated key columns do the work.',
    steps: [
      {
        title: 'Setup: show, director, episode 100, actor 20',
        why: 'Everything Role needs to point at.',
        sql: `INSERT INTO TVSHOW (show_id, title) VALUES (1, 'Dark');
INSERT INTO PERSON (person_id, name) VALUES (10, 'Baran bo Odar'), (20, 'Louis Hofmann');
INSERT INTO DIRECTOR (person_id) VALUES (10);
INSERT INTO SHOWDIRECTOR (show_id, person_id) VALUES (1, 10);
INSERT INTO EPISODE (episode_id, title, show_id, person_id) VALUES (100, 'Secrets', 1, 10);
INSERT INTO ACTOR (person_id) VALUES (20);`,
        expect: 'ok',
      },
      {
        title: 'Scene 1 and scene 2 of episode 100',
        why: 'SCENE PK = (episode_id, order_no): order numbers restart in every episode.',
        sql: `INSERT INTO SCENE (episode_id, order_no) VALUES (100, 1), (100, 2);`,
        expect: 'ok',
      },
      {
        title: 'A scene of an episode that does not exist',
        why: 'Scene is dependent on Episode: episode_id is part of its key and must reference an existing episode.',
        sql: `INSERT INTO SCENE (episode_id, order_no) VALUES (999, 1);`,
        expect: { rejectedBy: 'FK_SCENE_HAS_SCENES_EPISODE' },
      },
      {
        title: 'Actor 20 plays Jonas in scene (100, 1)',
        why: 'ROLE PK = (person_id, episode_id, order_no): the actor plus the scene.',
        sql: `INSERT INTO ROLE (person_id, episode_id, order_no, role_name) VALUES (20, 100, 1, 'Jonas');`,
        expect: 'ok',
      },
      {
        title: 'Same actor, same scene, a second role',
        why: 'The key allows one ROLE row per actor and scene. If an actor could play two characters in one scene, Role would need its own number in the key.',
        sql: `INSERT INTO ROLE (person_id, episode_id, order_no, role_name) VALUES (20, 100, 1, 'Mikkel');`,
        expect: { rejectedBy: 'PK_ROLE' },
      },
      {
        title: 'Same actor in scene 2 — fine',
        why: 'A different scene is a different key value.',
        sql: `INSERT INTO ROLE (person_id, episode_id, order_no, role_name) VALUES (20, 100, 2, 'Jonas');`,
        expect: 'ok',
      },
    ],
  },

  // ------------------------------------------------------------------ Timetables
  {
    id: 'tt-clash',
    model: 'Timetables',
    title: 'No room, professor or course shift in two places at once',
    intro: 'Time is cut into 30-minute slots, so “no overlap” becomes three UNIQUE keys on CLASSSLOT — over columns that arrived there by migration.',
    steps: [
      {
        title: 'Setup: course, professors, rooms, shifts, period, slots',
        why: 'Course 1 is assigned to professors 1 and 2 in 2026/27; course 2 has no assignment.',
        sql: `INSERT INTO COURSE (course_id, ects) VALUES (1, 6), (2, 6);
INSERT INTO PROFESSOR (professor_id, name) VALUES (1, 'Ana'), (2, 'Rui');
INSERT INTO ACADEMICYEAR (year_id) VALUES ('2026/27');
INSERT INTO TEACHINGASSIGNMENT (course_id, professor_id, year_id) VALUES (1, 1, '2026/27'), (1, 2, '2026/27');
INSERT INTO ROOM (room_id, name) VALUES (1, 'Room 1'), (2, 'Room 2');
INSERT INTO SHIFT (shift_code) VALUES ('T1'), ('T2');
INSERT INTO PERIOD (period_id, start_date, end_date) VALUES (1, '2026-09-14', '2026-12-18');
INSERT INTO SLOT (slot_id, start_time) VALUES (1, '09:00'), (2, '09:30');`,
        expect: 'ok',
      },
      {
        title: 'Ana teaches T1 in Room 1 on Monday, 09:00–10:00',
        why: 'One CLASS row and one CLASSSLOT row per 30-minute slot.',
        sql: `INSERT INTO CLASS (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday) VALUES (1, 1, '2026/27', 1, 'T1', 1, 1);
INSERT INTO CLASSSLOT (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday, slot_id) VALUES
  (1, 1, '2026/27', 1, 'T1', 1, 1, 1),
  (1, 1, '2026/27', 1, 'T1', 1, 1, 2);`,
        expect: 'ok',
      },
      {
        title: 'Rui wants Room 1 at Monday 09:30',
        why: 'Room 1 is already taken in period 1, weekday 1, slot 2.',
        sql: `INSERT INTO CLASS (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday) VALUES (1, 2, '2026/27', 1, 'T2', 1, 1);
INSERT INTO CLASSSLOT (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday, slot_id) VALUES (1, 2, '2026/27', 1, 'T2', 1, 1, 2);`,
        expect: { rejectedBy: 'AK_ROOM_TIME' },
      },
      {
        title: 'Ana in Room 2 at the same time',
        why: 'Room 2 is free, but Ana is already teaching in slot 2.',
        sql: `INSERT INTO CLASS (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday) VALUES (1, 1, '2026/27', 2, 'T2', 1, 1);
INSERT INTO CLASSSLOT (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday, slot_id) VALUES (1, 1, '2026/27', 2, 'T2', 1, 1, 2);`,
        expect: { rejectedBy: 'AK_PROFESSOR_TIME' },
      },
      {
        title: 'Rui teaches shift T1 of the same course in Room 2, same time',
        why: 'Room and professor are free, but students of course 1, shift T1 are already in Room 1.',
        sql: `INSERT INTO CLASS (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday) VALUES (1, 2, '2026/27', 2, 'T1', 1, 1);
INSERT INTO CLASSSLOT (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday, slot_id) VALUES (1, 2, '2026/27', 2, 'T1', 1, 1, 2);`,
        expect: { rejectedBy: 'AK_COURSE_SHIFT_TIME' },
      },
      {
        title: 'A class of a course nobody is assigned to teach',
        why: 'Class depends on TeachingAssignment: (course, professor, year) must be an existing assignment.',
        sql: `INSERT INTO CLASS (course_id, professor_id, year_id, room_id, shift_code, period_id, weekday) VALUES (2, 1, '2026/27', 2, 'T1', 1, 3);`,
        expect: { rejectedBy: 'FK_CLASS_TAUGHT_IN_TEACHINGASSIGNMENT' },
      },
    ],
  },

  // ------------------------------------------------------------------ Ride Hailing
  {
    id: 'rh-trip',
    model: 'Ride Hailing',
    title: 'Trips, shifts and one rating per trip',
    intro: 'A trip references the CarShift (driver + car at that time). Ratings are dependent on Trip with a 1:1 key.',
    steps: [
      {
        title: 'Setup: rider, driver, car, shift, finished trip',
        why: 'CAR_SHIFT tells both the driver and the car of the trip.',
        sql: `INSERT INTO RIDER (rider_id, name, phone, created_at) VALUES (1, 'Maria', '+351900000001', '2026-09-01 10:00');
INSERT INTO DRIVER (driver_id, name, phone, license_no) VALUES (1, 'João', '+351900000002', 'L-001');
INSERT INTO CAR (car_id, plate) VALUES (1, 'AA-11-BB');
INSERT INTO CAR_SHIFT (shift_id, start_time, driver_id, car_id) VALUES (1, '2026-10-01 08:00', 1, 1);
INSERT INTO TRIP (trip_id, status, requested_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, rider_id, shift_id)
VALUES (1, 'Finished', '2026-10-01 09:00', 38.7369, -9.1427, 38.7223, -9.1393, 1, 1);`,
        expect: 'ok',
      },
      {
        title: 'Second driver with the same licence number',
        why: 'license_no is an alternate identifier of Driver → UNIQUE.',
        sql: `INSERT INTO DRIVER (driver_id, name, phone, license_no) VALUES (2, 'Pedro', '+351900000003', 'L-001');`,
        expect: { rejectedBy: 'AK_LICENSE_NO_DRIVER' },
      },
      {
        title: 'Requested trip, no driver yet',
        why: 'Trip → CarShift is 0,1: shift_id may stay NULL until a driver accepts.',
        sql: `INSERT INTO TRIP (trip_id, status, requested_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, rider_id)
VALUES (2, 'Requested', '2026-10-01 11:00', 38.7369, -9.1427, 38.7071, -9.1355, 1);`,
        expect: 'ok',
      },
      {
        title: 'Trip without a rider',
        why: 'Trip → Rider is 1,1: every trip is requested by someone.',
        sql: `INSERT INTO TRIP (trip_id, status, requested_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
VALUES (3, 'Requested', '2026-10-01 12:00', 38.7369, -9.1427, 38.7071, -9.1355);`,
        expect: { rejectedBy: 'NOT NULL TRIP.rider_id' },
      },
      {
        title: 'The rider rates the driver of trip 1',
        why: 'DRIVER_RATING PK = trip_id, migrated from TRIP.',
        sql: `INSERT INTO DRIVER_RATING (trip_id, score, rated_at) VALUES (1, 5, '2026-10-01 09:40');`,
        expect: 'ok',
      },
      {
        title: 'A second rating for the same trip',
        why: 'The key is only trip_id, so a trip has at most one driver rating.',
        sql: `INSERT INTO DRIVER_RATING (trip_id, score, rated_at) VALUES (1, 4, '2026-10-01 09:45');`,
        expect: { rejectedBy: 'PK_DRIVER_RATING' },
      },
      {
        title: 'Seven stars out of five',
        why: 'Accepted! Nothing in the model limits score. A CHECK (score BETWEEN 1 AND 5) is a business rule you still have to add.',
        sql: `INSERT INTO RIDER_RATING (trip_id, score, rated_at) VALUES (1, 7, '2026-10-01 09:41');`,
        expect: 'ok',
      },
      {
        title: 'Average rating per driver — computed, not stored',
        why: 'The average comes from the ratings history through TRIP → CAR_SHIFT.',
        sql: `SELECT s.driver_id, AVG(r.score) AS avg_score, COUNT(*) AS ratings
FROM DRIVER_RATING r
JOIN TRIP t ON t.trip_id = r.trip_id
JOIN CAR_SHIFT s ON s.shift_id = t.shift_id
GROUP BY s.driver_id;`,
        expect: 'ok',
      },
    ],
  },

  // ------------------------------------------------------------------ own cases
  {
    id: 'library-keys',
    model: 'Library',
    title: 'ISBN is unique, and a member may borrow the same book twice',
    intro: 'book_id is the primary key and isbn an alternate one (UNIQUE). LOAN has its own id, so the same (member, book) pair can repeat.',
    steps: [
      {
        title: 'Setup: a publisher, a book, a member',
        why: 'Parents first: BOOK needs its PUBLISHER.',
        sql: `INSERT INTO PUBLISHER (publisher_id, name) VALUES (1, 'Penguin');
INSERT INTO BOOK (book_id, publisher_id, isbn, title) VALUES (10, 1, '9780141439518', 'Pride and Prejudice');
INSERT INTO MEMBER (card_no, name, email) VALUES (7, 'Ana', 'ana@example.com');`,
        expect: 'ok',
      },
      {
        title: 'A second book with the same ISBN',
        why: 'isbn is an alternate identifier → UNIQUE in BOOK.',
        sql: `INSERT INTO BOOK (book_id, publisher_id, isbn, title) VALUES (11, 1, '9780141439518', 'Copy');`,
        expect: { rejectedBy: 'AK_ISBN_BOOK' },
      },
      {
        title: 'Ana borrows the book twice, a month apart',
        why: 'Two LOAN rows for the same pair: possible because loan_id, not (card_no, book_id), is the key.',
        sql: `INSERT INTO LOAN (loan_id, card_no, book_id, loan_date, due_date) VALUES (1, 7, 10, '2026-01-05', '2026-01-19'), (2, 7, 10, '2026-02-10', '2026-02-24');`,
        expect: 'ok',
      },
      {
        title: 'A loan of a book that does not exist',
        why: 'book_id in LOAN is a foreign key to BOOK.',
        sql: `INSERT INTO LOAN (loan_id, card_no, book_id, loan_date, due_date) VALUES (3, 7, 99, '2026-03-01', '2026-03-15');`,
        expect: { rejectedBy: 'FK_LOAN_IS_LENT_BOOK' },
      },
    ],
  },
  {
    id: 'hotel-booked-room',
    model: 'Hotel',
    title: 'A room is listed once per booking',
    intro: 'BOOKED_ROOM has no own id: its key is (booking_id, room_no), so the same room cannot appear twice in one booking — but it can in other bookings.',
    steps: [
      {
        title: 'Setup: a room type, two rooms, a guest and a booking',
        why: 'ROOM needs its ROOM_TYPE; BOOKING needs its GUEST.',
        sql: `INSERT INTO ROOM_TYPE (type_name, nightly_price, max_guests) VALUES ('double', 90.00, 2);
INSERT INTO ROOM (room_no, type_name, floor) VALUES (101, 'double', 1), (102, 'double', 1);
INSERT INTO GUEST (guest_no, name, passport_no) VALUES (1, 'Rui', 'P123');
INSERT INTO BOOKING (booking_id, guest_no, arrival_date, departure_date, booked_on) VALUES (500, 1, '2026-07-01', '2026-07-05', '2026-03-01');`,
        expect: 'ok',
      },
      {
        title: 'The family takes two rooms in one booking',
        why: 'Two rows with different rooms: two different keys.',
        sql: `INSERT INTO BOOKED_ROOM (booking_id, room_no, guests) VALUES (500, 101, 2), (500, 102, 1);`,
        expect: 'ok',
      },
      {
        title: 'Room 101 listed again in the same booking',
        why: '(500, 101) already exists → the primary key rejects it.',
        sql: `INSERT INTO BOOKED_ROOM (booking_id, room_no, guests) VALUES (500, 101, 1);`,
        expect: { rejectedBy: 'PK_BOOKED_ROOM' },
      },
      {
        title: 'A room of a type that does not exist',
        why: 'The price lives in ROOM_TYPE, so every room must point at a real type.',
        sql: `INSERT INTO ROOM (room_no, type_name, floor) VALUES (201, 'penthouse', 2);`,
        expect: { rejectedBy: 'FK_ROOM_IS_OF_TYPE_ROOM_TYPE' },
      },
    ],
  },
  {
    id: 'shop-lines',
    model: 'Online Shop',
    title: 'Order lines, the category tree and one payment per order',
    intro: 'ORDER_LINE is identified by (order_no, line_no); CATEGORY points at its parent; PAYMENT.order_no is UNIQUE (one-to-one).',
    steps: [
      {
        title: 'Setup: categories as a tree, a product, a customer and an order',
        why: 'Phones has Electronics as its parent: the reflexive FK parent_category_id.',
        sql: `INSERT INTO CATEGORY (category_id, name) VALUES (1, 'Electronics');
INSERT INTO CATEGORY (category_id, parent_category_id, name) VALUES (2, 1, 'Phones');
INSERT INTO PRODUCT (product_id, category_id, sku, name, price, stock) VALUES (10, 2, 'PH-1', 'Phone One', 299.00, 5);
INSERT INTO CUSTOMER (customer_no, name, email) VALUES (1, 'Inês', 'ines@example.com');
INSERT INTO CUSTOMER_ORDER (order_no, customer_no, order_date) VALUES (100, 1, '2026-05-02');`,
        expect: 'ok',
      },
      {
        title: 'A subcategory of a category that does not exist',
        why: 'parent_category_id is a foreign key to CATEGORY itself.',
        sql: `INSERT INTO CATEGORY (category_id, parent_category_id, name) VALUES (3, 99, 'Tablets');`,
        expect: { rejectedBy: 'FK_CATEGORY_PARENT_CATEGORY' },
      },
      {
        title: 'Lines 1 and 2 of order 100',
        why: 'The line number is unique only inside its order.',
        sql: `INSERT INTO ORDER_LINE (order_no, line_no, product_id, quantity, unit_price) VALUES (100, 1, 10, 1, 299.00), (100, 2, 10, 1, 279.00);`,
        expect: 'ok',
      },
      {
        title: 'Line 1 of order 100 again',
        why: '(order_no, line_no) is the primary key of ORDER_LINE.',
        sql: `INSERT INTO ORDER_LINE (order_no, line_no, product_id, quantity, unit_price) VALUES (100, 1, 10, 3, 299.00);`,
        expect: { rejectedBy: 'PK_ORDER_LINE' },
      },
      {
        title: 'The order is paid',
        why: 'The FK to the order sits in PAYMENT.',
        sql: `INSERT INTO PAYMENT (payment_id, order_no, paid_on, method, amount) VALUES (1, 100, '2026-05-02', 'card', 578.00);`,
        expect: 'ok',
      },
      {
        title: 'A second payment for the same order',
        why: 'One-to-one: the FK column order_no is also UNIQUE.',
        sql: `INSERT INTO PAYMENT (payment_id, order_no, paid_on, method, amount) VALUES (2, 100, '2026-05-03', 'paypal', 578.00);`,
        expect: { rejectedBy: 'AK_PAID_BY_PAYMENT' },
      },
      {
        title: 'Order total, computed from the lines',
        why: 'Derived data is a query, not a column.',
        sql: `SELECT order_no, SUM(quantity * unit_price) AS total FROM ORDER_LINE GROUP BY order_no;`,
        expect: 'ok',
      },
    ],
  },
  {
    id: 'hospital-roles',
    model: 'Hospital',
    title: 'Only a nurse can be responsible; beds are numbered per ward',
    intro: 'ADMISSION references NURSE (a child of STAFF_MEMBER), and BED is identified by (ward_id, bed_no).',
    steps: [
      {
        title: 'Setup: a doctor, a nurse, a patient, two wards with a bed 1 each',
        why: 'Inheritance generation “both”: a staff row plus a DOCTOR or NURSE row. Bed 1 exists in both wards.',
        sql: `INSERT INTO STAFF_MEMBER (employee_no, name, hire_date) VALUES (1, 'Dr. Costa', '2020-01-01'), (2, 'Nurse Lima', '2021-01-01');
INSERT INTO DOCTOR (employee_no, licence_no) VALUES (1, 'OM-555');
INSERT INTO NURSE (employee_no, grade) VALUES (2, 'senior');
INSERT INTO PATIENT (health_no, name, birth_date) VALUES (900, 'Tiago', '1980-04-02');
INSERT INTO WARD (ward_id, name, floor) VALUES (1, 'A', 2), (2, 'B', 3);
INSERT INTO BED (ward_id, bed_no) VALUES (1, 1), (2, 1);`,
        expect: 'ok',
      },
      {
        title: 'Admission with nurse 2 in bed 1 of ward A',
        why: 'The FK to BED takes both columns (ward_id, bed_no).',
        sql: `INSERT INTO ADMISSION (admission_id, health_no, ward_id, bed_no, employee_no, admitted_on) VALUES (1, 900, 1, 1, 2, '2026-04-01');`,
        expect: 'ok',
      },
      {
        title: 'The doctor as the responsible nurse',
        why: 'Employee 1 has no NURSE row: linking Admission to Nurse (not Staff Member) makes the database check it.',
        sql: `INSERT INTO ADMISSION (admission_id, health_no, ward_id, bed_no, employee_no, admitted_on) VALUES (2, 900, 2, 1, 1, '2026-06-01');`,
        expect: { rejectedBy: 'FK_ADMISSION_RESPONSIBLE_FOR_NURSE' },
      },
      {
        title: 'Bed 2 of ward A, which does not exist',
        why: '(1, 2) is not a row of BED.',
        sql: `INSERT INTO ADMISSION (admission_id, health_no, ward_id, bed_no, employee_no, admitted_on) VALUES (3, 900, 1, 2, 2, '2026-06-01');`,
        expect: { rejectedBy: 'FK_ADMISSION_OCCUPIED_BY_BED' },
      },
      {
        title: 'Two doctors with the same licence',
        why: 'licence_no is an alternate identifier of Doctor → UNIQUE in DOCTOR.',
        sql: `INSERT INTO STAFF_MEMBER (employee_no, name, hire_date) VALUES (3, 'Dr. Reis', '2022-01-01');
INSERT INTO DOCTOR (employee_no, licence_no) VALUES (3, 'OM-555');`,
        expect: { rejectedBy: 'AK_LICENCE_NO_DOCTOR' },
      },
    ],
  },
  {
    id: 'football-pairing',
    model: 'Football League',
    title: 'Home and away teams, and one pairing per season',
    intro: 'MATCH has two FKs to TEAM (roles home / away) and a UNIQUE key (start_year, home_team_id, away_team_id).',
    steps: [
      {
        title: 'Setup: a season and two teams',
        why: 'Parents of MATCH.',
        sql: `INSERT INTO SEASON (start_year) VALUES (2025);
INSERT INTO TEAM (team_id, name, city) VALUES (1, 'Benfica', 'Lisboa'), (2, 'Porto', 'Porto');`,
        expect: 'ok',
      },
      {
        title: 'Benfica at home to Porto, and the return match',
        why: 'The same two teams with home and away swapped: a different pairing.',
        sql: `INSERT INTO MATCH (match_id, start_year, home_team_id, away_team_id, match_date) VALUES (1, 2025, 1, 2, '2025-09-14'), (2, 2025, 2, 1, '2026-02-08');`,
        expect: 'ok',
      },
      {
        title: 'Benfica at home to Porto again in the same season',
        why: 'The pairing rule became a key over migrated columns.',
        sql: `INSERT INTO MATCH (match_id, start_year, home_team_id, away_team_id, match_date) VALUES (3, 2025, 1, 2, '2026-04-20');`,
        expect: { rejectedBy: 'AK_MATCH_PAIRING' },
      },
      {
        title: 'A team playing against itself',
        why: 'No key can say “two columns differ”: this rule needs a CHECK (home_team_id <> away_team_id), which the CDM does not draw. The row goes in.',
        sql: `INSERT INTO MATCH (match_id, start_year, home_team_id, away_team_id, match_date) VALUES (4, 2025, 1, 1, '2026-05-01');`,
        expect: 'ok',
      },
      {
        title: 'Goals per match, counted from GOAL',
        why: 'The score is derived data: a query, not a column.',
        sql: `SELECT m.match_id, COUNT(g.goal_no) AS goals FROM MATCH m LEFT JOIN GOAL g ON g.match_id = m.match_id GROUP BY m.match_id;`,
        expect: 'ok',
      },
    ],
  },
]

export function scenariosFor(modelName: string): Scenario[] {
  return SCENARIOS.filter((s) => s.model === modelName)
}

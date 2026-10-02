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
]

export function scenariosFor(modelName: string): Scenario[] {
  return SCENARIOS.filter((s) => s.model === modelName)
}

# Case: Ride Hailing (Shadow Project, Part I)

## 1. Meta
- id: `ride-hailing`
- source: NOVA IMS DBMS 2026/27, Shadow Project – Part I; Class 03 slides 17–18
- difficulty: ★★★ (open-ended — group project)
- concepts: M:N with time intervals (history), dependent entity with order, status lifecycle, ratings in both directions, position history, derived data, model vs business rules

> Deliverables Part I: `.cdm` + `.pdm` (SQL Server) from PowerDesigner, generated `.sql`, `.txt` with group members. The spec is intentionally incomplete — inventing missing attributes/entities is part of the grade.
> The reference model below follows the existing `ride_hailing_visual.html` study (10 tables) plus open points to discuss in the group.

## 2. Specification (verbatim, condensed)

The database must store:
- Trip requests (made by riders) and assignments (to drivers/cars).
- Cars, drove by drivers. A car can be shared by several drivers, and a driver can drive several cars in different time intervals.
- Ratings between riders and drivers.

Actors:
- Riders request trips by providing pickup and drop-off locations and in some cases stop-over locations; riders rate drivers after trips.
- Drivers offer rides using registered vehicles; accept or decline trip requests that have been assigned to them (based on location); drivers rate riders after trips.

Workflows:
- **Trip Request & Assignment:** rider requests a trip; system searches nearby available drivers/cars — needs positions of riders and drivers/cars, and must compute drivers' and riders' rating averages from the ratings history; one driver accepts → status "Requested" → "Accepted".
- **Trip Execution:** pick-up → "Ongoing"; completion → "Finished".
- **Feedback & Ratings:** both rider and driver can rate each other.

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "riders", "drivers" | Entities `Rider`, `Driver` (option: inheritance from `Person`/`User`) |
| "car can be shared by several drivers … driver can drive several cars **in different time intervals**" | M:N with time → intermediate entity `CarShift` (driver, car, start_time, end_time) **with own id** (same pair repeats over time) |
| "trip requests made by riders" | `Rider` 1 — N `Trip` |
| "assignments (to drivers/cars)" | `Trip` N — 0..1 `CarShift` (nullable until accepted) — gives driver **and** car at once |
| "accept or **decline** trip requests assigned to them" | (open) `TripOffer` history: trip × driver, offered_at, response |
| "pickup and drop-off locations" | attributes of Trip (lat/lng/address) |
| "**in some cases** stop-over locations" | optional, many → dependent entity `TripStop` (trip_id, stop_order) |
| "status changes Requested → Accepted → Ongoing → Finished" | Trip.status (+ timestamps per stage); lookup `TripStatus` or CHECK |
| "positions of riders and drivers/cars" | history entities `RiderPosition`, `DriverPosition` (who, recorded_at, lat, lng) |
| "calculate … rating average from the ratings history" | **don't store the average** — store each rating; compute AVG in a query |
| "riders rate drivers", "drivers rate riders" | `DriverRating`, `RiderRating`, each 1:1 with Trip |

## 4. Reference CDM

| Entity | Attributes (PI) | Notes |
|---|---|---|
| Rider | **rider_id**, name, phone, email, created_at | |
| Driver | **driver_id**, name, phone, email, license_no (AK) | |
| Car | **car_id**, plate (AK), make, model, color, seats | |
| CarShift | **shift_id**, start_time, end_time (nullable = still driving) | → Driver, → Car |
| Trip | **trip_id**, status, requested_at, accepted_at, started_at, finished_at, pickup_lat/lng/address, dropoff_lat/lng/address, price | → Rider (1,1), → CarShift (0,1) |
| TripStop | **stop_order**, lat, lng, address | dependent on Trip |
| DriverRating | score (1–5), comment, rated_at | rider rates driver; dependent on Trip, 1:1 |
| RiderRating | score (1–5), comment, rated_at | driver rates rider; dependent on Trip, 1:1 |
| DriverPosition | **recorded_at**, lat, lng | dependent on Driver (or CarShift) |
| RiderPosition | **recorded_at**, lat, lng | dependent on Rider |

### Relationships
| A | card. A | B | card. B | Dependent |
|---|---|---|---|---|
| Driver | 1,1 | CarShift | 0,n | — |
| Car | 1,1 | CarShift | 0,n | — |
| Rider | 1,1 | Trip | 0,n | — |
| CarShift | 0,1 | Trip | 0,n | — (nullable FK while "Requested") |
| Trip | 1,1 | TripStop | 0,n | yes |
| Trip | 1,1 | DriverRating | 0,1 | yes (1:1) |
| Trip | 1,1 | RiderRating | 0,1 | yes (1:1) |
| Driver | 1,1 | DriverPosition | 0,n | yes |
| Rider | 1,1 | RiderPosition | 0,n | yes |

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| RIDER | rider_id | |
| DRIVER | driver_id | AK license_no |
| CAR | car_id | AK plate |
| CAR_SHIFT | shift_id | driver_id, car_id |
| TRIP | trip_id | rider_id NOT NULL, shift_id NULL |
| TRIP_STOP | trip_id, stop_order | trip_id |
| DRIVER_RATING | trip_id | trip_id → TRIP (at most one per trip) |
| RIDER_RATING | trip_id | trip_id → TRIP |
| DRIVER_POSITION | driver_id, recorded_at | |
| RIDER_POSITION | rider_id, recorded_at | |

Rating average: `SELECT s.driver_id, AVG(r.score) FROM DRIVER_RATING r JOIN TRIP t ON … JOIN CAR_SHIFT s ON … GROUP BY s.driver_id`.

## 6. Key decisions & lessons

1. **CarShift instead of a plain Driver–Car join table.** "Different time intervals" = the same pair can repeat → own id + start/end. And Trip pointing to a CarShift answers "which driver, in which car" with one FK.
2. **Nullable FK as lifecycle.** While status = Requested there is no shift yet → `shift_id NULL`. Accepted/Ongoing/Finished fill it and the timestamps.
3. **Ratings as two dependent 1:1 entities.** PK = trip_id → at most one rating per direction per trip, and the rated person is derived via the trip (no redundant rider_id/driver_id).
   *Alternative:* one `Rating` table with `direction` column — simpler, but harder to constrain.
4. **Store history, compute aggregates.** The spec literally says "from the ratings history" → no `avg_rating` column.
5. **TripStop dependent with order.** "In some cases" → 0..n, kept in a separate table, not `stop1`, `stop2` columns.

## 7. Open points for the group
- **Decline history:** the spec says drivers "accept or decline requests assigned to them". The 10-table model only stores the final assignment. Add `TripOffer` (trip_id, driver_id/shift_id, offered_at, response, responded_at) if you want to keep declines.
- Person inheritance: can the same human be both rider and driver? If yes → `Person` parent with `Rider`/`Driver` children.
- Position of driver vs car: attach positions to Driver or to CarShift?
- Status as lookup table (`TRIP_STATUS`) vs CHECK constraint.
- Payment, price, cancellations — not required, but "enrich the model" is graded.

## 8. Rules not representable in the model (→ Part II, business rules)
- Status order: Requested → Accepted → Ongoing → Finished (no skipping/back).
- A rating can be created only when trip status = Finished, and only by the trip's own rider/driver.
- A driver can't have two overlapping CarShifts; a car can't be in two overlapping shifts.
- Assigned driver must be "nearby" at request time.
- score between 1 and 5 (this one *is* representable: CHECK).

## 9. Hints & synonyms
- "A driver drives a car *during a time interval*. Where does the interval live?"
- "Which entity tells you both the driver and the car of a trip?"
- "Should average rating be a column? What does 'from the ratings history' tell you?"
- Synonyms: CarShift ≈ DriverCar, Assignment, VehicleUsage; Trip ≈ Ride, TripRequest; TripStop ≈ Stopover, Waypoint; DriverRating ≈ RatingOfDriver.

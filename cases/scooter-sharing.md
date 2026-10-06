# Case: Scooter Sharing

## 1. Meta
- id: `scooter-sharing`
- source: own example of StrataSQL ✱ (written for the tool, not taken from a textbook)
- difficulty: ★★ (third rung, after Library and Hotel)
- concepts: intermediate entity over time (own id), optional relationship (nullable FK), dependent 1:1, dependent entity with an order, history vs derived data

> Place in the ladder: Library showed a pair that repeats (Loan); here the same idea carries a status lifecycle and more data. New after Hotel: an optional relationship, a 1:1 dependent, numbered dependents and a history entity.

## 2. Specification

An e-scooter sharing company rents scooters to riders through a phone app. For each rider it keeps a name, a phone number and an email. For each scooter it keeps a serial number, printed on the frame and never shared by two scooters, the model and the top speed.

A rider can rent many scooters over time, and the same scooter is rented by many riders — the same rider may even take the same scooter again on another day.

A rental starts with a reservation. Its status goes from "Reserved" to "Active" when the scooter is unlocked, and to "Finished" when it is parked again. The app keeps when each stage happened, where the ride started and ended, and the final price.

During a ride the rider may pause it several times, for example to stop at a shop. Each pause has a start and an end, and the pauses of a rental are numbered in order.

A rental may use a promo code. Each code gives a discount percentage and is valid until a given date; many rentals can use the same code.

After the ride the rider may rate it once, with a score from 1 to 5 and a comment. The app shows each scooter's average score, computed from those ratings.

To find nearby scooters, every scooter reports its position and battery level every few minutes, and the history of these reports is kept.

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "riders", "scooters" | Entities `Rider`, `Scooter` |
| "serial number … never shared by two scooters" | `serial_no` = alternate identifier (UNIQUE) |
| "rent many scooters over time … the same rider may even take the same scooter again" | M:N with data, pair repeats → intermediate entity `Rental` **with own id** |
| "status goes from Reserved to Active … to Finished" | `Rental.status` + a timestamp per stage (`reserved_at`, `started_at`, `finished_at`) |
| "where the ride started and ended", "final price" | attributes of Rental (empty until the ride happens) |
| "pause it several times … numbered in order" | dependent entity `Rental Pause` (rental_id, pause_no) |
| "A rental **may** use a promo code" | Promo Code 0,1 — 0,n Rental (nullable FK) |
| "rate it **once**" | `Rental Rating`, dependent 1:1 on Rental |
| "average score, computed from those ratings" | **don't store the average** — compute AVG in a query |
| "reports its position and battery level … the history is kept" | history entity `Scooter Position` (scooter_id, recorded_at) |

## 4. Reference CDM

| Entity | Attributes (PI) | Notes |
|---|---|---|
| Rider | **rider_id**, name, phone, email | |
| Scooter | **scooter_id**, serial_no (AI), model, top_speed_kmh | |
| Promo Code | **promo_code**, discount_pct, valid_until | |
| Rental | **rental_id**, status, reserved_at, started_at, finished_at, start_lat/lng, end_lat/lng, price | → Rider (1,1), → Scooter (1,1), → Promo Code (0,1) |
| Rental Pause | **pause_no**, started_at, ended_at | dependent on Rental |
| Rental Rating | score (1–5), comment, rated_at | dependent on Rental, 1:1 |
| Scooter Position | **recorded_at**, lat, lng, battery_pct | dependent on Scooter |

### Relationships
| A | card. A | B | card. B | Dependent |
|---|---|---|---|---|
| Rider | 1,1 | Rental | 0,n | — |
| Scooter | 1,1 | Rental | 0,n | — |
| Promo Code | 0,1 | Rental | 0,n | — (nullable FK) |
| Rental | 1,1 | Rental Pause | 0,n | yes |
| Rental | 1,1 | Rental Rating | 0,1 | yes (1:1) |
| Scooter | 1,1 | Scooter Position | 0,n | yes |

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| RIDER | rider_id | |
| SCOOTER | scooter_id | AK serial_no |
| PROMO_CODE | promo_code | |
| RENTAL | rental_id | → RIDER (NOT NULL), → SCOOTER (NOT NULL), → PROMO_CODE (NULL) |
| RENTAL_PAUSE | rental_id, pause_no | → RENTAL |
| RENTAL_RATING | rental_id | → RENTAL |
| SCOOTER_POSITION | scooter_id, recorded_at | → SCOOTER |

## 6. Key decisions & lessons

1. **Rental has its own id** ✱: the same rider can take the same scooter again, so (rider_id, scooter_id) cannot be the key. Compare Hotel's Booked Room, where the pair does not repeat.
2. **Optional relationship**: most rentals use no promo code, so `RENTAL.promo_code` is nullable. The promo code is identified by the code itself (the text gives it).
3. **One rating per rental**: Rental Rating is dependent 1:1 — its key is `rental_id` alone, so a second rating of the same rental is rejected.
4. **Store the history, compute the average**: no `avg_score` in Scooter; AVG over the ratings gives it.
5. **Pauses are numbered, positions are timed**: both are dependent entities; one uses a number, the other the time of the report as its own part of the key.

Sandbox scenario: *Rentals, an optional promo code and one rating per rental* (AK on serial_no, NOT NULL rider, PK of RENTAL_RATING, a score out of range that the model does not stop).

# Case: Hotel

## 1. Meta
- id: `hotel`
- source: own example of StrataSQL ✱ (written for the tool, not taken from a textbook)
- difficulty: ★ (second rung, after Library)
- concepts: lookup entity instead of a repeated value, alternate identifier, intermediate entity **without** own id, optional attribute

> Place in the ladder: Library shows an intermediate entity *with* an own id (the pair repeats). Hotel shows the opposite — the pair (booking, room) cannot repeat, so its key is the two FKs — and adds the first "entity or attribute?" decision (Room Type).

## 2. Specification

A small hotel wants a database of its rooms, its guests and their bookings.

Each room has a room number and a floor, and is of one room type: single, double or suite. For each room type the hotel keeps a nightly price and the maximum number of guests, so every room of the same type costs the same.

Guests are identified by a guest number. For each guest we keep the name, the phone and the passport number; no two guests share a passport number.

Each booking is made by one guest, and a guest can make many bookings over the years. A booking has an arrival date, a departure date and the date it was made.

One booking can include several rooms (a family may take two rooms), and the same room appears in many bookings over time. For each room of a booking we keep the number of guests staying in it. A room cannot be listed twice in the same booking.

Some bookings are cancelled; for those we keep the cancellation date, which stays empty otherwise.

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "rooms", "guests", "bookings" | Entities |
| "room type … a nightly price and the maximum number of guests" | **Room Type** is an entity (it has its own facts); `type_name` identifies it ✱ |
| "every room of the same type costs the same" | the price is stored once, in Room Type |
| "identified by a guest number" | `guest_no` = PI |
| "no two guests share a passport number" | `passport_no` = AI |
| "Each booking is made by one guest … many bookings" | Guest 1,1 — 0,n Booking |
| "One booking can include several rooms … the same room appears in many bookings" + "number of guests staying in it" | M:N **with data** → intermediate entity **Booked Room** |
| "A room cannot be listed twice in the same booking" | the pair does not repeat → **no own id**, PK = (booking_id, room_no) |
| "cancellation date, which stays empty otherwise" | `cancelled_on` optional |

## 4. Reference CDM

| Entity | Attributes (PI) | Notes |
|---|---|---|
| Room Type | **type_name**, nightly_price, max_guests | |
| Room | **room_no**, floor | → Room Type |
| Guest | **guest_no**, name, phone, passport_no (AI) | |
| Booking | **booking_id**, arrival_date, departure_date, booked_on, cancelled_on (optional) | → Guest |
| Booked Room | guests | dependent on Booking **and** Room, no own id |

### Relationships
| A | card. A | B | card. B | Dependent |
|---|---|---|---|---|
| Room Type | 1,1 | Room | 0,n | — |
| Guest | 1,1 | Booking | 0,n | — |
| Booking | 1,1 | Booked Room | 1,n | Booked Room |
| Room | 1,1 | Booked Room | 0,n | Booked Room |

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| ROOM_TYPE | type_name | |
| ROOM | room_no | → ROOM_TYPE |
| GUEST | guest_no | AK passport_no |
| BOOKING | booking_id | → GUEST |
| BOOKED_ROOM | booking_id, room_no | → BOOKING, → ROOM |

## 6. Key decisions & lessons

1. **Room Type is an entity** ✱: the price depends on the type only. Stored in every room it would repeat and could disagree. The type name identifies it (the text gives the names); an invented `type_id` would also be fine.
2. **No own id for Booked Room**: "a room cannot be listed twice in the same booking" is exactly what PK (booking_id, room_no) enforces. Compare Library's Loan, where the pair repeats.
3. **Optional instead of a flag**: an empty `cancelled_on` means "not cancelled"; no separate yes/no column that could contradict it.

Sandbox scenario: *A room is listed once per booking* (PK_BOOKED_ROOM, FK to ROOM_TYPE).

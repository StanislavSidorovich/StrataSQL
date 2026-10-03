# Case: Library (starter)

## 1. Meta
- id: `library`
- source: own example of StrataSQL ✱ — the first case of the walkthrough and the trainer
- difficulty: ★ (starter)
- concepts: entity and attributes, primary vs alternate identifier, one-to-many, plain many-to-many (join table), many-to-many with data → intermediate entity with own id, optional attribute

> Why an own case: the three course cases each mix several hard ideas (inheritance, dependency, cycles, time slots). A beginner needs one case where every step introduces exactly one idea. The four cases form a ladder: **Library** (basics) → **Ride Hailing** (dependent entities, optional FK, history) → **TV Shows** (inheritance, intermediate with/without own id, cycle) → **Timetables** (identification by context, rules as alternate keys).

## 2. Specification

A small library wants a database of its books, the people who borrow them and the loans. The library keeps one copy of each book.

Each book has an ISBN, a title and a publication year. No two books share an ISBN.

Books come from publishers: every book is published by one publisher, and a publisher can publish many books. For each publisher we keep its name and country.

Authors write books: a book can be written by several authors, and an author can write several books. For each author we keep the name and the birth year.

Members are identified by their card number. We also keep each member's name and email; no two members share an email.

A member can borrow many books, and the same book is borrowed by many members over time — the same member may even borrow the same book again later. For each loan we record the loan date, the due date and the return date, which stays empty until the book comes back.

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "books", "publishers", "authors", "members", "loans" | Entities |
| "No two books share an ISBN" | `isbn` = alternate identifier (UNIQUE); `book_id` is the primary one ✱ |
| "every book is published by one publisher, a publisher can publish many books" | Publisher 1,1 — 0,n Book → FK `publisher_id` in BOOK |
| "a book can be written by several authors, and an author can write several books" | Author 1,n — 1,n Book, **no data on the pair** → stays a relationship; the PDM makes join table WRITES |
| "identified by their card number" | `card_no` = primary identifier (given by the text) |
| "no two members share an email" | `email` = alternate identifier |
| "a member can borrow many books … many members" + dates | M:N **with data** → intermediate entity Loan |
| "the same member may even borrow the same book again" | the pair repeats → Loan has its **own id** `loan_id` |
| "return date, which stays empty until the book comes back" | `return_date` not mandatory |
| "birth year" | store the year, never the age (derived) |

## 4. Reference CDM

| Entity | Attributes (PI) | Notes |
|---|---|---|
| Publisher | **publisher_id**, name, country | |
| Book | **book_id**, isbn (AI), title, pub_year | |
| Author | **author_id**, name, birth_year | |
| Member | **card_no**, name, email (AI) | |
| Loan | **loan_id**, loan_date, due_date, return_date (optional) | → Member, → Book |

### Relationships
| A | card. A | B | card. B | Dependent |
|---|---|---|---|---|
| Publisher | 1,1 | Book | 0,n | — |
| Author | 1,n | Book | 1,n | — (M:N) |
| Member | 1,1 | Loan | 0,n | — |
| Book | 1,1 | Loan | 0,n | — |

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| PUBLISHER | publisher_id | |
| BOOK | book_id | → PUBLISHER; AK isbn |
| AUTHOR | author_id | |
| WRITES | author_id, book_id | → AUTHOR, → BOOK |
| MEMBER | card_no | AK email |
| LOAN | loan_id | → MEMBER, → BOOK |

## 6. Key decisions & lessons

1. **Publisher is an entity**, not a text attribute of Book: it has its own facts and many books; typing its name into every book repeats it.
2. **Primary vs alternate identifier.** ISBN is unique and could be the PK; the reference adds a short `book_id` ✱ because other tables copy the PK. The ISBN rule is still enforced by UNIQUE.
3. **Two many-to-manys, two answers.** Author–Book has no data → a plain relationship (join table generated). Member–Book has dates → intermediate entity Loan.
4. **Own id when the pair repeats.** The same member can borrow the same book again, so (card_no, book_id) cannot be the PK of LOAN. *Alternative:* Loan dependent on Member and Book with `loan_date` in the PK.

## 7. Walkthrough

`fine` granularity: one step each for entity → attributes → identifier, then each relationship as soon as both ends exist. Order: Book, Publisher, Author, Member, Loan (20 steps).

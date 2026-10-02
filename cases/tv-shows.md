# Case: TV Shows

## 1. Meta
- id: `tv-shows`
- source: NOVA IMS DBMS 2026/27, Class 03 (J. N. Neves), slides 3–7
- difficulty: ★★☆
- concepts: inheritance (incl. "same attributes, different relationships"), dependent entity, intermediate entity without own id vs with own id, circular relationships

> The class PDF has no solution diagrams. The reference model below is reconstructed from the specification and the "Lessons learned" slide. Points that were only "discussed in class" are settled as **StrataSQL decisions** (marked ✱) — chosen to be the clearest for students; your teacher may accept alternatives.

## 2. Specification (verbatim)

- A TV show has a title, a genre, and a release year. A TV show has several episodes characterized by a title, a summary, and a duration (in minutes). Each episode is made of several scenes.
- Each episode is composed of a set of scenes that can be indoors or outdoors. For indoor scenes, it is necessary to know the scenario and the studio where the scene will be recorded. For outdoor scenes it makes sense to know the location and type of landscape. Scenes are always identified by the episode they relate to and an order number (not sequential).
- The participants in a scene are the actors and the technicians and are characterized by a name, a phone number, and an email. Each actor can play different roles in different scenes (but just one role in each scene) and several actors can participate in a scene. Technicians can participate in different scenes and even assume different functions in the same scene (e.g., a technician can accumulate sound and lighting in the same scene) and scenes have several technicians assigned.
- A TV Show can be directed by several directors, but each episode is directed by only one person. The information stored about the directors is the same that is stored for other participants (name, phone number and email).
- In your design you should include additional attributes to complement the database or to improve the design (e.g., keys).

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "TV show has a title, a genre, a release year" | Entity `TVShow` |
| "has several episodes" | `TVShow` 1 — N `Episode` |
| "made of several scenes" | `Episode` 1 — N `Scene` |
| "scenes that can be indoors **or** outdoors … for indoor … for outdoor …" | **Inheritance** `Scene` → `IndoorScene`, `OutdoorScene` (exclusive, complete) |
| "identified by the episode they relate to **and** an order number" | **Dependent** entity: `Scene` depends on `Episode`, own id = `order_no` |
| "actors and technicians … characterized by name, phone, email" + "directors … same information" | **Inheritance** `Person` → `Actor`, `Technician`, `Director` — same attributes, *different relationships* |
| "different roles in different scenes (but **just one role in each scene**)" | M:N Actor–Scene with data (role) → **intermediate entity `Role`, no own id** (one row per actor+scene) |
| "**different functions in the same scene**" | M:N Technician–Scene, pair can repeat → **intermediate entity `TechnicianFunction` with own id** |
| "TV Show can be directed by several directors" | M:N TVShow–Director → intermediate `ShowDirector` |
| "each episode is directed by only one person" | `Director` 1 — N `Episode` → **creates a cycle** (see §6) |

## 4. Reference CDM

### Entities
| Entity | Attributes (PI = primary identifier) | Notes |
|---|---|---|
| TVShow | **show_id** (PI), title, genre, release_year | `genre` could be a lookup entity |
| Episode | **episode_id** (PI), title, summary, duration_min | Alternative: dependent on TVShow with `episode_no` |
| Scene | **order_no** (own part of PI) | dependent on Episode → PI = (episode_id, order_no) |
| IndoorScene | scenario, studio | child of Scene |
| OutdoorScene | location, landscape_type | child of Scene |
| Person | **person_id** (PI), name, phone, email | parent |
| Actor | — | child of Person, no own attributes (justified by its relationships) |
| Technician | — | child of Person |
| Director | — | child of Person |
| Role | role_name | dependent on Actor **and** Scene, **no own id** |
| TechnicianFunction | **function_no** (own part of PI), function_name | dependent on Technician **and** Scene, **with own id** |
| ShowDirector | — | dependent on TVShow and Director, no own id |

### Relationships
| A | card. A | B | card. B | Dependent | Meaning |
|---|---|---|---|---|---|
| TVShow | 1,1 | Episode | 1,n | — | show has episodes |
| Episode | 1,1 | Scene | 1,n | Scene → Episode | scene identified by episode |
| Actor | 1,1 | Role | 0,n | Role → Actor | |
| Scene | 1,1 | Role | 0,n | Role → Scene | |
| Technician | 1,1 | TechnicianFunction | 0,n | TF → Technician | |
| Scene | 1,1 | TechnicianFunction | 0,n | TF → Scene | |
| TVShow | 1,1 | ShowDirector | 1,n | SD → TVShow | |
| Director | 1,1 | ShowDirector | 0,n | SD → Director | |
| ShowDirector | 1,1 | Episode | 0,n | — | episode directed by one of the show's directors ✱ (see §6.5) |

### Inheritances
| Parent | Children | Exclusive | Complete | Generation |
|---|---|---|---|---|
| Scene | IndoorScene, OutdoorScene | yes | yes | parent + children |
| Person | Actor, Technician, Director | **no** (a person may act and direct) ✱ | yes | parent + children |

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| TVSHOW | show_id | |
| EPISODE | episode_id | show_id → TVSHOW; (show_id, person_id) → SHOWDIRECTOR — `show_id` is **one shared column** used by both FKs |
| SCENE | episode_id, order_no | episode_id → EPISODE |
| INDOORSCENE | episode_id, order_no | → SCENE |
| OUTDOORSCENE | episode_id, order_no | → SCENE |
| PERSON | person_id | |
| ACTOR / TECHNICIAN / DIRECTOR | person_id | → PERSON |
| ROLE | person_id, episode_id, order_no | → ACTOR, → SCENE |
| TECHNICIANFUNCTION | person_id, episode_id, order_no, function_no | → TECHNICIAN, → SCENE |
| SHOWDIRECTOR | show_id, person_id | → TVSHOW, → DIRECTOR |

## 6. Key decisions & lessons

1. **Inheritance without own attributes.** Actor, Technician and Director have identical attributes, but each takes part in *different relationships*. That alone justifies inheritance (lesson slide 7). Without it you'd either duplicate three identical tables or lose the ability to say "only actors can have roles".
2. **Intermediate entity without own id (`Role`).** "Just one role in each scene" → the pair (actor, scene) must be unique → PK = the two migrated keys only. The DB itself then prevents a second role for the same actor in the same scene.
3. **Intermediate entity with own id (`TechnicianFunction`).** "Several functions in the same scene" → the pair (technician, scene) must repeat → add an own identifier (`function_no`) to the PK.
   *Alternative:* a lookup entity `Function` (Sound, Lighting…) and make TF depend on Technician + Scene + Function → PK of three, which also prevents the same function twice. StrataSQL uses the own-id version ✱ (it is the one the text describes); the lookup version is shown as an alternative in help.
4. **Dependent `Scene`.** The text gives the identifier literally: "identified by the episode … and an order number". "Not sequential" means `order_no` is just a sortable number (10, 20, 25…), not 1, 2, 3.
5. **Circular relationships (directors).** If you link `Episode → Director` directly *and* `TVShow ↔ Director` via ShowDirector, the loop Episode → TVShow → ShowDirector → Director ← Episode lets you store an episode directed by someone who is **not** a director of that show — conflicting data. Lesson: avoid cycles whenever possible.
   *Fix used here ✱:* link Episode to **ShowDirector** instead of Director. Episode then carries (show_id, person_id) of a valid show-director pair. In the PDM `show_id` arrives twice (from TVShow and from ShowDirector) and is kept as **one shared column** — so the director's show and the episode's show are the same value by construction and the conflict becomes impossible.
   *The cycle version* (Episode → Director) is kept as a seeded wrong model for the trainer and the linter (L04).

## 7. Rules not representable in the model
- A person who is a Director must have directed at least one show (minimum cardinalities on inheritance children).
- Scenes of an episode must be either indoor or outdoor (complete exclusive inheritance — PD can mark it, but enforcement in SQL needs triggers/constraints).

## 8. Hints & synonyms

- Level 2 hints:
  - Scene: "Read how scenes are *identified*." → "Identified by the episode **and** a number → what kind of entity?"
  - Role: "Where does the role name belong — to the actor or to the scene?" → "Neither: it belongs to the pair."
  - TechnicianFunction: "Can the same technician appear twice in the same scene?"
  - Person: "Three kinds of participants share the same data. What construct avoids repeating it?"
  - Directors: "Draw every path between Episode and Director. How many are there?"
- Synonyms: Role ≈ Casting, Participation, ActorScene; TechnicianFunction ≈ Assignment, TechnicianScene, Crew; Person ≈ Participant; ShowDirector ≈ Direction.

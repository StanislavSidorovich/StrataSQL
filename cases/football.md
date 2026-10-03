# Case: Football League

## 1. Meta
- id: `football`
- source: own example of StrataSQL ✱
- difficulty: ★★★
- concepts: two relationships to the same entity with roles, history with own id, dependent entity numbered in its parent, derived data, a rule as a key over migrated columns, a cycle that is accepted

## 2. Specification

A football league keeps its seasons, teams, players and matches. A season is identified by its starting year (2025 for 2025/26). Each team has a name, unique in the league, the city and the year it was founded.

Players are identified by a player number given by the league. We keep each player's name, birth date and nationality.

A player plays for different teams over the years, and may even return to a former team. Each contract links one player to one team from a start date to an end date, with a shirt number; the end date is empty while the contract runs.

Each match belongs to one season and is played between two teams: the home team and the away team. A team plays many home matches and many away matches. We record the date of each match. In a season, the same home team meets the same away team only once.

For every goal we record the match, the minute and the player who scored it; two goals can be scored in the same minute. The final score is not stored: it is counted from the goals.

A team never plays against itself, and the scorer must be under contract with one of the two teams on the day of the match.

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "identified by its starting year" | Season with PI `start_year` only |
| "a name, unique in the league" | `name` = AI of Team, `team_id` = PI ✱ |
| "plays for different teams over the years … may even return" | **Contract** = Player × Team with dates, **own id** |
| "with a shirt number" | attribute of Contract (changes with the team) |
| "the home team and the away team" | **two** relationships Team — Match, roles *home* / *away* → `home_team_id`, `away_team_id` |
| "the same home team meets the same away team only once" (in a season) | UNIQUE (start_year, home_team_id, away_team_id) on MATCH — a key over migrated columns |
| "two goals can be scored in the same minute" | **Goal** dependent on Match with own `goal_no` |
| "The final score is not stored" | derived → a query |
| "never plays against itself", "scorer must be under contract…" | rules outside the diagram (CHECK, trigger) |

## 4. Reference CDM

| Entity | Attributes (PI) | Notes |
|---|---|---|
| Season | **start_year** | |
| Team | **team_id**, name (AI), city, founded_year | |
| Player | **player_no**, name, birth_date, nationality | |
| Contract | **contract_id**, start_date, end_date (optional), shirt_no | → Player, → Team |
| Match | **match_id**, match_date | → Season, → Team (home), → Team (away); key AK_MATCH_PAIRING |
| Goal | **goal_no**, minute | dependent on Match; → Player |

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| SEASON | start_year | |
| TEAM | team_id | AK name |
| PLAYER | player_no | |
| CONTRACT | contract_id | → PLAYER, → TEAM |
| MATCH | match_id | → SEASON, home_team_id → TEAM, away_team_id → TEAM; AK (start_year, home_team_id, away_team_id) |
| GOAL | match_id, goal_no | → MATCH, → PLAYER |

## 6. Key decisions & lessons

1. **Two links, two roles**: "two teams" is not one relationship with a maximum of 2 — it is two relationships, each meaning something. Roles keep the FK columns apart.
2. **Contract as history** with own id (the pair repeats). The shirt number belongs to the contract.
3. **Goal is dependent** with `goal_no`: the minute is not unique.
4. **The accepted cycle** ✱: the linter (L04) shows Team – Match – Goal – Player – Contract – Team. Here the paths mean different things (who played the match vs who employs the player), so neither link can go. The rule that ties them ("the scorer was under contract with one of the two teams on that day") needs a trigger or the application. Lesson: a linter warning is a question to answer, not an automatic error.
5. **What keys cannot say**: "a team never plays against itself" compares two columns of one row → a CHECK, not a key (the Sandbox lets the row in).

Sandbox scenario: *Home and away teams, and one pairing per season*.

# Reference model: Quaera (sales analytics, star schema)

## 1. Meta
- id: `quaera` (Examples → Real database; link: https://model.quaera.app/?example=quaera)
- source: the real database of [Quaera](https://quaera.app), the analyst trainer StrataSQL is part of ✱
- kind: **reference model**, not a trainer case: no task text, no tags or hints, nothing to check. It is read, not built
- concepts: fact vs dimension, grain, surrogate key + grain as alternate key, denormalised dimension, derived data stored on purpose, snapshot fact, two reflexive hierarchies, linter warnings that are questions
- built from: `public/data/schema.json` and the SQLite data of Quaera (2026-10-06): every table, column, key and NULL rule below was checked against the rows

## 2. What the database is about

Kaiyo Trading distributes FMCG goods (water, juice, snacks…) and OTC pharma in Japan, January 2024 – June 2026. Products go from the company to distributors (**sell-in**), and from distributors and chains on to shops, pharmacies and an online store, which sell them to people (**sell-out**). Analysts compare the two, watch distributor stock, check sales reps against their targets and measure how good the demand forecasts were.

Quaera's learners never design this database: they query it. This model shows the design behind the tables they query.

## 3. Why it does not look like the course cases

The course cases are **order-entry (OLTP) databases**: one fact in one place, lookups instead of repeated text, nothing stored that can be computed. This is an **analytics (OLAP) database**, built so that questions are easy to ask, and it breaks some of those habits on purpose:

| Course habit | Here | Why |
|---|---|---|
| Repeated text → lookup entity | Product keeps `brand`, `category`, `subcategory`, `division` as text | A **denormalised dimension**: every question about products is one join away from the facts. The data is loaded by a script, not typed by people, so it cannot drift |
| Derived data is not stored | Calendar is *all* derived columns; `avg_price`, `net_amount`, `month_start` are stored | Computed once at load time, so every query can `GROUP BY month_start` without date functions |
| The key is what identifies the thing | Facts have a surrogate key (`sellout_id`) **and** the grain as an alternate key | The grain (week × outlet × product) is what one row *means*; the AK makes the database refuse a second row for it |

## 4. Reference CDM

Dimensions (who, what, where, when — referenced by others, reference nothing except their own hierarchy):

- **Calendar** (`DIM_DATE`): date_id `<pi>` Date, year, quarter, month, month_name, month_start, week_start, iso_week, day_of_week, day_name, is_weekend
- **Product** (`DIM_PRODUCT`): product_id `<pi>`, sku_code `<ai>`, product_name, brand, category, subcategory, division, pack_size, unit, list_price, launch_date
- **Region** (`DIM_REGION`): region_id `<pi>`, region_name, macro_region, population, tier
- **Customer** (`DIM_CUSTOMER`): customer_id `<pi>`, customer_name, customer_type, channel, chain_name (optional), city, opened_date, is_active
- **Sales Rep** (`DIM_REP`): rep_id `<pi>`, rep_name, team, role, hired_date
- **Promo** (`DIM_PROMO`): promo_id `<pi>`, promo_name, brand, mechanic, start_date, end_date, discount_pct, channel

Facts (what happened, counted — reference dimensions, nobody references them):

- **Sell-out** (`FACT_SELLOUT`): sellout_id `<pi>`, units, revenue, avg_price — grain week × outlet × product
- **Sell-in** (`FACT_SELLIN`): sellin_id `<pi>`, order_date, ship_date, month_start, units, gross_amount, discount_amount, net_amount — grain month × distributor × product
- **Stock** (`FACT_STOCK`): stock_id `<pi>`, month_start, month_end, units_on_hand, units_in_transit — grain month × distributor × product
- **Target** (`FACT_TARGET`): target_id `<pi>`, month_start, division, target_units, target_revenue — grain month × rep × division
- **Forecast Snapshot** (`FACT_FORECAST_SNAPSHOT`): forecast_id `<pi>`, snapshot_month, month_start, lag_months, forecast_units — grain forecast month × target month × product
- **Price** (`FACT_PRICE`): price_id `<pi>`, month_start, list_price, promo_price — grain month × product

Domains: Name (VA50), Label (VA20), Amount (DC12,2).

### Relationships

| Relationship | One end | Many end | Note |
|---|---|---|---|
| located_in | Region 1,1 | Customer 0,n | |
| based_in | Region 1,1 | Sales Rep 0,n | |
| serves | Sales Rep **0,1** | Customer 0,n | distributors have no rep |
| supplies (reflexive) | Customer **0,1** *distributor* | Customer 0,n *outlet* | an outlet is served by at most one distributor |
| manages (reflexive) | Sales Rep **0,1** *manager* | Sales Rep 0,n *team_member* | managers have no manager |
| week_of | Calendar 1,1 | Sell-out 0,n | the Calendar row of the week's Monday |
| sells / sold_as | Customer, Product 1,1 | Sell-out 0,n | |
| promoted_by | Promo **0,1** | Sell-out 0,n | 94 600 of 118 449 rows have no promo |
| buys / shipped_as | Customer, Product 1,1 | Sell-in 0,n | only distributors buy (checked: 0 rows otherwise) |
| holds / stocked_as | Customer, Product 1,1 | Stock 0,n | only distributors |
| aims_for | Sales Rep 1,1 | Target 0,n | |
| forecast_for, priced_at | Product 1,1 | Forecast Snapshot, Price 0,n | |

16 relationships = the 16 foreign keys Quaera declares in `schema.json`.

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| DIM_DATE | date_id | |
| DIM_PROMO | promo_id | |
| DIM_PRODUCT | product_id | AK sku_code |
| DIM_REGION | region_id | |
| DIM_CUSTOMER | customer_id | → DIM_REGION, → DIM_REP (NULL), distributor_customer_id → DIM_CUSTOMER (NULL) |
| DIM_REP | rep_id | → DIM_REGION, manager_rep_id → DIM_REP (NULL) |
| FACT_SELLOUT | sellout_id | → DIM_DATE, → DIM_CUSTOMER, → DIM_PRODUCT, → DIM_PROMO (NULL); AK date_id, customer_id, product_id |
| FACT_SELLIN | sellin_id | → DIM_CUSTOMER, → DIM_PRODUCT; AK month_start, customer_id, product_id |
| FACT_STOCK | stock_id | → DIM_CUSTOMER, → DIM_PRODUCT; AK month_start, customer_id, product_id |
| FACT_TARGET | target_id | → DIM_REP; AK month_start, rep_id, division |
| FACT_FORECAST_SNAPSHOT | forecast_id | → DIM_PRODUCT; AK snapshot_month, month_start, product_id |
| FACT_PRICE | price_id | → DIM_PRODUCT; AK month_start, product_id |

Every AK was checked on the data: no grain repeats (e.g. 118 449 sell-out rows, 118 449 distinct week × outlet × product).

### Where the generated tables differ from Quaera's

Same 12 tables, same columns, same links. The differences are names and types, and each has a reason:

| Generated here | In Quaera | Why |
|---|---|---|
| FACT_SELLOUT.`date_id` | `week_start` | The course rule (and PowerDesigner) names a migrated key after the parent's key. A warehouse renames it for what it means. Quaera also joins `week_start` to `dim_date.week_start`, which is not a key, so it cannot be a real FK; here it points at the Monday's row instead |
| FACT_SELLIN / FACT_STOCK.`customer_id` | `distributor_id` | Same rule: one link to Customer, so no role prefix. The name `distributor_id` says which customers can appear |
| DIM_CUSTOMER.`distributor_customer_id` | `served_by_distributor_id` | Reflexive link: the role *distributor* becomes the prefix |
| DIM_REP.`manager_rep_id` | `manager_id` | Reflexive link: the role *manager* becomes the prefix |
| Table names in capitals | lower case | SQL Server ignores the case of names; capitals follow the course |
| `date`, `bit`, `decimal(12,2)`, NOT NULL, FKs, AKs | `TEXT`, `INTEGER`, `REAL`, no constraints | Quaera runs on SQLite in the browser and loads its data by script; the constraints live in the script and its checks, not in the database |

## 6. Key decisions & lessons

1. **Facts and dimensions are told apart by the arrows, not by the names.** A dimension is referenced; a fact references and is not referenced. Quaera's Data screen draws its star the same way.
2. **Grain first.** Before the columns, say what one row is (week × outlet × product). Then make it an alternate key: a surrogate PK alone would accept the same week twice.
3. **Stock is a snapshot**: units on hand at month end. Summing it across months is wrong; summing sell-out across weeks is right. Same table shape, different arithmetic.
4. **Forecast Snapshot keeps every forecast as it was made** (lag 1, 2, 3 months). Overwriting it with the latest one would make forecast accuracy impossible to measure.
5. **Price is history, Product.list_price is today** — the same idea as Online Shop's `unit_price`.
6. **The linter's warnings, answered** ✱ (the model keeps them on purpose, like Football):
   - *Cycle Sales Rep – Customer – Region*: a customer reaches a region directly and through its rep. Here the two paths mean different things: where the outlet is vs where the rep is based. Checked on the data: only 8 of 132 outlets share a region with their rep. Neither link can go.
   - *Cycles through Sell-in / Stock – Customer – Sell-out – Product*: in a star every fact shares the same dimensions, so cycles are everywhere. Two facts are separate observations (what was shipped, what was sold) and nothing should force them to agree: the gap between them is what analysts look for.
   - *avg_price looks derived*: it is (revenue / units), and it is stored on purpose (§3).

No Sandbox scenario: the 12 tables are created in the Sandbox (checked), but Quaera's data (about 160 000 rows) is queried in Quaera.

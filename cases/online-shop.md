# Case: Online Shop

## 1. Meta
- id: `online-shop`
- source: own example of StrataSQL ✱
- difficulty: ★★
- concepts: dependent entity with a line number, reflexive relationship with roles, one-to-one, history (price at order time) vs derived data (order total), reserved words

## 2. Specification

An online shop sells products to registered customers. For each customer we keep a customer number, the name and the email; no two customers share an email.

Each product has a code (SKU), a name, the current price and the quantity in stock. Every product belongs to one category, and a category has many products.

Categories form a tree: a category may have a parent category, and a category can have several subcategories (Electronics → Phones → Smartphones). For each category we keep its name.

Customers place orders: an order is placed by one customer on a given date, and a customer can place many orders. Each order has numbered lines (1, 2, 3…); each line refers to one product and records the quantity and the unit price paid, because product prices change later. The total of an order is not stored: it is computed from its lines.

An order is paid at most once, and each payment pays exactly one order. For the payment we keep the date, the method (card, MB Way or PayPal) and the amount.

## 3. Text → model mapping

| Signal in the text | Decision |
|---|---|
| "a code (SKU)" | `sku` = AI; `product_id` = PI ✱ |
| "a category may have a parent category … several subcategories" | **reflexive** relationship Category 0,1 (role *parent*) — 0,n (role *sub*) → FK `parent_category_id` |
| "orders" | entity **Customer Order** ✱ (`ORDER` is a reserved word in SQL) |
| "numbered lines (1, 2, 3…)" | **Order Line** dependent on the order, own part `line_no` |
| "each line refers to one product" | Product 1,1 — 0,n Order Line (plain FK) |
| "unit price paid, because product prices change later" | `unit_price` on the line: history, **not** derived |
| "The total of an order is not stored" | derived → a query (SUM) |
| "paid at most once … each payment pays exactly one order" | one-to-one Customer Order 1,1 — 0,1 Payment; FK in PAYMENT, UNIQUE |
| "card, MB Way or PayPal" | a CHECK list (or a lookup entity) |

## 4. Reference CDM

| Entity | Attributes (PI) | Notes |
|---|---|---|
| Customer | **customer_no**, name, email (AI) | |
| Category | **category_id**, name | reflexive: parent / sub |
| Product | **product_id**, sku (AI), name, price, stock | → Category |
| Customer Order | **order_no**, order_date | → Customer |
| Order Line | **line_no**, quantity, unit_price | dependent on Customer Order; → Product |
| Payment | **payment_id**, paid_on, method, amount | 1:1 with Customer Order |

### Relationships
| A | card. A | B | card. B | Dependent / roles |
|---|---|---|---|---|
| Category | 1,1 | Product | 0,n | — |
| Category (parent) | 0,1 | Category (sub) | 0,n | roles parent / sub |
| Customer | 1,1 | Customer Order | 0,n | — |
| Customer Order | 1,1 | Order Line | 1,n | Order Line |
| Product | 1,1 | Order Line | 0,n | — |
| Customer Order | 1,1 | Payment | 0,1 | — (one-to-one) |

## 5. Expected PDM

| Table | PK | FKs / AKs |
|---|---|---|
| CUSTOMER | customer_no | AK email |
| CATEGORY | category_id | parent_category_id → CATEGORY |
| PRODUCT | product_id | → CATEGORY; AK sku |
| CUSTOMER_ORDER | order_no | → CUSTOMER |
| ORDER_LINE | order_no, line_no | → CUSTOMER_ORDER, → PRODUCT |
| PAYMENT | payment_id | → CUSTOMER_ORDER; AK order_no (one-to-one) |

## 6. Key decisions & lessons

1. **Order Line is dependent** (like Scene in TV Shows): line 1 of order 7 ≠ line 1 of order 8. The product is a plain, non-identifying FK. *Alternative:* no `line_no`, PK = (order_no, product_id) — then the same product cannot appear on two lines.
2. **Reflexive relationship needs roles**: both FK columns would otherwise be called `category_id`.
3. **Payment is a separate entity** in one-to-one ✱: an unpaid order would otherwise carry three empty columns. The FK goes to the side that always has a partner (Payment).
4. **History vs derived**: `unit_price` copies the price at order time (needed: prices change); the total is computed (not stored: it would duplicate the lines).
5. **Reserved words**: naming the entity Order gives a table ORDER, which needs `[ORDER]` in SQL Server and quotes in PostgreSQL.

Sandbox scenario: *Order lines, the category tree and one payment per order* (PK_ORDER_LINE, FK_CATEGORY_PARENT_CATEGORY, AK_PAID_BY_PAYMENT, the total as a query).

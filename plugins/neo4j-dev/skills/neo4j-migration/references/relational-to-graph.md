# Relational-to-Graph Migration Patterns

## Table Classification — What Becomes What

Classify every source table before writing any Cypher:

| Table type | Graph target | Example |
|---|---|---|
| Entity table | Node | `customers` → `:Customer` nodes |
| Junction/join table | Relationship with properties | `order_details` → `[:CONTAINS {quantity, unitPrice}]` |
| Lookup/code table (<10 vals, static) | Property value | `statuses` → `order.status = "Shipped"` |
| Self-referencing hierarchy | Same-label relationship | `employees.reports_to` → `[:REPORTS_TO]` |
| Audit/log table | Omit or keep in RDBMS | `audit_log` → leave in relational storage |

Design for query patterns, not schema replication. A good graph often looks different from the source schema.

## FK → Relationship Mapping

Each FK becomes a named relationship. Rules:

- Direction follows business semantics, not FK column location
- Name with UPPER_SNAKE_CASE verbs (`PLACED`, `REPORTS_TO`)
- Use column name only as fallback — never `(Order)-[:CUSTOMER_ID]->(Customer)`

| FK pattern | Relationship |
|---|---|
| `orders.customer_id` → `customers` | `(Customer)-[:PLACED]->(Order)` |
| `products.category_id` → `categories` | `(Product)-[:IN_CATEGORY]->(Category)` |
| `order_details.order_id` + `product_id` | `(Order)-[:CONTAINS {qty,price}]->(Product)` |
| `employees.reports_to` → `employees` | `(Employee)-[:REPORTS_TO]->(Employee)` |

Junction table rows create **one** relationship each, not two. Properties from the junction go on the relationship.

## Property Conventions

- Column → property: use camelCase (`company_name` → `companyName`)
- Primary keys: keep as property AND use as unique constraint key
- Foreign keys: remove — they become relationships
- Binary/BLOB columns: omit (not suited for graph storage)
- NULL columns: Neo4j silently omits null properties — no action needed

## Import Order (dependency chain)

```
1. CREATE constraints (all labels, all IDs) — must precede all data
2. Import independent nodes (no FK deps): lookup/reference nodes
3. Import dependent nodes (FK deps): entity nodes referencing step-2 nodes
4. Import transaction nodes (FK deps): nodes referencing step-3 nodes
5. Create relationships (all referenced nodes must exist)
```

For self-referencing tables (e.g. employee hierarchy): two-pass import — create all nodes first, then relationships.

## MERGE-based Upsert (idempotent import)

Use MERGE on the unique ID property so re-runs don't duplicate:

```cypher
// Idempotent node import
LOAD CSV WITH HEADERS FROM 'file:///customers.csv' AS row
MERGE (c:Customer {customerID: row.customer_id})
SET c.companyName = row.company_name,
    c.city        = row.city,
    c.country     = row.country
```

```cypher
// Idempotent relationship import
LOAD CSV WITH HEADERS FROM 'file:///orders.csv' AS row
MATCH (c:Customer {customerID: row.customer_id})
MATCH (o:Order    {orderID:    toInteger(row.order_id)})
MERGE (c)-[:PLACED]->(o)
```

`CREATE` only for initial bulk load with guaranteed-clean data. `MERGE` for incremental sync or re-runnable scripts.

## NULL Handling

```cypher
// Option A — omit (recommended for optional fields)
SET c.region = CASE WHEN row.region IS NOT NULL AND row.region <> ''
                    THEN row.region ELSE null END

// Option B — default value
SET c.region = COALESCE(NULLIF(row.region, ''), 'Unknown')
```

Neo4j does not store null properties — Option A means the property won't exist on nodes where source is NULL.

## Large Dataset Batching

```cypher
// Neo4j 5+ / 2025.x: CALL IN TRANSACTIONS
:auto LOAD CSV WITH HEADERS FROM 'file:///large_file.csv' AS row
CALL {
  WITH row
  MERGE (n:Node {id: row.id})
  SET n.name = row.name
} IN TRANSACTIONS OF 10000 ROWS
```

## Validation After Import

Run these checks to confirm correct migration:

```cypher
// Node counts — compare to source row counts
MATCH (n)
RETURN labels(n)[0] AS label, count(*) AS cnt
ORDER BY label

// Relationship counts
MATCH ()-[r]->()
RETURN type(r) AS rel, count(*) AS cnt
ORDER BY rel

// Referential integrity — orders without customer
MATCH (o:Order)
WHERE NOT (:Customer)-[:PLACED]->(o)
RETURN count(o) AS orphanOrders   // expect 0

// Confirm constraints
SHOW CONSTRAINTS
```

Expected Northwind counts: 91 Customer, 830 Order, 77 Product, 8 Category, 29 Supplier, 9 Employee, 3 Shipper; 830 PLACED, 2155 CONTAINS, 8 REPORTS_TO.

## Constraint Creation Script Pattern

Always run before importing any data:

```cypher
CREATE CONSTRAINT customer_id IF NOT EXISTS
FOR (c:Customer) REQUIRE c.customerID IS UNIQUE;

CREATE CONSTRAINT order_id IF NOT EXISTS
FOR (o:Order) REQUIRE o.orderID IS UNIQUE;

CREATE CONSTRAINT product_id IF NOT EXISTS
FOR (p:Product) REQUIRE p.productID IS UNIQUE;
```

Unique constraints auto-create an index. Add extra indexes for frequent filter properties after data load:

```cypher
CREATE INDEX customer_country IF NOT EXISTS FOR (c:Customer) ON (c.country);
CREATE INDEX order_date       IF NOT EXISTS FOR (o:Order)    ON (o.orderDate);
CREATE TEXT INDEX product_name IF NOT EXISTS FOR (p:Product) ON (p.productName);
```

After creating indexes, poll until all ONLINE:
```cypher
SHOW INDEXES YIELD name, state WHERE state <> 'ONLINE'
```
Do not query until all report `ONLINE`.

## Common Misconceptions

| Wrong assumption | Reality |
|---|---|
| Every table → node | Junction/lookup tables → relationships or properties |
| Columns → relationships | Columns → properties; FKs → relationships |
| Mirror relational schema 1:1 | Design for your query patterns |
| Import everything | Omit audit logs, static lookups that don't need traversal |
| One-to-one → two nodes | Consider merging into single node with combined properties |

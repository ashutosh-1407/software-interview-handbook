# Chapter 4: Database Sharding

# Part 3 – Cross-Shard Queries, Transactions & Data Locality

---

# 4.14 Single-Shard Queries

The ideal sharded system routes every request to exactly one shard.

Example:

```text
Shard1

Users

1–1,000,000
```

```text
Shard2

Users

1,000,001–2,000,000
```

```text
Shard3

Users

2,000,001–3,000,000
```

Suppose the application executes:

```sql
SELECT *
FROM Users
WHERE UserID = 1250000;
```

Since the shard key is:

```text
UserID
```

the application immediately routes the query to:

```text
Shard2
```

Only one database is queried.

This is the ideal scenario.

---

# 4.15 Cross-Shard Queries

Now consider:

```sql
SELECT COUNT(*)
FROM Users;
```

No single shard knows the answer.

Each shard only stores part of the data.

The application must query:

```text
Shard1

↓

Count = 1M
```

```text
Shard2

↓

Count = 1M
```

```text
Shard3

↓

Count = 1M
```

Finally:

```text
1M + 1M + 1M

=

3M
```

This is called a:

> **Cross-Shard Query**

---

# Another Example

Suppose users are sharded by:

```text
UserID
```

The application executes:

```sql
SELECT *
FROM Users
WHERE Country = 'USA';
```

Since:

```text
Country
```

is **not** the shard key,

users from the USA may exist in every shard.

The application must query:

```text
Shard1

Shard2

Shard3
```

and merge the results.

---

# Why Are Cross-Shard Queries Expensive?

Compared to a single-shard query:

Cross-shard queries require:

- Multiple network requests
- Multiple databases
- Result aggregation
- Increased latency
- More CPU

Whenever possible,

design systems to avoid them.

---

# Engineering Principle

> **Choose a shard key that keeps the most common queries within a single shard.**

The shard key should be based on:

- Access patterns
- Query frequency
- Latency requirements

—not simply on the database schema.

---

# Choosing the Right Shard Key

Suppose:

70% of queries are:

```sql
WHERE UserID = ?
```

20%:

```sql
WHERE Country = ?
```

10%:

Analytics
```

A reasonable shard key would likely be:

```text
UserID
```

because it optimizes the majority of latency-sensitive requests.

Not every query can be optimized.

Optimize for the common case.

---

# 4.16 Data Locality

Another important design goal is:

> **Data Locality**

Definition:

> Store data that is frequently accessed or updated together on the same shard.

---

Example:

Suppose an e-commerce application stores:

- Users
- Orders
- Shopping Cart

Most business operations involve:

```text
User

+

Orders

+

Shopping Cart
```

If all three are sharded using:

```text
UserID
```

they naturally reside on the same shard.

Example:

```text
Shard7

User

Orders

Shopping Cart
```

Most requests now require only one database.

---

# Benefits

Data locality:

- Reduces network communication
- Reduces cross-shard transactions
- Improves latency
- Simplifies application logic

---

# Engineering Principle

> **Keep data that is frequently used together on the same shard whenever possible.**

---

# 4.17 Cross-Shard Transactions

Suppose:

Alice:

```text
Shard1
```

Bob:

```text
Shard2
```

Alice transfers:

```text
$100
```

to Bob.

The transaction now spans:

```text
Shard1

↓

Deduct $100
```

```text
Shard2

↓

Add $100
```

This is called a:

> **Cross-Shard Transaction**

---

# Why Are They Difficult?

Imagine:

Shard1:

```text
Committed
```

Shard2:

```text
Network Failure
```

Money has been deducted,

but never deposited.

The system becomes inconsistent.

Unlike a single database,

multiple independent databases must coordinate before committing.

---

# Two-Phase Commit (High Level)

One common approach is:

> **Two-Phase Commit (2PC)**

At a high level:

---

## Phase 1 – Prepare

Coordinator asks every participating shard:

```text
Can you commit?
```

Each shard responds:

```text
Ready
```

or

```text
Cannot Commit
```

No data is committed yet.

---

## Phase 2 – Commit

If every participant is ready,

the coordinator sends:

```text
COMMIT
```

All shards commit.

If any participant cannot proceed,

the coordinator instructs every shard to:

```text
ROLLBACK
```

---

# Important Limitation

Two-Phase Commit is **not** perfect.

Suppose:

One shard commits,

but another never receives the COMMIT message due to a network failure.

The coordinator must continue retrying until all participants reach the same final state.

If the coordinator crashes,

participants may temporarily block while waiting for the final decision.

For this reason,

distributed transactions are generally slower and more complex than local database transactions.

---

# Engineering Principle

> **Distributed transactions should be avoided whenever practical.**

Whenever possible,

choose a shard key that keeps related business operations within the same shard.

---

# Apple Example

Suppose Apple's Supply Chain system stores:

- Warehouses
- Inventory
- Purchase Orders

If these entities are frequently updated together,

sharding them using:

```text
WarehouseID
```

may keep many business operations inside a single shard,

reducing distributed transactions.

---

# 4.18 Optimizing for Business Operations

Good shard keys optimize:

- Common queries
- Common transactions

Example:

If an e-commerce application frequently performs:

```text
User

↓

Shopping Cart

↓

Checkout

↓

Orders
```

then sharding by:

```text
UserID
```

keeps the entire checkout workflow within one shard.

This improves:

- Latency
- Simplicity
- Reliability

---

# Engineering Principles

## Principle 1

Optimize for:

> The most common queries.

---

## Principle 2

Optimize for:

> The most common business transactions.

---

## Principle 3

Maximize:

> Data Locality.

---

## Principle 4

Minimize:

> Cross-Shard Queries.

---

## Principle 5

Minimize:

> Cross-Shard Transactions.

---

# Interview Questions

### Q1

What is a Cross-Shard Query?

Why is it generally slower than a single-shard query?

---

### Q2

Suppose users are sharded by UserID.

Why is the following query expensive?

```sql
SELECT *
FROM Users
WHERE Country = 'USA';
```

---

### Q3

Explain Data Locality.

Why is it important when designing a shard key?

---

### Q4

Why are Cross-Shard Transactions more difficult than transactions within a single database?

---

### Q5

At a high level,

how does Two-Phase Commit help coordinate multiple shards?

What are its major limitations?

---

### Q6

Suppose an e-commerce system stores:

- Users
- Orders
- Shopping Cart

What shard key would you choose?

Why?

---

# Key Takeaways

1. The ideal request touches exactly one shard.
2. Cross-Shard Queries require multiple databases and result aggregation.
3. Shard keys should optimize the application's most common access patterns.
4. Data Locality keeps frequently accessed data together.
5. Cross-Shard Transactions require coordination across multiple databases.
6. Two-Phase Commit coordinates distributed transactions but introduces additional latency and operational complexity.
7. Good shard keys minimize both Cross-Shard Queries and Cross-Shard Transactions.
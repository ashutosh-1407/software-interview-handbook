# Chapter 4: Database Sharding

# Part 1 – Introduction & Sharding Strategies

---

# 4.1 Why Sharding?

So far we've learned:

```text
Users

↓

Load Balancer

↓

Application Servers

↓

Cache

↓

Primary + Read Replicas
```

Each component solved a different problem.

| Problem | Solution |
|----------|----------|
| Too many users | Load Balancer |
| Too many reads | Cache |
| Database read bottleneck | Replication |

Question:

> What if the Primary still cannot handle the workload?

There are two major possibilities:

- Too many writes
- Too much data

Both problems are solved using **Sharding**.

---

# 4.2 Definition

> **Sharding is the process of horizontally partitioning data across multiple databases so that each database stores only a subset of the data.**

Unlike replication:

Replication creates **copies** of the same data.

Sharding stores **different** data on different databases.

---

# Replication

```text
Primary

Users
Orders
Products

↓

Replica

Users
Orders
Products
```

Same data.

---

# Sharding

```text
Shard1

Users
1–1M
```

```text
Shard2

Users
1M–2M
```

```text
Shard3

Users
2M–3M
```

Different data.

---

# 4.3 Problems Solved by Sharding

Sharding primarily solves two problems.

---

## Problem 1 – Storage Capacity

Suppose one database stores:

```text
150 TB
```

Even if traffic is low:

Problems include:

- Storage limits
- Slow backups
- Slow restores
- Difficult maintenance
- Longer recovery times

Instead:

```text
Shard1

40 TB
```

```text
Shard2

40 TB
```

```text
Shard3

35 TB
```

```text
Shard4

35 TB
```

Each database manages a much smaller dataset.

---

## Problem 2 – Write Scalability

Suppose:

```text
Writes

↓

100,000/sec
```

With replication:

Every write still goes to:

```text
Primary
```

The Primary eventually becomes the bottleneck.

With sharding:

```text
User1

↓

Shard1
```

```text
User2

↓

Shard2
```

```text
User3

↓

Shard3
```

Multiple databases now accept writes simultaneously.

---

# Important Observation

Replication improves:

- Read scalability
- Availability

Replication does **not** improve:

- Write scalability
- Storage capacity

Those are sharding problems.

---

# 4.4 Vertical vs Horizontal Scaling

Before sharding, it's useful to understand the two scaling approaches.

---

## Vertical Scaling

Increase the resources of one server.

Example:

```text
16 GB RAM

↓

32 GB

↓

64 GB

↓

128 GB
```

Advantages:

- Very simple
- Minimal application changes

Disadvantages:

- Expensive
- Hardware limits
- Single point of failure

---

## Horizontal Scaling

Instead of one large server:

```text
Database
```

Use multiple databases.

```text
Shard1

Shard2

Shard3

Shard4
```

Advantages:

- Better write scalability
- Better storage scalability
- Better fault isolation

Disadvantages:

- More complex architecture

Sharding is a form of horizontal scaling.

---

# Fault Isolation

Suppose one database serves all users.

A runaway query causes:

```text
CPU

↓

100%
```

Now:

- Payments slow down
- Inventory slows down
- User profiles slow down

The entire application suffers.

With sharding:

```text
Shard1

Users A-F
```

```text
Shard2

Users G-M
```

```text
Shard3

Users N-Z
```

If only Shard2 becomes overloaded,

Users on Shard1 and Shard3 continue operating normally.

This is called:

> **Fault Isolation**

A failure or overload in one shard does not necessarily affect the others.

---

# Engineering Principle

Always identify the bottleneck before choosing the solution.

| Bottleneck | Solution |
|------------|----------|
| Read traffic | Cache |
| Read scalability | Replication |
| Write scalability | Sharding |
| Storage capacity | Sharding |

---

# 4.5 Sharding Strategies

Once we've decided to shard,

the next question becomes:

> Which shard should store a particular piece of data?

There are three common strategies:

- Range-based Sharding
- Hash-based Sharding
- Directory-based Sharding

---

# 4.6 Range-based Sharding

Store records based on value ranges.

Example:

```text
Shard1

UserID

1–1,000,000
```

```text
Shard2

1,000,001–2,000,000
```

```text
Shard3

2,000,001–3,000,000
```

Suppose:

```text
UserID = 750000
```

The application immediately routes the request to:

```text
Shard1
```

---

## Advantages

- Simple routing
- Easy to understand
- Excellent for range queries

Example:

```sql
SELECT *
FROM Users
WHERE UserID BETWEEN
1000
AND
5000;
```

Only one shard needs to be queried.

---

## Disadvantages

Suppose new users always receive increasing UserIDs.

Eventually:

```text
Shard3
```

receives almost all new writes.

This creates:

> **Hot Shards**

---

# 4.7 Hash-based Sharding

Instead of ranges,

compute:

```text
Hash(UserID)
```

Example:

```text
Hash(UserID)

%

Number of Shards
```

The resulting value determines the destination shard.

---

## Advantages

- Excellent load distribution
- Balanced CPU
- Balanced storage
- Predictable routing

---

## Disadvantages

Hashing destroys ordering.

Example:

```sql
SELECT *
FROM Users
WHERE UserID BETWEEN
1000
AND
5000;
```

The application must query every shard because nearby UserIDs may hash to completely different shards.

---

# 4.8 Directory-based Sharding

Instead of calculating the destination shard,

the application asks a directory service.

```text
Application

↓

Directory Service

↓

Shard
```

The directory stores metadata describing where partitions are currently located.

The application does not need to know the routing logic.

---

## Advantages

- Flexible routing
- Easier rebalancing
- No application code changes when partitions move

---

## Disadvantages

Introduces another component that must be:

- Highly available
- Replicated
- Consistent

---

# Comparing the Strategies

| Strategy | Advantages | Disadvantages | Best For |
|-----------|------------|---------------|----------|
| Range | Excellent range queries | Hot shards | Ordered workloads |
| Hash | Balanced distribution | Poor range queries | Random workloads |
| Directory | Flexible routing | Additional metadata layer | Dynamic systems |

---

# Engineering Principles

## Principle 1

Choose the shard key based on:

> **How the application accesses the data.**

Not simply on:

> What the data looks like.

---

## Principle 2

Optimize for the most common and latency-sensitive queries.

No shard key optimizes every query.

---

## Principle 3

Choose the simplest architecture that satisfies the business requirements.

Additional complexity should always be justified.

---

# Apple Example

Suppose Apple's Supply Chain system primarily searches inventory using:

```text
WarehouseID
```

A better shard key might be:

```text
WarehouseID
```

rather than:

```text
UserID
```

because most requests now access a single shard.

Business access patterns should always drive shard key selection.

---

# Interview Questions

### Q1

What problems does sharding solve that replication does not?

---

### Q2

Explain the difference between vertical and horizontal scaling.

---

### Q3

Compare:

- Range-based Sharding
- Hash-based Sharding
- Directory-based Sharding

When would you choose each?

---

### Q4

Suppose your application frequently executes:

```sql
SELECT *
FROM Users
WHERE UserID BETWEEN
1000
AND
5000;
```

Which sharding strategy would you recommend?

Why?

---

### Q5

Suppose your application receives millions of random point lookups:

```sql
WHERE UserID = ?
```

Which strategy would you choose?

Why?

---

# Key Takeaways

1. Sharding distributes **data**, not copies.
2. Sharding primarily solves **write scalability** and **storage capacity**.
3. Replication improves **read scalability**; sharding improves **write scalability**.
4. Range sharding is efficient for range queries but can create hot shards.
5. Hash sharding balances load but performs poorly for range queries.
6. Directory-based sharding provides flexible routing through metadata.
7. The shard key should be chosen based on **application access patterns**, not just the schema.
# Chapter 3: Database Replication

# Part 1 – Introduction, Leader-Follower Replication & Read Replicas

---

# 3.1 Why Do We Need Replication?

Let's begin with the simplest possible architecture.

```text
             Users
                │
                ▼
          Application
                │
                ▼
             Database
```

Initially, this works well.

Now imagine Apple's latest iPhone launches.

Traffic suddenly grows from:

```text
5,000 requests/sec

↓

250,000 requests/sec
```

The database is now responsible for serving:

- Product Catalog
- Inventory
- Orders
- User Profiles
- Search
- Warehouse Information

One database is doing everything.

Eventually, it becomes the bottleneck.

---

# 3.2 Problems with a Single Database

A single database introduces three major problems.

---

## Problem 1 – Single Point of Failure

Suppose the database crashes.

```text
Application

↓

Database

↓

💥
```

The result:

- Reads fail
- Writes fail
- Entire application becomes unavailable

One database means one point of failure.

---

## Problem 2 – Read Scalability

Imagine the application receives:

```text
Reads

200,000/sec
```

```text
Writes

500/sec
```

Notice something.

Almost all traffic consists of reads.

Even though writes are low, the database CPU becomes saturated serving:

```sql
SELECT ...
```

queries.

---

### Isn't Cache Enough?

Caching certainly helps.

Suppose Redis serves:

```text
95% of requests
```

Only:

```text
5%
```

reach the database.

Now imagine traffic grows dramatically.

```text
100 Million Requests/sec
```

Even with a 99% cache hit ratio:

```text
1 Million Requests/sec
```

still reach the database.

The cache reduced the load.

It did not eliminate it.

Replication solves a different problem.

Instead of reducing the number of database reads, it increases the database's ability to serve those remaining reads.

Large production systems typically use both caching and replication together.

---

## Problem 3 – Maintenance

Suppose the database needs:

- Security updates
- Hardware replacement
- PostgreSQL upgrade
- Operating system patches

If only one database exists,

maintenance usually means downtime.

Modern production systems try to avoid this whenever possible.

---

# 3.3 What is Replication?

Replication means:

> Maintaining multiple copies of the same data across multiple database servers.

Example:

```text
             Application
                   │
      ┌────────────┴────────────┐
      ▼                         ▼
 Primary Database        Replica Database
```

Both databases contain:

- Users
- Orders
- Products
- Inventory

Everything.

This is **not** sharding.

Replication copies the same data.

Sharding splits data.

We'll study sharding in the next chapter.

---

# 3.4 Leader–Follower Architecture

The most common replication architecture.

Also called:

- Primary–Replica
- Master–Replica
- Leader–Follower

All three terms describe the same idea.

Architecture:

```text
                Application
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
     Primary DB              Replica DB
                                  │
                                  ▼
                            Replica DB
```

---

# 3.5 Responsibilities

## Primary (Leader)

The Primary is responsible for all write operations.

Examples:

```sql
INSERT

UPDATE

DELETE
```

Every write request goes to exactly one database.

This database becomes the single source of truth.

---

## Replica (Follower)

Replicas usually serve read operations.

Example:

```sql
SELECT ...
```

Replicas continuously receive updates from the Primary.

Applications generally do not write directly to replicas.

---

# 3.6 Why Only One Writer?

A common question during interviews is:

> Why not allow every database to accept writes?

Imagine two users update the same product.

Replica 1:

```text
Price = $999
```

Replica 2:

```text
Price = $1099
```

Which value is correct?

How do we resolve conflicts?

How do we guarantee consistency?

These problems become extremely difficult.

Instead, production systems often choose a simpler architecture:

One writer.

Many readers.

This greatly simplifies consistency and conflict resolution.

---

# 3.7 Read Replicas

Suppose the application receives:

```text
200,000 Reads/sec
```

Instead of sending every request to one database:

```text
Application

↓

Primary

↓

200K Reads
```

we distribute the reads:

```text
               Application
          ┌────────┼────────┐
          ▼        ▼        ▼
     Primary   Replica1  Replica2

      20K        90K       90K
```

Read capacity increases significantly without changing application behavior.

---

# 3.8 Benefits of Replication

Replication provides several important benefits.

---

## High Availability

Suppose the Primary crashes.

```text
Primary

↓

💥
```

Healthy replicas still exist.

After failover, one of them can become the new Primary.

The application continues operating with minimal downtime.

---

## Read Scalability

Instead of one database serving every read,

multiple replicas share the workload.

This improves:

- Throughput
- Response time
- Scalability

---

## Easier Maintenance

Suppose Replica 2 needs maintenance.

We temporarily remove it from service.

The remaining databases continue serving traffic.

Users rarely notice.

---

# 3.9 What Should Read from Replicas?

Excellent candidates include:

- Product Catalog
- User Profiles
- Product Search
- Reports
- Analytics
- Historical Data

These operations are typically read-heavy.

---

Poor candidates include:

- Banking balances
- Payment confirmation
- Inventory immediately after purchase
- Password changes
- Recently updated user settings

These often require stronger consistency guarantees.

We'll learn why in Part 2.

---

# 3.10 Apple Example

Consider Apple's Supply Chain platform.

Warehouse employees continuously search:

- Inventory
- Supplier Information
- Product Catalog
- Purchase Orders

Thousands of employees may perform these read operations simultaneously.

Instead of overwhelming one database,

the application distributes read requests across replicas.

Meanwhile,

updates such as:

- Inventory changes
- Supplier updates
- Purchase orders

continue going to the Primary.

This provides excellent scalability while maintaining a single source of truth for writes.

---

# 3.11 Business Impact

Replication improves:

- High Availability
- Read Scalability
- Easier Maintenance
- Better User Experience

Replication does **not** improve:

- Write Scalability
- Storage Capacity

Those problems require different architectural solutions.

---

# 3.12 Critical vs Optional Features

Understanding business requirements helps determine how replication should be used.

---

## Critical Features

Examples:

- Payments
- Inventory Updates
- Banking Transactions
- Password Changes

These operations prioritize correctness over latency.

---

## Optional Features

Examples:

- Product Recommendations
- Analytics
- Reports
- Product Descriptions
- User Activity Feed

These operations often tolerate slight staleness in exchange for better scalability.

---

# 3.13 If This Component Fails

Suppose the Primary crashes.

Without healthy replicas:

- Writes stop
- Application availability decreases
- Maintenance becomes impossible without downtime

With replication:

- Healthy replicas remain available
- Automatic or manual failover restores service
- Downtime is significantly reduced

---

# 3.14 Mental Model

Whenever someone suggests:

> "Let's replicate the database."

Ask:

```text
Which problem are we solving?
```

Possible answers:

- Read Scalability?
- High Availability?
- Easier Maintenance?
- Disaster Recovery?

If the answer is:

> "Too many writes."

Replication is probably not the correct solution.

---

# Interview Questions

## Q1

Suppose your application receives:

```text
Reads = 500,000/sec

Writes = 1,000/sec
```

Would replication help?

Why?

---

## Q2

Why do most production systems allow writes only to the Primary?

What problems would arise if every replica accepted writes?

---

## Q3

Suppose your architecture contains:

```text
Primary

Replica1

Replica2
```

Which requests should be sent to the replicas?

Which requests must always go to the Primary?

Explain your reasoning.

---

# Key Takeaways

1. Replication maintains multiple copies of the same data.

2. The Primary is usually the only database accepting writes.

3. Replicas primarily serve read requests.

4. Replication improves availability, read scalability, and maintenance.

5. Replication does not solve write scalability or storage limitations.

6. Business requirements determine whether replication is the appropriate solution.

---

**Next:** Part 2 – Synchronous vs Asynchronous Replication, Replication Lag, and Read-after-Write Consistency.
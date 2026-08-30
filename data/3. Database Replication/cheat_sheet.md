# Replication Interview Cheat Sheet

> **Purpose**
>
> A quick revision guide before a System Design interview.

---

# 1. Why Replication?

Replication solves:

- High Availability
- Read Scalability
- Easier Maintenance
- Disaster Recovery

Replication does NOT solve:

- Write Scalability
- Storage Capacity

---

# 2. Leader-Follower Architecture

```text
Application

↓

Primary

↓

Replicas
```

Primary:

- INSERT
- UPDATE
- DELETE

Replicas:

- SELECT

One writer.

Many readers.

---

# 3. Read Replicas

Purpose:

Distribute read traffic.

Example:

```text
400K Reads/sec

↓

Primary

Replica1

Replica2
```

Reads are balanced across replicas.

---

# 4. Synchronous Replication

```text
Write

↓

Primary

↓

Replica ACK

↓

Success
```

Advantages:

- Strong consistency
- Lower data loss risk

Disadvantages:

- Higher latency
- Lower write throughput

Suitable for:

- Banking
- Payments
- Inventory

---

# 5. Asynchronous Replication

```text
Write

↓

Primary

↓

Success

↓

Replica
```

Advantages:

- Fast writes
- High throughput

Disadvantages:

- Replication Lag
- Eventual Consistency

Suitable for:

- Social Media
- Product Catalog
- News
- Analytics

---

# 6. Replication Lag

Definition:

Delay between:

```text
Primary Commit

↓

Replica Update
```

Causes:

- Heavy writes
- Slow disks
- Network
- Slow replicas

Business Impact:

- Stale reads
- Incorrect inventory
- Outdated user data

---

# 7. Read-after-Write Consistency

Goal:

A user should immediately see their own updates.

---

## Option 1

Read everything from Primary.

Simple.

Poor scalability.

---

## Option 2

Sticky Session.

Only users who recently wrote temporarily read from the Primary.

Everyone else continues reading from replicas.

Preferred production approach.

---

## Option 3

Accept Eventual Consistency.

Suitable when temporary staleness is acceptable.

---

# 8. Failover

Primary crashes.

↓

Healthy Replica promoted.

↓

New Primary.

Types:

- Manual
- Automatic

---

# 9. Leader Election

Purpose:

Elect exactly one new Primary.

Goal:

Prevent Split Brain.

---

# 10. Split Brain

Multiple databases simultaneously believe they are the Primary.

Consequences:

- Conflicting writes
- Duplicate updates
- Difficult conflict resolution

Prevent it rather than trying to recover from it.

---

# 11. Quorum

Definition:

Majority agreement.

Example:

```text
5 Nodes

↓

Need 3
```

Only the majority partition may elect a new Primary.

---

# 12. Why Odd Number of Nodes?

Example:

```text
5

↓

3 vs 2
```

Avoids ties during voting.

---

# 13. WAL / Binlog

Databases replicate transaction logs,

not the entire database.

Replica says:

```text
Last Transaction

1002
```

Primary sends:

```text
1003

1004

1005
```

Replica replays them.

Efficient and incremental.

---

# 14. Replication Topologies

## Single Leader

One writer.

Many readers.

Simple.

---

## Multi Leader

Multiple Primaries.

Advantages:

- Local writes
- Multi-region support

Trade-off:

Conflict resolution.

---

## Leaderless

No dedicated Primary.

Highest availability.

Highest complexity.

---

# 15. Monitoring

Most Important Metrics:

- Replication Lag
- Replica Health
- Replication Throughput
- Read Distribution
- Failover Time

---

# 16. Production Debugging Checklist

Application returning stale data?

Check:

- Replication Lag?
- Replica Healthy?
- Read Distribution?
- Heavy Writes?
- Slow Replica?
- Network?
- Recent Deployment?
- Recent Failover?

---

# 17. Business Questions

Before choosing a replication strategy ask:

- Read-to-write ratio?
- Can stale reads be tolerated?
- Latency or correctness?
- Automatic or manual failover?
- Multi-region deployment?
- Recovery Time Objective (RTO)?
- Recovery Point Objective (RPO)?

---

# 18. Important Trade-offs

| Choice | Trade-off |
|----------|-----------|
| Async Replication | Faster writes, stale reads |
| Sync Replication | Strong consistency, higher latency |
| Read from Primary | Simpler, poor scalability |
| Sticky Session | Better scalability, more routing logic |
| Automatic Failover | Faster recovery, more complexity |
| Multi-Leader | Lower latency, conflict resolution |
| Leaderless | Highest availability, highest complexity |

---

# 19. Golden Rules

✔ Replication improves read scalability.

✔ Replication does NOT improve write scalability.

✔ Prevent Split Brain at all costs.

✔ Quorum ensures only one leader.

✔ Choose the simplest replication topology that satisfies the business requirements.

✔ Replication introduces consistency and latency trade-offs.

✔ Always understand the business requirements before selecting a replication model.

---

# Common Apple Interview Questions

- Why do we need replication?
- Replication vs Sharding?
- Synchronous vs Asynchronous Replication?
- Explain Replication Lag.
- How do you achieve Read-after-Write Consistency?
- Sticky Session vs Read from Primary?
- Explain Failover.
- Explain Leader Election.
- Explain Split Brain.
- What is Quorum?
- Why use odd number of nodes?
- How does WAL/Binlog replication work?
- Single Leader vs Multi Leader?
- How would you monitor replication?
- What metrics would you track?
- How would you debug stale reads?

---

# One Sentence Summary

> Replication improves availability and read scalability by maintaining multiple copies of the same data, but introduces trade-offs around consistency, failover, leader election, and operational complexity.
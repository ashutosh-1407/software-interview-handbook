# Chapter 3: Database Replication

# Part 4 – Replication Internals, Topologies, Monitoring & Interview Guide

---

# 3.41 How Does Replication Actually Work?

Suppose a user executes:

```sql
UPDATE Products
SET Price = 1099
WHERE ProductID = 10;
```

A common misconception is that the Primary sends this SQL statement to every replica.

In practice, most databases do not replicate by repeatedly executing SQL statements.

Instead, they replicate changes using a transaction log.

---

# 3.42 Write-Ahead Log (WAL)

PostgreSQL uses a:

> **Write-Ahead Log (WAL)**

MySQL uses a:

> **Binary Log (Binlog)**

Think of it as a journal that records every committed transaction.

Example:

```text
Transaction 1001

UPDATE Price
```

```text
Transaction 1002

INSERT Order
```

```text
Transaction 1003

DELETE Product
```

Every committed change is appended to the log.

The database itself is not copied after every write.

---

# Why is this Efficient?

Suppose the database size is:

```text
5 TB
```

A user updates:

```text
Price

999

↓

1099
```

Copying:

```text
5 TB
```

would be extremely slow.

Instead,

the Primary simply sends the new transaction log entry.

Replicas replay the same transaction locally.

This makes replication efficient and scalable.

---

# 3.43 Replica Recovery

Suppose a replica disconnects.

While offline,

the Primary processes:

```text
Transaction

1001

1002

1003

1004

1005
```

The replica reconnects.

Instead of requesting the entire database,

it simply tells the Primary:

```text
Last Transaction Received

1002
```

The Primary responds:

```text
1003

1004

1005
```

The replica replays those transactions.

Its local copy is now synchronized.

---

# Engineering Principle

Logs make recovery incremental.

Instead of copying the entire database,

only missing transactions are transferred.

---

# 3.44 Replication Topologies

So far,

we have studied:

```text
One Primary

↓

Many Replicas
```

This is only one possible architecture.

There are three common replication topologies.

---

# Single Leader Replication

Architecture:

```text
Application

↓

Primary

↓

Replica1

↓

Replica2
```

Characteristics:

Writes:

- Primary

Reads:

- Replicas

Advantages:

- Simple
- Easy consistency model
- Straightforward conflict resolution

Disadvantages:

- Primary is the write bottleneck
- Requires failover when Primary fails

Typical examples:

- PostgreSQL
- MySQL

---

# Multi Leader Replication

Architecture:

```text
US

↓

Primary
```

```text
Europe

↓

Primary
```

Each region accepts writes locally.

Later,

the leaders synchronize with each other.

---

# Advantages

- Lower write latency
- Better multi-region performance
- Improved regional availability

---

# Disadvantages

Conflicts become possible.

Example:

US:

```text
Price = 100
```

Europe:

```text
Price = 120
```

Which value should win?

Conflict resolution now becomes part of the system design.

---

# Typical Use Cases

- Multi-region applications
- Collaborative editing
- Geographically distributed systems

---

# Leaderless Replication (High Level)

Architecture:

```text
Node1

Node2

Node3
```

Every node can accept writes.

There is no dedicated Primary.

---

# Advantages

- Excellent availability
- No leader failover
- No single write bottleneck

---

# Disadvantages

- Complex conflict resolution
- More complicated read logic
- Higher operational complexity

Examples include databases such as:

- Cassandra
- DynamoDB

We will study these architectures later.

---

# Choosing the Right Topology

| Topology | Advantages | Disadvantages | Typical Use Cases |
|-----------|------------|---------------|------------------|
| Single Leader | Simple, easy consistency | Write bottleneck | Traditional OLTP databases |
| Multi Leader | Local writes | Conflict resolution | Multi-region deployments |
| Leaderless | Highest availability | Most complex | Large distributed NoSQL systems |

---

# Engineering Principle

Choose the simplest topology that satisfies the business requirements.

Additional complexity should always be justified by real business needs.

---

# 3.45 Monitoring Replication

Replication should always be monitored in production.

The most important metrics include:

- Replication Lag
- Replica Health
- Read Distribution
- Replication Throughput
- Failover Time

---

# Replication Lag

The most important replication metric.

Example:

```text
Primary

Transaction

5000
```

Replica:

```text
4997
```

Lag:

```text
3 Transactions
```

or

```text
150 ms
```

Large lag increases stale reads.

---

# Replica Health

Questions to monitor:

- Is the replica alive?
- Is replication still running?
- Can it communicate with the Primary?

A healthy-looking replica that stopped replicating can silently become stale.

---

# Read Distribution

Example:

```text
Replica1

95%
```

```text
Replica2

5%
```

Although both replicas are healthy,

traffic is poorly balanced.

One replica becomes overloaded while the other remains mostly idle.

---

# Replication Throughput

Suppose:

Primary:

```text
50K writes/sec
```

Replica:

```text
30K writes/sec
```

Replication lag will continue increasing.

Eventually,

the replica becomes less useful for serving reads.

---

# Failover Time

Measure:

```text
Primary Crash

↓

New Primary Ready
```

Shorter failover generally improves availability.

---

# 3.46 Production Debugging Checklist

Suppose users report stale data.

Before proposing a solution,

investigate systematically.

```text
1. Replication Lag?

↓

2. Replica Healthy?

↓

3. Read Distribution Balanced?

↓

4. Heavy Write Traffic?

↓

5. Network Issues?

↓

6. Slow Replica Hardware?

↓

7. Recent Deployment?

↓

8. Failover Recently Happened?
```

Identify the bottleneck before selecting a solution.

---

# 3.47 Production Scenarios

## Scenario 1

Replication lag suddenly increases:

```text
20 ms

↓

5000 ms
```

Database CPU:

Normal.

Network:

Normal.

Possible causes:

- Replica throughput too low
- Slow storage
- Heavy analytical queries on the replica

---

## Scenario 2

Primary and replicas appear healthy.

Users occasionally see stale profile pictures.

Possible causes:

- Replication lag
- Reads routed to replicas that have not yet caught up

Possible mitigations:

- Read-after-Write Consistency
- Sticky Sessions

---

## Scenario 3

Primary CPU:

```text
100%
```

Replicas:

```text
20%
```

Possible causes:

- Heavy write workload
- Poor read distribution
- Synchronous replication overhead
- Hardware differences

Always investigate before scaling.

---

# 3.48 Critical vs Optional Features

## Critical Features

Examples:

- Payments
- Inventory
- Purchase Orders
- Banking

These often require:

- Strong consistency
- Automatic failover
- Read-after-Write Consistency

---

## Optional Features

Examples:

- Analytics
- Reports
- Product Catalog
- Recommendations

These commonly tolerate:

- Eventual consistency
- Asynchronous replication

---

# 3.49 If Replication Fails

Suppose:

Primary crashes.

No healthy replicas exist.

Possible consequences:

- No writes
- Downtime
- Business interruption
- Manual recovery

Mitigation strategies:

- Multiple replicas
- Continuous monitoring
- Automatic failover
- Disaster recovery planning

---

# 3.50 Business Impact

Replication provides:

- High Availability
- Read Scalability
- Easier Maintenance
- Disaster Recovery

Replication does **not** solve:

- Write Scalability
- Large Dataset Storage

Those problems are addressed using sharding.

---

# 3.51 Mental Model

Whenever someone proposes replication,

ask:

```text
What problem are we solving?
```

Possible answers:

- Read Scalability?
- Availability?
- Maintenance?
- Disaster Recovery?

If the answer is:

```text
Too many writes
```

Replication is probably not the correct solution.

---

# Chapter Summary

Throughout this chapter we learned:

- Why Replication?
- Leader–Follower Architecture
- Read Replicas
- Synchronous Replication
- Asynchronous Replication
- Replication Lag
- Read-after-Write Consistency
- Sticky Sessions
- Failover
- Leader Election
- Split Brain
- Quorum
- WAL / Binlog
- Replication Topologies
- Monitoring
- Production Debugging

---

# Key Takeaways

1. Replication creates multiple copies of the same data.

2. Replication improves availability and read scalability.

3. Replication does not improve write scalability.

4. Consistency and latency are fundamental trade-offs.

5. Preventing Split Brain is more important than recovering from it.

6. Monitor replication continuously in production.

7. Business requirements should always drive architectural decisions.

---

# Final Thoughts

Replication is one of the fundamental building blocks of distributed systems.

It allows applications to remain available during failures while scaling read traffic efficiently.

However,

replication introduces new challenges:

- Replication Lag
- Leader Election
- Quorum
- Split Brain
- Operational Complexity

The best replication strategy is not the most sophisticated one.

It is the one that satisfies the business requirements while remaining simple, reliable, and easy to operate.

---

**End of Chapter 3 – Database Replication**
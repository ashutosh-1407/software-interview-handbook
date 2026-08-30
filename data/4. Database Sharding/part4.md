# Chapter 4: Database Sharding

# Part 4 – Monitoring, Production Debugging & Interview Guide

---

# 4.19 Monitoring a Sharded Database

A sharded database should be continuously monitored.

The goal is to identify:

- Hot shards
- Storage imbalance
- Slow queries
- Cross-shard operations
- Failed rebalancing

before users notice.

---

# Metric 1 – CPU Usage

Example:

```text
Shard1

20%
```

```text
Shard2

18%
```

```text
Shard3

95%
```

Possible causes:

- Hot shard
- Traffic imbalance
- Poor shard key
- Business event
- Hot partition

One overloaded shard while others remain idle is usually a warning sign.

---

# Metric 2 – Storage Usage

Example:

```text
Shard1

5 TB
```

```text
Shard2

18 TB
```

```text
Shard3

6 TB
```

Possible causes:

- Large tenant
- Poor shard key
- Rebalancing overdue
- Uneven data growth

Storage imbalance can increase:

- Backup time
- Restore time
- Maintenance effort

---

# Metric 3 – Query Latency

Example:

```text
Shard1

10 ms
```

```text
Shard2

12 ms
```

```text
Shard3

180 ms
```

Possible causes:

- Hot shard
- Slow disk
- Lock contention
- Network issues
- Long-running queries

---

# Metric 4 – Cross-Shard Query Rate

Yesterday:

```text
3%
```

Today:

```text
40%
```

Possible reasons:

- New feature
- New query pattern
- Poor shard key
- Incorrect routing

Increasing cross-shard queries usually means the application is losing data locality.

---

# Metric 5 – Partition Distribution

Monitor:

- Number of partitions per shard
- Partition sizes
- Partition CPU
- Partition traffic

Sometimes only one partition is responsible for most of the load.

---

# Metric 6 – Rebalancing Activity

Track:

- How often rebalancing occurs
- Data migrated
- Migration duration
- Failed migrations

Frequent rebalancing may indicate that the chosen shard key is no longer appropriate.

---

# 4.20 Production Debugging Checklist

Suppose users report:

> "The application feels slow."

Before proposing solutions, investigate systematically.

```text
1. CPU balanced?

↓

2. Storage balanced?

↓

3. Query latency?

↓

4. Hot partition?

↓

5. Cross-shard queries?

↓

6. Recent deployment?

↓

7. Recent business event?

↓

8. Rebalancing recently completed?

↓

9. Replication healthy?

↓

10. Directory Service healthy?
```

Never jump directly to a solution.

---

# 4.21 Production Scenarios

## Scenario 1

Monitoring shows:

```text
Shard1

20%
```

```text
Shard2

95%
```

```text
Shard3

18%
```

Possible hypotheses:

- Hot shard
- Hot partition
- Poor shard key
- Traffic imbalance

Investigate before scaling.

---

## Scenario 2

Traffic is balanced.

Storage:

```text
Shard2

25 TB
```

Others:

```text
5 TB
```

Possible explanations:

- One tenant stores significantly more data
- Poor shard key
- Rebalancing has not occurred
- Uneven data growth

---

## Scenario 3

Most point queries are fast.

However:

```sql
SELECT *
FROM Users
WHERE Country='USA'
```

takes:

```text
3 seconds
```

Possible explanation:

The query spans multiple shards because:

```text
Country
```

is not the shard key.

---

## Scenario 4

Cross-shard queries suddenly increase from:

```text
3%

↓

45%
```

Possible causes:

- New feature
- Changed query pattern
- Different access pattern
- Poor routing logic

---

## Scenario 5

One partition suddenly receives:

```text
85%
```

of all requests.

Adding another shard alone does **not** solve the problem.

If the hotspot belongs to one partition,

the hotspot simply moves.

Possible mitigations:

- Cache
- Read Replicas
- Application Cache
- CDN
- Revisit the shard key

---

# 4.22 Failure Scenarios

## Shard Failure

Suppose:

```text
Shard3

↓

Crash
```

Without replication:

All data stored on that shard becomes unavailable.

With replication:

A replica can be promoted,

allowing requests to continue.

---

## Directory Service Failure

Suppose:

```text
Application

↓

Directory Service

↓

Unavailable
```

The application can no longer determine:

```text
Where does User123 live?
```

Production systems therefore:

- Replicate the Directory Service
- Cache routing metadata locally
- Version the Partition Map

The routing layer should never become a single point of failure.

---

## Failed Partition Migration

Suppose:

```text
Partition35

↓

Migrating
```

Power failure occurs.

Good production systems:

- Record migration state
- Resume incomplete migrations
- Validate copied data
- Update routing only after successful validation

---

# 4.23 Business Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Sharding | Write scalability | Operational complexity |
| Range Sharding | Fast range queries | Hot shards |
| Hash Sharding | Even distribution | Poor range queries |
| Directory Routing | Flexible routing | Metadata management |
| Virtual Partitions | Easier rebalancing | More metadata |
| Data Locality | Faster business operations | Harder shard key design |
| Cross-Shard Transactions | Correctness | Higher latency & complexity |

---

# 4.24 Critical vs Optional Features

## Critical

Examples:

- Payments
- Inventory
- Financial Transfers
- Purchase Orders

Goals:

- Strong consistency
- Minimize cross-shard transactions
- High availability

---

## Optional

Examples:

- Analytics
- Reports
- Product Search
- Recommendations

These may tolerate:

- Cross-shard queries
- Eventual consistency
- Higher latency

---

# 4.25 Mental Model

Whenever someone proposes sharding,

ask these questions:

```text
Why are we sharding?
```

↓

Storage?

Write throughput?

---

```text
What is the shard key?
```

↓

Why was it chosen?

---

```text
Does it optimize the common queries?
```

---

```text
Does it optimize the common business transactions?
```

---

```text
What happens if one shard becomes hot?
```

---

```text
How will we rebalance?
```

---

```text
How are cross-shard queries handled?
```

---

```text
How are cross-shard transactions handled?
```

---

If you can confidently answer those questions,

you understand the architecture.

---

# Chapter Summary

In this chapter we learned:

- Why Sharding
- Storage vs Write Scalability
- Vertical vs Horizontal Scaling
- Range-based Sharding
- Hash-based Sharding
- Directory-based Routing
- Partition Maps
- Virtual Partitions
- Hot Shards
- Rebalancing
- Data Locality
- Cross-Shard Queries
- Cross-Shard Transactions
- Two-Phase Commit (High Level)
- Monitoring
- Production Debugging

---

# Engineering Principles

### Principle 1

Identify the bottleneck before choosing the solution.

---

### Principle 2

Choose the shard key based on application access patterns.

---

### Principle 3

Optimize for the most common and latency-sensitive queries.

---

### Principle 4

Keep related data together whenever possible.

(Maximize Data Locality.)

---

### Principle 5

Move metadata before moving data whenever possible.

---

### Principle 6

Minimize data movement during rebalancing.

---

### Principle 7

Distributed transactions should be avoided whenever practical.

---

### Principle 8

Good shard keys optimize both:

- Queries
- Business operations

---

# Interview Questions

### Q1

Why would you shard a database instead of adding more replicas?

---

### Q2

Compare:

- Range
- Hash
- Directory-based Sharding

---

### Q3

What is a Hot Shard?

How would you investigate it?

---

### Q4

Explain:

- Directory Service
- Partition Map
- Virtual Partitions

How do they work together?

---

### Q5

Why are Cross-Shard Queries expensive?

---

### Q6

Why are Cross-Shard Transactions difficult?

How does Two-Phase Commit help?

---

### Q7

What metrics would you monitor in a sharded database?

---

### Q8

How would you debug one shard showing:

```text
95% CPU
```

while all others remain below:

```text
20%
```

---

### Q9 (Apple-style)

Apple's Supply Chain database is sharded by:

```text
WarehouseID
```

One warehouse receives:

```text
50×

```

more traffic during a product launch.

Walk through:

- Investigation
- Root cause analysis
- Possible solutions
- Trade-offs

---

# Key Takeaways

1. Sharding distributes data across multiple databases.
2. It primarily solves write scalability and storage capacity.
3. Choosing the correct shard key is the most important design decision.
4. Data Locality reduces both cross-shard queries and cross-shard transactions.
5. Virtual Partitions minimize data movement during rebalancing.
6. Monitoring is as important as the architecture itself.
7. Business requirements should always drive sharding decisions.

---

# Final Thought

Sharding is one of the most powerful techniques for scaling distributed systems.

However,

it also introduces some of the most difficult engineering challenges:

- Choosing the right shard key
- Rebalancing data
- Preserving data locality
- Coordinating distributed transactions
- Operating a distributed database in production

The goal is **not** to build the most sophisticated sharding strategy.

The goal is to build the **simplest architecture that satisfies the business requirements while minimizing operational complexity.**
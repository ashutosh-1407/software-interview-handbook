# Database Sharding Cheat Sheet

---

# When to Use Sharding

Use sharding when a single database becomes the bottleneck for:

- Write throughput
- Storage capacity

Sharding is NOT the first solution for read scalability.

For read-heavy workloads:

Cache → Replication → Sharding (only if necessary)

---

# Sharding vs Replication

| Replication | Sharding |
|-------------|----------|
| Copies data | Splits data |
| Improves reads | Improves writes |
| Improves availability | Improves storage capacity |
| Every replica has all data | Every shard has part of the data |

---

# Vertical vs Horizontal Scaling

Vertical Scaling

- Bigger server
- Simple
- Hardware limits

Horizontal Scaling (Sharding)

- Multiple databases
- Better write scalability
- Better storage scalability
- More operational complexity

---

# Sharding Strategies

## Range-based

Example:

UserID

1–1M

↓

Shard1

Pros

- Excellent for range queries
- Simple routing

Cons

- Hot shards

---

## Hash-based

Hash(UserID) % N

Pros

- Uniform distribution
- Good for random lookups

Cons

- Poor range queries
- Naive modulo causes massive reshuffling when shard count changes

---

## Directory-based

Application

↓

Directory Service

↓

Partition Map

↓

Shard

Pros

- Flexible routing
- Easy rebalancing
- No application code changes

Cons

- Additional metadata layer
- Directory must be highly available

---

# Hot Shards

Definition

One shard receives a disproportionately large percentage of traffic.

Possible causes

- Poor shard key
- Range-based growth
- Business events
- Hot partition

Adding another shard alone usually does NOT solve a hot partition.

---

# Rebalancing

Definition

Redistributing data across shards to balance:

- Storage
- Traffic

Goal

Move as little data as possible.

---

# Partition Map

Maps:

Partition

↓

Shard

Stored inside:

Directory Service

Changing the map changes routing.

The application does not need code changes.

---

# Virtual Partitions

Instead of:

4 Shards

↓

4 Partitions

Use:

4 Shards

↓

100+ Virtual Partitions

Benefits

- Small migrations
- Easier rebalancing
- Better load distribution

---

# Data Migration

Updating metadata does NOT move data.

Typical migration:

1. Mark partition as migrating
2. Copy data
3. Validate copy
4. Update Partition Map
5. Delete old copy

---

# Cross-Shard Query

Touches multiple shards.

Example

SELECT *
FROM Users
WHERE Country='USA'

Problems

- Multiple network calls
- Higher latency
- Result aggregation
- More CPU

---

# Cross-Shard Transaction

Touches multiple shards.

Example

Transfer money:

Shard1

↓

Deduct

Shard2

↓

Credit

Needs coordination.

---

# Two-Phase Commit (High Level)

Phase 1

Prepare

↓

Everyone Ready?

Phase 2

Commit

↓

Everyone commits

Limitations

- Higher latency
- Coordinator can block progress
- Operational complexity

---

# Data Locality

Definition

Store data frequently accessed together on the same shard.

Example

User

Orders

Shopping Cart

↓

Same shard

Benefits

- Faster queries
- Fewer distributed transactions
- Simpler application logic

---

# Monitoring

Monitor

- CPU per shard
- Storage per shard
- Query latency
- Cross-shard query %
- Partition distribution
- Rebalancing activity

---

# Production Debugging

High CPU

↓

Hot shard?

↓

Hot partition?

↓

Poor shard key?

↓

Traffic imbalance?

---

High Storage

↓

Large tenant?

↓

Poor shard key?

↓

Rebalancing overdue?

---

High Cross-Shard Queries

↓

New feature?

↓

Changed query pattern?

↓

Wrong shard key?

---

# Engineering Principles

1. Identify the bottleneck before changing the architecture.

2. Sharding solves write scalability and storage capacity.

3. Choose the shard key based on application access patterns.

4. Optimize the most common and latency-sensitive queries.

5. Maximize data locality.

6. Minimize cross-shard queries.

7. Minimize cross-shard transactions.

8. Move metadata before moving data.

9. Move as little data as possible during rebalancing.

10. Good shard keys optimize both queries and business operations.

---

# Interview Flow

Need more reads?

↓

Cache

↓

Replication

Need more writes?

↓

Sharding

Choose shard key

↓

Common queries?

↓

Business transactions?

↓

Data locality?

Need rebalancing?

↓

Virtual partitions

↓

Partition map

↓

Move small partitions

Cross-shard query?

↓

Accept?

↓

Optimize?

↓

Redesign shard key?

Cross-shard transaction?

↓

Avoid if possible

↓

Otherwise use distributed transaction protocol

---

# Apple-Style Thinking

Always ask:

- What is the bottleneck?
- Why are we sharding?
- What is the access pattern?
- What business operation is most common?
- Is the hotspot one partition or many?
- Will rebalancing actually solve it?
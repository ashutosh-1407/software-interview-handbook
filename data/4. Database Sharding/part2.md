# Chapter 4: Database Sharding

# Part 2 – Hot Shards, Rebalancing & Virtual Partitions

---

# 4.9 Hot Shards

Initially, suppose traffic is evenly distributed.

```text
Shard1

33%
```

```text
Shard2

33%
```

```text
Shard3

34%
```

Everything is balanced.

---

Several months later,

one shard suddenly receives:

```text
Shard1

15%
```

```text
Shard2

80%
```

```text
Shard3

5%
```

Storage is healthy.

Memory is healthy.

Only one shard is overloaded.

This is called:

> **Hot Shard**

---

# Definition

A **Hot Shard** is a shard that receives a disproportionately large percentage of traffic compared to the other shards.

Just like a **Hot Key** in Redis,

except now the hotspot is an entire shard.

---

# Why Do Hot Shards Occur?

Several reasons can cause one shard to receive significantly more traffic.

---

## Reason 1 – Poor Shard Key

Suppose we shard by:

```text
Country
```

Most customers are from:

```text
USA
```

Result:

```text
USA

↓

Shard1
```

Everything else:

```text
Europe

↓

Shard2
```

```text
Asia

↓

Shard3
```

Most traffic now goes to Shard1.

---

## Reason 2 – Range-based Sharding

Suppose:

```text
Shard1

1–1M
```

```text
Shard2

1M–2M
```

```text
Shard3

2M–3M
```

New users always receive increasing UserIDs.

Eventually,

almost every new write goes to:

```text
Shard3
```

Creating a hot shard.

---

## Reason 3 – Business Events

Suppose Apple launches a new iPhone.

Millions of users suddenly request:

```text
ProductID = iPhone
```

If that product belongs to one shard,

that shard becomes overloaded.

Notice:

The shard key was not necessarily wrong.

The workload changed.

---

# Engineering Principle

Always identify **why** the shard became hot before choosing a solution.

---

# 4.10 Rebalancing

Definition:

> **Rebalancing is the process of redistributing data across shards to achieve a more even distribution of storage and/or traffic.**

Notice:

Rebalancing may be triggered because of:

- Storage imbalance
- Traffic imbalance
- Both

---

Example:

Initially:

```text
Shard1

40%
```

```text
Shard2

40%
```

```text
Shard3

20%
```

A fourth shard is added.

After rebalancing:

```text
Shard1

25%
```

```text
Shard2

25%
```

```text
Shard3

25%
```

```text
Shard4

25%
```

The workload is now evenly distributed.

---

# The Problem with Naïve Hashing

Suppose routing is performed using:

```text
Hash(UserID) % 3
```

User:

```text
UserID = 100
```

Suppose:

```text
Hash(100) = 1000
```

Current routing:

```text
1000 % 3 = 1

↓

Shard1
```

Now a fourth shard is added.

Routing becomes:

```text
1000 % 4 = 0

↓

Shard0
```

That user moved.

Imagine:

```text
100 Million Users
```

Most routing decisions change.

Most rows must move.

This is extremely expensive.

---

# Why is Moving Database Data Expensive?

Unlike cache entries,

database rows may contain:

- Foreign keys
- Secondary indexes
- Transactions
- Large objects
- Relationships

Migrating millions of rows may take hours or days.

---

# Engineering Principle

> **Moving data is expensive.**

A good sharding strategy minimizes how much data must move when the cluster changes.

---

# 4.11 Directory-based Routing

Instead of computing the destination shard,

introduce a routing component.

```text
Application

↓

Directory Service

↓

Shard
```

The application asks:

```text
Where is User123?
```

The directory responds:

```text
Shard2
```

The application no longer computes routing itself.

---

# Benefits

- Flexible routing
- Easy rebalancing
- No application code changes when data moves

---

# 4.12 Partition Maps

The Directory Service maintains metadata describing where partitions are located.

Example:

| Partition | Shard |
|-----------|-------|
| P1 | Shard1 |
| P2 | Shard2 |
| P3 | Shard2 |
| P4 | Shard1 |

The application follows:

```text
Key

↓

Partition

↓

Shard
```

The Partition Map can be updated without changing application code.

---

# Important Observation

The **Directory Service** is the component.

The **Partition Map** is the metadata maintained by that component.

Think of:

- Google Maps = Service
- Road Map = Data

The same relationship exists here.

---

# 4.13 Virtual Partitions

Suppose four physical shards exist.

Instead of creating four partitions,

the system creates:

```text
100 Partitions
```

Example:

```text
Partitions

1–25

↓

Shard1
```

```text
26–50

↓

Shard2
```

```text
51–75

↓

Shard3
```

```text
76–100

↓

Shard4
```

Each physical shard owns many smaller logical partitions.

---

# Why?

Suppose Shard2 becomes overloaded.

Without virtual partitions,

the only option is moving everything owned by Shard2.

With virtual partitions,

move only:

```text
Partition35

↓

Shard5
```

Now:

Shard2 owns:

```text
26–34

36–50
```

Shard5 owns:

```text
35
```

Only a small amount of data moves.

---

# Important Clarification

Updating the Partition Map does **not** instantly move the data.

Production systems generally perform:

1. Update migration state.
2. Copy data in the background.
3. Verify copied data.
4. Update the Partition Map.
5. Delete the old copy.

The metadata coordinates the migration.

The data still needs to be copied.

---

# Virtual Partitions vs Consistent Hashing

The philosophy is very similar.

Redis:

```text
Virtual Nodes

↓

Move fewer cache keys
```

Databases:

```text
Virtual Partitions

↓

Move less database data
```

Different implementations.

Same objective.

---

# Engineering Principle

> **Move metadata before moving data whenever possible.**

Changing metadata is fast.

Moving terabytes of data is not.

---

# Apple Example

Suppose Apple's Supply Chain database initially contains:

```text
4 Physical Shards
```

Instead of creating:

```text
4 Partitions
```

Apple creates:

```text
400 Virtual Partitions
```

Each shard initially owns:

```text
100 Partitions
```

Next year,

a fifth database server is added.

Instead of moving:

25% of the entire dataset,

only a small number of virtual partitions need to be migrated.

This greatly reduces migration time and operational risk.

---

# Interview Questions

### Q1

What is a Hot Shard?

List three possible causes.

---

### Q2

Why doesn't adding another shard automatically solve every Hot Shard problem?

---

### Q3

Why is naïve hashing (`Hash(Key) % N`) problematic when shards are added or removed?

---

### Q4

Explain the relationship between:

- Directory Service
- Partition Map
- Virtual Partitions

---

### Q5

Updating a Partition Map is very fast.

Why must production systems still move data?

---

### Q6

How are Virtual Partitions conceptually similar to Virtual Nodes used in Consistent Hashing?

---

# Key Takeaways

1. Hot Shards occur when one shard receives a disproportionate amount of traffic.
2. Rebalancing distributes storage and/or traffic more evenly across shards.
3. Naïve modulo hashing causes excessive data movement when the number of shards changes.
4. Directory Services separate routing logic from application code.
5. Partition Maps describe where each partition currently resides.
6. Virtual Partitions minimize data movement during rebalancing.
7. Metadata changes coordinate migrations, but the underlying data must still be copied.
8. Modern distributed systems aim to move **as little data as possible** during scaling operations.
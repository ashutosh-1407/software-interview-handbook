# Chapter 3: Database Replication

# Part 3 – Failover, Leader Election, Split Brain & Quorum

---

# 3.26 High Availability

One of the biggest reasons for using replication is improving availability.

Suppose we have:

```text
              Application
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    Primary                Replica1
                                 │
                                 ▼
                             Replica2
```

Everything is working normally.

Now imagine the Primary suddenly crashes.

```text
Primary

↓

💥
```

Should the entire application stop working?

Ideally, no.

Replication allows another database to take over.

---

# 3.27 Failover

Definition:

> **Failover is the process of promoting a healthy replica to become the new Primary after the current Primary becomes unavailable.**

Example:

Before:

```text
Primary

↓

Replica1

↓

Replica2
```

After failover:

```text
Replica1 (New Primary)

↓

Replica2
```

Applications now send all writes to the new Primary.

---

# 3.28 Manual vs Automatic Failover

There are two common approaches.

---

## Manual Failover

Example:

```text
Primary crashes

↓

Alert Generated

↓

Engineer investigates

↓

Replica promoted

↓

Application resumes
```

Advantages:

- Human verification
- Lower chance of incorrect failover

Disadvantages:

- Higher downtime
- Slower recovery

Suitable for:

- Internal dashboards
- Reporting systems
- Non-critical business applications

---

## Automatic Failover

Example:

```text
Primary crashes

↓

Health Checks

↓

Leader Election

↓

Replica promoted

↓

Application resumes
```

Advantages:

- Faster recovery
- Minimal downtime

Disadvantages:

- Operational complexity
- Incorrect failover can be dangerous

Suitable for:

- Banking
- E-commerce
- Supply Chain
- Customer-facing applications

---

# 3.29 Health Checks

How does the system know the Primary is unavailable?

Typically through periodic heartbeat messages.

Example:

```text
Replica

↓

PING Primary
```

Primary responds:

```text
OK
```

Everything is healthy.

---

Suppose:

```text
PING

↓

No Response
```

Should the replica immediately assume the Primary has failed?

Usually not.

One missed heartbeat could simply be:

- Temporary network congestion
- Brief CPU spike
- Short network interruption

Production systems typically require multiple consecutive missed heartbeats before initiating failover.

This reduces false failovers.

---

# 3.30 The Problem with Immediate Promotion

Suppose the Primary crashes.

Replica1 immediately promotes itself.

Sounds reasonable.

Now imagine something more complicated.

At exactly the same time:

- Primary becomes unreachable.
- Replica1 loses communication with Replica2.

Replica1 now thinks:

> "The Primary is gone. I should become the new Primary."

Meanwhile,

Replica2 also cannot reach the Primary.

Replica2 thinks:

> "The Primary is gone. I should become the new Primary."

Now both replicas promote themselves.

---

# 3.31 Split Brain

Definition:

> **Split Brain occurs when two or more database nodes simultaneously believe they are the Primary and begin accepting writes independently.**

Example:

```text
Replica1

↓

Primary
```

and simultaneously:

```text
Replica2

↓

Primary
```

Both databases now accept writes.

This is one of the most dangerous failure modes in distributed systems.

---

# Why is Split Brain Dangerous?

Suppose:

Replica1 accepts:

```text
Inventory = 90
```

Replica2 accepts:

```text
Inventory = 85
```

Later,

the network is restored.

Question:

Which inventory value is correct?

Neither replica knows which update should win.

Conflict resolution becomes extremely difficult.

Preventing Split Brain is much easier than repairing it afterward.

---

# 3.32 Leader Election

To avoid Split Brain,

replicas must agree on exactly one node to become the new Primary.

This process is called:

> **Leader Election**

Definition:

> Leader Election is the process by which distributed systems agree on exactly one leader after the previous leader becomes unavailable.

Notice the keyword:

**agree**.

A replica does not become Primary simply because it cannot see the old Primary.

---

# 3.33 Quorum

How do replicas agree?

Using a majority vote.

This majority is called a:

> **Quorum**

Example:

Suppose the cluster contains:

```text
Primary

Replica1

Replica2

Replica3

Replica4
```

Total:

```text
5 Nodes
```

Majority:

```text
3 Nodes
```

A replica only participates in leader election if it can communicate with a majority of the configured cluster members.

---

# Important Observation

A node does **not** ask:

> "What is happening on the other side of the network?"

Instead, every node already knows:

```text
Cluster Size = 5
```

It simply counts:

```text
How many members can I currently communicate with?
```

If:

```text
Reachable Nodes

=

3
```

Quorum exists.

If:

```text
Reachable Nodes

=

2
```

No quorum.

The node must not become the Primary.

---

# 3.34 Network Partition

Suppose the network splits.

Partition A:

```text
Primary

Replica1
```

Partition B:

```text
Replica2

Replica3

Replica4
```

Neither partition can communicate with the other.

Question:

Which partition should continue accepting writes?

Answer:

Only the partition containing the majority.

In this example:

```text
Replica2

Replica3

Replica4
```

contains:

```text
3 of 5 nodes
```

It has quorum.

It may elect a new Primary.

The smaller partition must stop accepting writes,

even though the original Primary is still physically alive.

This prevents Split Brain.

---

# 3.35 Why Odd Number of Nodes?

Suppose we have:

```text
4 Nodes
```

Possible vote:

```text
2

vs

2
```

Tie.

No decision.

Now suppose we have:

```text
5 Nodes
```

Possible vote:

```text
3

vs

2
```

A majority always exists.

This is why distributed systems commonly use:

- 3 Nodes
- 5 Nodes
- 7 Nodes

instead of even numbers.

---

# 3.36 Apple Example

Suppose Apple's Supply Chain database is replicated across multiple data centers.

During a network issue,

one data center becomes isolated.

Rather than allowing both sides to continue accepting writes,

only the partition with quorum elects a new Primary.

The isolated partition temporarily rejects writes,

preventing inconsistent inventory updates across warehouses.

---

# 3.37 Critical vs Optional Features

## Critical Features

Examples:

- Inventory Updates
- Payments
- Purchase Orders
- Banking Transactions

These require:

- Automatic Failover
- Leader Election
- Split Brain Prevention

---

## Optional Features

Examples:

- Reports
- Analytics
- Historical Dashboards

These may tolerate:

- Manual Failover
- Longer Recovery Time

---

# 3.38 If Leader Election Fails

Suppose no partition has quorum.

Example:

```text
5 Nodes

↓

Only 2 Reachable
```

Result:

- No new Primary
- Writes are temporarily unavailable
- Reads may still continue depending on the application

This behavior is intentional.

Temporary unavailability is usually safer than Split Brain.

---

# 3.39 Business Impact

Automatic failover provides:

- Higher Availability
- Faster Recovery
- Better User Experience

It also introduces:

- Greater operational complexity
- Leader Election
- Quorum management
- Health monitoring

Again,

business requirements determine whether the added complexity is justified.

---

# 3.40 Mental Model

Whenever designing replication,

ask yourself:

```text
What happens if the Primary disappears?
```

The answer should include:

- Health Checks
- Failover
- Leader Election
- Quorum
- Split Brain Prevention

If your design cannot answer these questions,

the replication architecture is incomplete.

---

# Interview Questions

## Q1

Why shouldn't a replica promote itself after a single missed heartbeat?

Explain the risks.

---

## Q2

Explain Split Brain.

Why is it considered one of the most dangerous failures in distributed systems?

---

## Q3

Suppose a cluster contains:

```text
5 Nodes
```

A network partition divides the cluster into:

```text
2 Nodes

and

3 Nodes
```

Which partition should continue accepting writes?

Why?

---

## Q4

Why do distributed systems often use an odd number of nodes?

---

# Key Takeaways

1. Replication improves availability through failover.

2. Multiple missed heartbeats are usually required before declaring a Primary unavailable.

3. Leader Election ensures only one node becomes the new Primary.

4. Quorum requires agreement from a majority of cluster members.

5. Preventing Split Brain is more important than recovering from it.

6. Temporary write unavailability is often preferable to data inconsistency.

---

**Next:** Part 4 – WAL, Replication Topologies, Monitoring & Production Debugging.
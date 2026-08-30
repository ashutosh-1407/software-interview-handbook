# Event Streaming — Cheat Sheet

## Core Mental Model

Producer
    ↓
Event Stream
    ↓
Partitions
    ↓
Consumer Groups
    ↓
Consumers
    ↓
Downstream

---

## Event vs Message

**Message**
> "Do this work."

**Event**
> "This happened."

---

## Queue vs Event Stream

**Traditional Queue**
> Distribute work among competing workers.

**Event Stream**
> Retain events and allow independent consumer groups to process them.

---

## Partition

> **Ordering boundary + parallelism**

Events within a partition are ordered.

There is generally **no global ordering across partitions**.

---

## Partition Key

Determines which partition an event goes to.

For per-order ordering:

partition_key = order_id

Same order → same partition → ordered processing.

Different orders → potentially different partitions → parallel processing.

---

## Global vs Per-Key Ordering

**Global ordering**
→ Strong ordering  
→ Less parallelism  
→ Lower potential throughput

**Per-key ordering**
→ Ordering for each business entity  
→ Different keys can process concurrently  
→ Higher throughput

> Prefer per-key ordering when the business allows it.

---

## Offset

> Consumer's position within a partition.

E1 → E2 → E3 → E4 → E5
0     1     2     3     4

**Partition = ordering**

**Offset = position**

---

## Consumer Group

A consumer group is an independent processing workload.

Different groups maintain independent positions.

Event Stream
    ├── Analytics Group
    ├── Fraud Group
    └── Notification Group

The same event can be processed once by each group.

---

## Consumers Within a Group

Consumers within the same group share the workload.

P0 → C1
P1 → C2
P2 → C3
P3 → C4

Typically:

> One partition → one active consumer within a group.

More consumers than partitions → some consumers remain idle.

---

## Retention

> Determines how long events remain available.

Consumption does **not necessarily delete the event**.

Retention is commonly based on:

- Time
- Size
- Platform-specific policies

---

## Replay

Because events are retained, consumers can recover or reprocess.

Recovery:

Failure
  ↓
Resume from committed position
  ↓
Catch up

Reprocessing:

Earlier position
  ↓
Replay events
  ↓
Rebuild/correct state

Replay is limited by retention.

---

## Consumer Failure

Consumer fails
    ↓
Partition ownership changes
    ↓
Rebalance
    ↓
New consumer takes partition
    ↓
Resume from committed offset

The new consumer does not need the old consumer's memory/state to know where to continue.

---

## Rebalancing

> Redistributes partition ownership among consumers in a group.

Rebalancing can temporarily hurt throughput because:

- Partition ownership changes
- Consumers may receive additional partitions
- Processing can temporarily pause/reorganize
- Remaining consumers may become overloaded

---

## Consumer Lag

> How far a consumer group is behind the latest events.

Always consider:

- Current lag
- Lag trend
- Oldest event age
- Producer rate
- Consumer throughput

Important:

Lag shrinking → catching up

Lag growing → falling behind

A large backlog that is shrinking may be healthier than a small backlog that is rapidly growing.

---

## Scaling Consumers

Add consumers when:

- Consumers are the bottleneck
- Work can be parallelized
- Enough partitions exist
- Downstream can handle more traffic

Do **not** blindly add consumers when:

- Downstream is saturated
- A partition is hot
- Work cannot be parallelized

> **Find the bottleneck before scaling.**

---

## Scaling Partitions

Adding partitions can increase potential parallelism.

But it does **not** solve a downstream bottleneck.

More partitions
      ↓
More consumers
      ↓
More DB traffic
      ↓
Saturated DB
      ↓
Same bottleneck

Partition count should be driven by:

- Throughput
- Parallelism
- Ordering requirements
- Consumer capacity
- Expected growth

---

## Hot Partition

> A partition receiving disproportionate traffic/work.

Example:

P0 → 10K/sec
P1 → 1K/sec
P2 → 1K/sec
P3 → 1K/sec

Adding consumers may not solve it because the hot partition still has one active owner within the group.

Investigate:

- Partition key
- Hot keys
- Traffic distribution
- Processing cost

---

## Backpressure

> Limit processing so downstream systems are not overwhelmed.

Consumer
    ↓
Reduce concurrency
    ↓
Database protected
    ↓
Consumer lag temporarily grows

Once downstream capacity improves:

Increase consumer capacity
    ↓
Drain backlog

---

## Producer vs Consumer Rate

If:

Producer > Consumer

→ Backlog grows.

If:

Producer < Consumer

→ Backlog can shrink.

Permanent mismatch requires:

- More consumer/downstream capacity
- Producer throttling
- Processing optimization
- Or a combination

---

## Retry

For transient failures:

Failure
  ↓
Retry
  ↓
Exponential backoff
  ↓
Retry

Examples:

- HTTP 503
- Temporary network failure
- Temporary database outage

Avoid immediate retry storms.

---

## DLQ

For repeatedly or permanently failing events:

Event
  ↓
Retry
  ↓
Retry exhausted
  ↓
DLQ

DLQ allows:

- Investigation
- Isolation
- Correction
- Replay

---

## Poison Event

> An event that repeatedly fails processing.

Don't allow it to consume normal consumer capacity indefinitely.

Move it to a DLQ or equivalent isolation mechanism when appropriate.

---

## At-Least-Once Processing

Typical reliable flow:

Read event
    ↓
Process event
    ↓
Processing succeeds
    ↓
Commit offset

If processing succeeds but commit fails:

Event processed
    ↓
Commit fails
    ↓
Consumer crashes
    ↓
Event processed again

Therefore duplicates are possible.

---

## Idempotent Consumer

> Processing the same event multiple times produces the same business effect as processing it once.

Example:

First processing
    → Deduct $100

Duplicate processing
    → Already processed
    → No additional deduction

---

## Exactly-Once Business Effect

Don't confuse this with exactly-once delivery.

At-least-once delivery
        +
Idempotent consumer
        ↓
Exactly-once business effect

The message may be processed multiple times, but the business state changes only once.

---

## Idempotency vs Ordering

**Idempotency**
→ Protects against duplicate effects.

**Ordering**
→ Protects against incorrect event sequence.

They solve different problems.

---

## Downstream Bottleneck

Example:

Producer = 50K/sec
Consumer = 50K/sec
DB capacity = 30K/sec

Don't add consumers.

Instead:

Reduce consumer concurrency
        ↓
Protect DB
        ↓
Lag grows temporarily
        ↓
Scale/optimize DB
        ↓
Increase consumers
        ↓
Drain backlog

---

## Event Streaming Design Checklist

Ask:

1. Do multiple independent consumers need the event?
2. Is replay required?
3. How long should events be retained?
4. What ordering is required?
5. What should the partition key be?
6. Can the key create hot partitions?
7. How many partitions are needed?
8. How many consumers per group?
9. What happens when a consumer fails?
10. What happens when downstream fails?
11. What delivery semantics are required?
12. How will duplicate processing be handled?
13. What retry policy is needed?
14. When should messages go to a DLQ?
15. How will lag and backlog age be monitored?

---

## Senior-Level Rules

> **Events represent facts, not tightly coupled workflows.**

> **Partitions provide ordering boundaries and parallelism.**

> **Consumer groups provide independent processing.**

> **Retention enables replay and recovery.**

> **Per-key ordering is usually preferable to global ordering when possible.**

> **Scale the actual bottleneck, not blindly the consumers.**

> **Protect downstream systems with backpressure.**

> **Assume duplicate processing under at-least-once semantics.**

> **Use idempotency to achieve exactly-once business effects.**

> **Monitor lag trends, not just current lag.**

---

## Final Mental Model

Producer
    ↓
Event Stream
    ↓
Partitions
    ↓
Consumer Groups
    ↓
Consumers
    ↓
Downstream

Partitions     → Ordering + Parallelism
Offsets        → Consumer Progress
Groups         → Independent Consumption
Retention      → Replay + Recovery
Lag            → Processing Delay
Backpressure   → Downstream Protection
Idempotency    → Duplicate Safety
DLQ            → Failed Event Isolation

> **Event streaming = retained event history + partitioned ordering + independent consumer progress + replay.**
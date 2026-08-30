# Message Queues — Interview Cheat Sheet

## Core Mental Model

Producer
    ↓
Queue / Stream
    ↓
Consumers
    ↓
Downstream

Queue = decoupling + buffering + async processing.

> A queue absorbs temporary spikes; it does NOT create capacity.

---

## Work Queue vs Event Stream

### Work Queue
Use when:
- One worker should process each job
- No replay needed
- No independent consumer positions
- Simple work distribution

Think:

> "Distribute work."

### Event Stream
Use when:
- Multiple independent consumers need the same event
- Replay/retention is needed
- Consumers need independent positions
- Per-key ordering is needed

Think:

> "Retain and distribute events."

---

## Reliability

### At-most-once
0 or 1 delivery

→ May lose work  
→ Avoids duplicates

### At-least-once
1+ deliveries

→ Doesn't intentionally lose work  
→ Duplicates possible

### Exactly-once business effect

Multiple deliveries
        ↓
Same final business result as once

Usually achieved with:

> At-least-once + idempotent consumer

---

## Idempotency

Same operation executed multiple times
        ↓
Same business effect as executing once

Example:

payment_id = PAY123

Already processed?
    → Skip
Not processed?
    → Process + record result

Use a durable idempotency key/state.

---

## Retry

### Retry transient failures

Examples:
- Timeout
- HTTP 503
- Temporary network failure
- Temporary downstream overload

### Don't blindly retry permanent failures

Examples:
- Malformed payload
- Missing required field
- Invalid data

Retry pattern:

Failure
  ↓
Backoff
  ↓
Retry
  ↓
Retry limit
  ↓
DLQ

Use:

> Exponential backoff + jitter

to avoid retry storms.

---

## DLQ

Repeated/permanent failure
        ↓
       DLQ
        ↓
 Investigate
        ↓
   Fix problem
        ↓
     Replay

DLQ prevents poison messages from consuming normal worker capacity.

---

## Partitions

Partitioning provides:

> Parallelism + ordering boundary

Common model:

P1 → C1
P2 → C2
P3 → C3
P4 → C4

4 partitions + 10 consumers
→ only 4 consumers can actively own partitions in that consumer group.

---

## Consumer Groups

One stream:

             ┌── Group A → Analytics
Producer ────┼── Group B → Fraud
             └── Group C → Notifications

Each consumer group has an independent position.

Use multiple groups when different applications need to process the same events independently.

---

## Partition Key

Determines which partition receives a message.

Need order per order?

→ partition key = order_id

Need order per user?

→ partition key = user_id

> Ordering is generally within a partition, NOT globally.

---

## Hot Partition

One partition receives disproportionate traffic/work.

Example:

P1 → 10K/sec
P2 → 1K/sec
P3 → 1K/sec
P4 → 1K/sec

P1 becomes the bottleneck.

More consumers may NOT help.

---

## Consumer Lag

How far a consumer group is behind.

For partitioned systems:

> Monitor lag per partition + per consumer group.

Don't look at lag alone.

Also check:

- Producer rate
- Consumer throughput
- Lag trend
- Oldest message age
- Downstream latency

Large backlog ≠ automatically unhealthy.

Growing backlog → problem.

Shrinking backlog → catching up.

---

## Scaling

Don't immediately say:

> "Add consumers."

First identify the bottleneck:

Producer
   ↓
Queue
   ↓
Consumers
   ↓
Downstream
   ↓
Database

Ask:

1. Is producer rate increasing?
2. Are consumers the bottleneck?
3. Are there enough partitions?
4. Is there a hot partition?
5. Is downstream the bottleneck?
6. Can downstream handle more concurrency?

> Find the bottleneck before scaling.

---

## Backpressure

Downstream capacity < upstream workload

→ Limit consumer concurrency
→ Throttle producer
→ Prioritize important work
→ Shed optional work

Goal:

> Don't let upstream work overwhelm downstream capacity.

---

## Production Incident Answer

If queue/lag is increasing:

1. Compare producer vs consumer rate.
2. Check whether lag is growing or shrinking.
3. Check oldest message age.
4. Identify consumer/partition/downstream bottleneck.
5. Scale if safe.
6. Protect downstream.
7. Apply backpressure/throttling if necessary.

---

# 10-Second Memory Model

Queue:
> Decouple + Buffer

ACK:
> "I processed it."

At-least-once:
> Duplicates possible

Idempotency:
> Duplicate delivery → one business effect

Retry:
> Transient failure

Backoff + jitter:
> Don't create retry storm

DLQ:
> Failed messages leave normal path

Partition:
> Parallelism + ordering boundary

Consumer group:
> Independent processing position

Lag:
> How far behind?

Backpressure:
> Don't overwhelm downstream

Scaling:
> Find bottleneck first

Architecture:
> Keep it as simple as requirements allow.
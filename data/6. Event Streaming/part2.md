# Event Streaming — Part 2: Partitions, Ordering & Consumer Groups

## 6.23 Why Do We Need Partitions?

A single event stream can become a throughput bottleneck if all events must be processed sequentially.

Without partitioning:

Producer
    ↓
Single Stream
    ↓
Consumer

With partitions:

Producer
    ↓
Event Stream
    │
    ├── Partition 0
    ├── Partition 1
    ├── Partition 2
    └── Partition 3

Different partitions can be processed concurrently.

Therefore:

> Partitions provide parallelism while also creating an ordering boundary.

---

## 6.24 Partition Ordering

Events within a partition have an ordered sequence.

Example:

Partition 0:

E1 → E2 → E3 → E4 → E5

A consumer processes them in that sequence.

However, different partitions can be processed concurrently:

Partition 0:

E1 → E2 → E3

Partition 1:

E4 → E5 → E6

There is no automatic global ordering between Partition 0 and Partition 1.

Therefore:

> Ordering is generally guaranteed within a partition, not across the entire stream.

---

## 6.25 Global Ordering vs Per-Key Ordering

### Global Ordering

Every event in the entire stream must have one strict order.

Example:

E1 → E2 → E3 → E4 → E5

This limits parallelism because events cannot freely be processed independently.

### Per-Key Ordering

Only events belonging to the same entity need to remain ordered.

Example:

Order A:

A1 → A2 → A3

Order B:

B1 → B2 → B3

Order A and Order B can potentially be processed concurrently.

Therefore:

> Prefer per-key ordering when the business requirement allows it.

---

## 6.26 Partition Key

A partition key determines which partition receives an event.

Conceptually:

partition = hash(partition_key) % number_of_partitions

Example:

partition_key = order_id

Then:

Order 123
    ↓
Partition 2

Order 123 events:

OrderCreated
OrderPaid
OrderShipped
OrderDelivered

can all be routed to the same partition.

This allows their relative ordering to be preserved.

---

## 6.27 Choosing a Partition Key

The partition key should be based on the business ordering requirement.

Ask:

- What needs to be ordered?
- Do we need global or per-key ordering?
- What entity represents the ordering stream?
- Will the key distribute traffic evenly?
- Can one key become extremely hot?

Examples:

Order-level ordering:

partition_key = order_id

User-level ordering:

partition_key = user_id

The key should provide the required ordering while avoiding unnecessary traffic imbalance.

---

## 6.28 Partition Key Does Not Need Global Uniqueness

A partition key does not necessarily need to be globally unique.

What matters is that it identifies the ordering stream we care about.

For example:

If we need all events for a particular order to remain ordered:

partition_key = order_id

The important requirement is that all events belonging to the same ordering stream use the same key.

In practice, an `order_id` is normally unique anyway.

---

## 6.29 Hot Partition

A hot partition occurs when one partition receives significantly more traffic or expensive work than others.

Example:

Partition 0 → 10K/sec
Partition 1 → 1K/sec
Partition 2 → 1K/sec
Partition 3 → 1K/sec

Partition 0 becomes the bottleneck.

This is similar to a hot shard in a database.

Possible causes:

- Poor partition-key distribution
- One extremely active key
- Sudden traffic concentration
- More expensive processing for certain events

---

## 6.30 Why Hot Partitions Are Difficult

Suppose:

Partitions = 4
Consumers = 4

P0 → C1
P1 → C2
P2 → C3
P3 → C4

If P0 is extremely busy:

P0 → 10K/sec
P1 → 1K/sec
P2 → 1K/sec
P3 → 1K/sec

Adding more consumers may not solve the problem because P0 is still assigned to one consumer within the consumer group.

The bottleneck is the hot partition, not the total number of consumers.

---

## 6.31 Consumer Groups and Partition Ownership

Within a consumer group, a common model is:

> One partition is assigned to one consumer at a time.

Example:

4 partitions:

P0
P1
P2
P3

4 consumers:

C1
C2
C3
C4

Possible assignment:

P0 → C1
P1 → C2
P2 → C3
P3 → C4

Each consumer processes its assigned partitions.

---

## 6.32 More Consumers Than Partitions

Suppose:

Partitions = 4
Consumers = 10

Possible assignment:

P0 → C1
P1 → C2
P2 → C3
P3 → C4

C5-C10 remain idle.

Therefore:

> Adding consumers beyond the number of partitions does not automatically increase parallelism.

If more parallelism is required, increasing partition count may be necessary.

However, partition-count changes should be considered carefully because they can affect distribution, ownership, ordering behavior, and rebalancing depending on the streaming system.

---

## 6.33 Consumer Groups Provide Independent Positions

Suppose:

Partition 0:

E1 E2 E3 E4 E5 E6 E7 E8

Consumer groups:

Analytics → offset 4
Fraud → offset 7
Email → offset 2

Each group maintains its own position.

Therefore:

Analytics can be behind while Fraud is caught up.

The progress of one consumer group does not determine the progress of another.

---

## 6.34 Consumers Within a Group Share Work

Suppose:

4 partitions:

P0
P1
P2
P3

Two consumers in the same group:

C1
C2

A possible assignment:

P0 → C1
P1 → C1
P2 → C2
P3 → C2

C1 and C2 collectively process the group's workload.

They do not each process every event.

This is different from having two separate consumer groups.

---

## 6.35 Multiple Consumer Groups

Suppose:

OrderPlaced
    ↓
Event Stream
    │
    ├── Analytics Group
    ├── Fraud Group
    └── Notification Group

Each group independently consumes the same events.

For one event:

Analytics → processes once
Fraud → processes once
Notification → processes once

Therefore:

> The same event can be processed once per consumer group.

---

## 6.36 Fan-Out

Multiple consumer groups create a fan-out architecture.

Example:

OrderPlaced
      ↓
  Event Stream
      │
      ├── Analytics
      ├── Fraud
      ├── Notification
      └── Recommendation

The producer publishes the event once.

Different consumer groups independently react to it.

This avoids requiring the producer to directly call every downstream application.

---

## 6.37 Consumer Failure

Suppose:

P0 → C1
P1 → C2
P2 → C3

C2 crashes.

P1 becomes unavailable to the group until ownership is reassigned.

The consumer group detects the membership change and performs a rebalance.

Conceptually:

C2 fails
    ↓
Group detects membership change
    ↓
Rebalance
    ↓
P1 assigned to another consumer
    ↓
New consumer resumes from committed offset

The events in P1 are not lost simply because C2 failed.

They remain available according to the stream's retention policy.

---

## 6.38 Rebalancing

Rebalancing is the process of redistributing partition ownership among consumers in a consumer group.

Before:

P0 → C1
P1 → C2
P2 → C3

C2 fails.

After rebalance:

P0 → C1
P1 → C3
P2 → C1

The exact assignment and rebalancing behavior depends on the streaming system.

Important:

> Rebalancing is a real operational event because it can affect throughput, processing latency, and consumer lag.

---

## 6.39 Why Rebalancing Can Increase Lag

Before failure:

P0 → C1 → ~33%
P1 → C2 → ~33%
P2 → C3 → ~34%

C2 fails.

After reassignment:

P0 ─┐
    ├── C1 → ~66%
P1 ─┘

P2 → C3 → ~34%

C1 now has significantly more work.

If C1's processing capacity has not changed, it may not keep up with the incoming traffic.

Therefore:

C1 overloaded
    ↓
Processing rate falls behind
    ↓
Consumer lag increases

This is why consumer failure can affect system throughput beyond simply losing one consumer.

---

## 6.40 Rebalancing Is System-Dependent

Do not make universal claims about exactly how rebalancing behaves.

The exact behavior depends on:

- Messaging system
- Consumer-coordination mechanism
- Partition assignment strategy
- Rebalancing implementation

A safe interview statement is:

> Rebalancing can temporarily affect processing and increase lag because partition ownership is being reassigned; the exact behavior depends on the streaming system.

---

## 6.41 Partition Ownership vs Consumer Position

These are two different concepts.

### Partition Ownership

Answers:

> Which consumer is responsible for this partition right now?

Example:

P1 → C3

### Consumer Position

Answers:

> How far has this consumer group progressed through the partition?

Example:

P1 → committed offset 900K

A new consumer can take ownership of P1 without knowing anything about the previous consumer's memory.

It reads the consumer group's committed position and resumes from there.

---

## 6.42 Recovery After Consumer Failure

Suppose:

P1:

E1 E2 E3 ... E900K E900K+1 ...

Committed position:

E900K

Consumer crashes.

New consumer takes ownership:

New Consumer
    ↓
Reads committed position
    ↓
Resumes from next position
    ↓
Continues processing

The old consumer's memory or local state is not required to determine where the consumer group should continue.

---

## 6.43 Failure Between Processing and Commit

Suppose:

E900K

Consumer:

Process E900K
    ↓
Processing succeeds
    ↓
Commit offset
    ↓
Commit fails
    ↓
Consumer crashes

The replacement consumer may process E900K again.

This is expected under at-least-once processing.

Therefore:

> Consumers should be idempotent when duplicate processing cannot be tolerated.

---

## 6.44 Why Process Before Commit?

Consider two possible orders.

### Process → Commit

Process E5
    ↓
Commit E5

Failure between the two:

Process succeeds
Commit fails
    ↓
E5 may be processed again

Result:

Possible duplicate

### Commit → Process

Commit E5
    ↓
Process E5

Failure between the two:

Commit succeeds
Process fails
    ↓
E5 may be skipped

Result:

Potentially lost business effect

For reliability-sensitive processing, we generally prefer:

> Process → Commit

and use idempotency to handle duplicates.

---

## 6.45 Consumer Lag

Consumer lag represents how far a consumer group is behind the latest available events.

Example:

Partition:

E1 E2 E3 E4 E5 E6 E7 E8

Consumer processed:

E1 E2 E3 E4 E5

Lagging events:

E6 E7 E8

For partitioned systems, monitor:

- Lag per partition
- Lag per consumer group

---

## 6.46 Lag Must Be Interpreted With Rates

Suppose:

Producer = 100K/sec
Consumer = 150K/sec
Current lag = 100K

The consumer is faster than the producer.

Lag can shrink.

But:

Producer = 100K/sec
Consumer = 50K/sec
Current lag = 100K

Lag continues growing.

Therefore:

> A large backlog can be healthy if it is shrinking, while a small backlog can be dangerous if it is growing rapidly.

Also consider:

- Producer rate
- Consumer throughput
- Lag trend
- Oldest event age
- Downstream latency
- Consumer resource utilization

---

## 6.47 Oldest Event Age

Another useful metric is the age of the oldest unprocessed event.

Example:

Lag = 100K
Oldest event = 1 second

The consumer may be catching up quickly.

Another system:

Lag = 10K
Oldest event = 30 minutes

This may be much more concerning if the business requires low processing latency.

Therefore:

> Monitor both backlog size and backlog age.

---

## 6.48 Event Streaming Scaling

When consumer lag increases, do not immediately add consumers.

Investigate:

1. Producer rate
2. Consumer throughput
3. Partition count
4. Partition distribution
5. Hot partitions
6. Consumer CPU/memory
7. Downstream latency
8. Downstream capacity

If consumers are the bottleneck and the workload can be parallelized:

Scale consumers.

If partitions are the constraint:

Consider partition scaling, subject to the messaging system's behavior and ordering requirements.

If downstream is the bottleneck:

Protect or scale downstream rather than blindly adding consumers.

---

## 6.49 Partitioning Trade-Off

Partitioning gives us:

> Parallelism + ordering boundary

But it creates a trade-off.

More partitions:

    ↓
More parallelism
    ↓
Higher potential throughput

But:

    ↓
More complex ownership/rebalancing
    ↓
More operational complexity

And strict global ordering becomes harder.

Therefore:

> Partition based on actual ordering and throughput requirements, not simply because more partitions seem better.

---

## 6.50 Global Ordering Trade-Off

Suppose the business requires:

> Every event across the entire system must be processed in one strict order.

Multiple partitions make this difficult because each partition has its own sequence.

Example:

P0:
A1 → A2 → A3

P1:
B1 → B2 → B3

There is no natural global sequence between:

A2 and B1

To enforce global ordering, we must constrain parallelism or introduce additional coordination.

This reduces throughput.

---

## 6.51 Per-Key Ordering Trade-Off

Suppose the requirement is only:

> Events for the same order must remain ordered.

Use:

partition_key = order_id

Then:

Order A
    ↓
Partition 0
    ↓
A1 → A2 → A3

Order B
    ↓
Partition 1
    ↓
B1 → B2 → B3

The two orders can be processed concurrently.

This gives:

- Ordering for each order
- Parallel processing across orders
- Higher throughput

Therefore:

> Per-key ordering is usually preferable to global ordering when the business requirement allows it.

---

## 6.52 Production Mental Model

When designing or debugging an event-stream system, think in this order:

Producer
    ↓
Partitions
    ↓
Consumer Groups
    ↓
Consumers
    ↓
Downstream

Ask:

1. How fast are events produced?
2. How are events partitioned?
3. What ordering is required?
4. How many partitions exist?
5. How many consumers exist per group?
6. Is there a hot partition?
7. Is consumer lag increasing?
8. Is downstream limiting throughput?
9. Can the workload be safely parallelized?
10. What happens when a consumer fails?

---

# Interview Cheat Sheet — Part 2

### Why partitions?

> Parallelism + ordering boundary.

### Where is ordering guaranteed?

> Generally within a partition, not globally across partitions.

### What is a partition key?

> The key used to determine which partition receives an event.

### How preserve order for an order?

> Use `order_id` as the partition key.

### Does a partition key need to be globally unique?

> No. It needs to identify the ordering stream we want to preserve.

### What is a hot partition?

> A partition receiving disproportionate traffic or expensive work and becoming a bottleneck.

### Can more consumers solve a hot partition?

> Not necessarily; one partition is generally assigned to one consumer within a group at a time.

### 4 partitions + 10 consumers?

> At most 4 consumers can actively own partitions in the common one-consumer-per-partition-per-group model.

### What is a consumer group?

> Consumers that share the workload and maintain an independent position from other groups.

### What happens when a consumer fails?

> Its partitions can be reassigned during rebalancing, and the new owner resumes from the group's committed offsets.

### What is rebalancing?

> Redistributing partition ownership among consumers in a group.

### Why can rebalancing hurt performance?

> Ownership changes can temporarily affect processing and shift more workload onto remaining consumers, increasing lag.

### What is consumer lag?

> How far a consumer group is behind the latest events.

### What should I check besides lag?

> Producer rate, consumer throughput, lag trend, oldest event age, partition distribution, and downstream capacity.

### Global vs per-key ordering?

> Global ordering limits parallelism; per-key ordering allows different keys to be processed concurrently.

### Most important partition principle?

> **Use partitions to get the parallelism you need while preserving only the ordering the business actually requires.**
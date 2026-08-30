# Message Queues — Part 3: Partitions, Ordering & Consumer Groups

## 34. Traditional Work Queue vs Partitioned/Event-Stream Architecture

There are two important mental models.

### Traditional Work Queue

The goal is to distribute work among workers.

Producer
    ↓
Queue
    ↓
    ├── Worker 1
    ├── Worker 2
    ├── Worker 3
    └── Worker 4

Each message generally needs to be processed by only one worker.

Example:

10M Images
    ↓
Image Processing Queue
    ↓
Workers

If each image only needs to be processed once, a traditional work queue is usually the simpler choice.

We don't necessarily need:
- message replay
- independent consumer positions
- multiple independent consumers processing the same message
- partition-based ordering

Use the simplest architecture that satisfies the requirements.

---

### Partitioned/Event-Stream Architecture

Sometimes the same event needs to be processed independently by multiple consumers.

Example:

                ┌── Consumer Group A → Analytics
                │
Producer → Stream ── Consumer Group B → Fraud Detection
                │
                └── Consumer Group C → Notifications

Each consumer group can maintain its own position in the stream.

This is useful when:
- multiple applications need the same events
- consumers process events independently
- consumers may operate at different speeds
- messages need to be retained for replay
- ordering is required within a particular key

Kafka is a common example of this architecture.

---

## 35. Why Do We Need Partitions?

Suppose we have one queue/stream and one consumer.

Queue
  ↓
Consumer

If we need more throughput, we can parallelize the work.

Partitioning divides the stream into independent partitions:

                 ┌── Partition 1
Producer → Stream ├── Partition 2
                 ├── Partition 3
                 └── Partition 4

Consumers can process different partitions concurrently.

This provides a mechanism for scaling throughput while also giving us an ordering boundary.

---

## 36. Partition Ownership

A common model is:

> A partition is assigned to one consumer within a consumer group at a time.

Example:

Partitions = 4
Consumers  = 10

P1 → C1
P2 → C2
P3 → C3
P4 → C4

C5 - C10 → idle

Therefore, adding more consumers does not necessarily increase throughput.

If there are only 4 partitions, at most 4 consumers in that consumer group can actively process partitions concurrently under this model.

This is why partition count can become a scaling constraint.

---

## 37. Consumer Groups

A consumer group is a set of consumers working together to process a stream.

Within one consumer group:

Partition 1 → Consumer 1
Partition 2 → Consumer 2
Partition 3 → Consumer 3
Partition 4 → Consumer 4

A partition is generally processed by only one consumer in that group at a time.

But different consumer groups can independently consume the same stream.

Example:

                    ┌── Group A → Analytics
                    │
Producer → Stream ───┼── Group B → Fraud
                    │
                    └── Group C → Notification

Each group maintains its own position.

Therefore:

- Group A can be ahead.
- Group B can be behind.
- Group C can process the same events independently.

---

## 38. Why Consumer Groups Are Useful

Suppose an `OrderCreated` event needs to be used by three different systems:

OrderCreated
     ↓
   Stream
     │
     ├── Analytics
     ├── Fraud Detection
     └── Notification

We don't want one consumer to process the message and prevent the other applications from seeing it.

Instead:

Consumer Group A → Analytics
Consumer Group B → Fraud
Consumer Group C → Notification

Each group independently consumes the event.

This is one of the major differences between a simple work queue and an event-stream architecture.

---

## 39. Partition Key

A partition key determines which partition receives a message.

Example:

partition = hash(order_id) % number_of_partitions

If we use:

order_id

as the partition key, all events for the same order can be routed to the same partition.

Example:

Order 123
   ↓
Partition 2

Order 123 - Created
Order 123 - Paid
Order 123 - Shipped
Order 123 - Delivered

Because they belong to the same partition, their relative order can be preserved.

---

## 40. Per-Key Ordering

Suppose we have:

Order 123:
Created
Paid
Shipped
Delivered

We want these events processed in order.

Using:

partition_key = order_id

can ensure that events for the same order go to the same partition.

Therefore:

Order 123
    ↓
Partition 2
    ↓
Created
Paid
Shipped
Delivered

The important idea is:

> Partitioning provides an ordering boundary.

We generally get ordering within a partition, not automatically across the entire stream.

---

## 41. Global Ordering vs Per-Key Ordering

These are very different requirements.

### Global ordering

Every message in the entire system must be processed in exactly the same order.

M1 → M2 → M3 → M4 → M5

This severely limits parallelism.

### Per-key ordering

Only messages belonging to the same key need to maintain order.

Example:

User A:
A1 → A2 → A3

User B:
B1 → B2 → B3

User A and User B can potentially be processed concurrently.

Therefore:

> Prefer per-key ordering when the business requirement allows it.

---

## 42. Choosing a Partition Key

The partition key should be chosen based on the application's requirements.

Ask:

- What needs to be ordered?
- Do we need global ordering or per-key ordering?
- What entity represents the ordering stream?
- How evenly will the key distribute traffic?
- How frequently will messages arrive?
- Can one key become extremely hot?

Example:

If all messages for an order must be ordered:

partition key = order_id

If all messages for a user must be ordered:

partition key = user_id

The correct choice depends on the business requirement.

---

## 43. Hot Partition

A poor partition key can create a hot partition.

Example:

Partition 1 → 10K msg/sec
Partition 2 → 1K msg/sec
Partition 3 → 1K msg/sec
Partition 4 → 1K msg/sec

Partition 1 becomes the bottleneck.

Adding consumers may not help if the hot partition can only be assigned to one consumer in the group.

This is similar to a hot shard in a database.

---

## 44. Why Can't We Just Add Consumers?

Suppose:

Partitions = 4
Consumers = 10

Only 4 consumers can actively own partitions:

P1 → C1
P2 → C2
P3 → C3
P4 → C4

C5-C10 → idle

Adding more consumers does not help.

If we need more parallelism, we may need more partitions.

However:

> Increasing partitions is an architectural decision, not something to do blindly.

The partition key, ordering requirements, redistribution behavior, and operational characteristics need to be understood first.

---

## 45. Consumer Lag

For a partitioned stream, consumer lag measures how far behind a consumer group is from the latest available messages.

Conceptually:

Producer
   ↓
Partition
   ↓
Messages: 1 2 3 4 5 6 7 8 9 10

Consumer has processed:
1 2 3 4 5

Lag:
6 7 8 9 10

Lag tells us that the consumer is behind the producer.

---

## 46. Queue Depth vs Consumer Lag

These metrics are related but should not be treated as identical.

### Queue depth

How many messages are currently waiting in a queue.

It is commonly useful for a traditional work queue.

Example:

Queue
 ├── Message
 ├── Message
 ├── Message
 └── Message

Depth = 4

### Consumer lag

In a partitioned stream, we generally care about how far a particular consumer group is behind, often per partition.

Example:

Partition 1 → Group A lag = 100
Partition 2 → Group A lag = 20
Partition 3 → Group A lag = 5
Partition 4 → Group A lag = 5000

This tells us much more than a single aggregate queue-depth number.

Therefore:

> For partitioned systems, consumer lag per partition and per consumer group is often a critical metric.

---

## 47. Why Consumer Lag Needs Context

Suppose:

Consumer lag = 100K messages

That number alone doesn't tell us whether the system is healthy.

We also need to know:

- producer rate
- consumer processing rate
- whether lag is increasing or decreasing
- lag per partition
- downstream latency
- consumer resource utilization

Example:

Producer = 100K/sec
Consumer = 150K/sec
Lag = 100K

The backlog can shrink.

But:

Producer = 100K/sec
Consumer = 50K/sec
Lag = 100K

The backlog will continue growing.

---

## 48. Hot Partition Diagnosis

Suppose:

P1 lag = 10
P2 lag = 20
P3 lag = 100,000
P4 lag = 15

Consumers have healthy CPU and memory.

A likely explanation is a hot partition.

We should investigate:

- Is P3 receiving more traffic?
- Did the traffic pattern recently change?
- Is the partition key creating an imbalance?
- Is P3's workload different?
- Is a downstream dependency slowing processing for P3?

Adding more consumers may not help if the bottleneck is the partition itself.

---

## 49. Scaling a Partitioned Consumer

Suppose:

Partitions = 4
Consumers = 4

and each consumer processes:

1K messages/sec

Total throughput is approximately:

4K messages/sec

If we increase consumers to 8:

Partitions = 4
Consumers = 8

we still have only 4 active partition owners.

Therefore, throughput may remain approximately:

4K messages/sec

To get more parallelism, we may need more partitions.

But increasing partitions may have consequences depending on the messaging system and its partitioning/rebalancing semantics.

---

## 50. Traditional Queue Scaling vs Partitioned Scaling

### Traditional work queue

Scaling is primarily achieved by adding workers:

Queue
  ↓
├── Worker 1
├── Worker 2
├── Worker 3
└── Worker 4

Each worker can pick up independent work.

### Partitioned stream

Scaling is constrained by partitions:

Partition 1 → Consumer 1
Partition 2 → Consumer 2
Partition 3 → Consumer 3
Partition 4 → Consumer 4

More consumers than partitions may leave consumers idle.

Therefore:

> Traditional queues primarily scale through workers, while partitioned streams scale through a combination of partitions and consumers.

---

## 51. Choosing Between the Two

Ask what the business actually requires.

### Use a traditional work queue when:

- one worker should process each job
- replay is not required
- independent consumer positions are unnecessary
- ordering is not important
- simple work distribution is sufficient

Example:

10M image-processing jobs
        ↓
     Queue
        ↓
     Workers

### Use a partitioned event stream when:

- multiple independent consumers need the same event
- consumers need independent positions
- events need to be retained/replayed
- per-key ordering matters
- high throughput requires partition-level parallelism

Example:

OrderCreated
      ↓
   Event Stream
      │
      ├── Analytics
      ├── Fraud
      └── Notifications

---

## 52. The Simplest-Architecture Principle

Do not choose a partitioned event-stream architecture just because it is powerful.

Ask:

> What capabilities does the business actually require?

If the requirement is simply:

Distribute 10M jobs
        ↓
Each job processed once
        ↓
Workers

a traditional work queue may be sufficient.

There may be no reason to introduce:

- partitions
- consumer groups
- event retention
- replay
- independent consumer positions

if the application does not need them.

Therefore:

> **Choose the simplest architecture that satisfies the business requirements.**

---

## 53. Core Mental Model

Remember these distinctions:

### Traditional Work Queue

Producer
    ↓
Queue
    ↓
Workers

Goal:

> Distribute work.

---

### Partitioned Event Stream

Producer
    ↓
Partitions
    ↓
Consumer Groups

Goal:

> Retain and distribute events independently while supporting scalable parallel processing and ordering boundaries.

---

### Consumer Group

Consumers working together to process partitions.

---

### Partition Key

Determines which partition receives a message.

---

### Partition Ordering

Ordering is generally guaranteed within a partition, not automatically across all partitions.

---

### Consumer Lag

How far a consumer group is behind the latest available messages.

---

### Hot Partition

A partition receiving disproportionate traffic or expensive work and becoming a bottleneck.

---

# Interview Cheat Sheet — Part 3

### When should I use a traditional work queue?

When each job needs to be processed by one worker and you don't need replay or independent consumer positions.

### When should I use an event stream?

When multiple independent consumers need the same events, events need retention/replay, or partition-based ordering/scaling is required.

### What is a partition?

An independent ordered sequence within a partitioned stream.

### Why use partitions?

To provide parallelism and an ordering boundary.

### Can 10 consumers process 4 partitions concurrently?

Under the common one-consumer-per-partition-per-group model, only 4 consumers can actively process partitions at a time.

### What is a consumer group?

A group of consumers that collectively process partitions, with each partition assigned to one consumer in that group at a time.

### Why use multiple consumer groups?

To allow different applications to independently process the same events.

### What does a partition key do?

It determines which partition receives a message.

### How do I preserve order for an order?

Use `order_id` as the partition key so all events for that order go to the same partition.

### Do partitions provide global ordering?

No. They generally provide ordering within each partition.

### What is a hot partition?

A partition receiving disproportionately high traffic or expensive work and becoming a bottleneck.

### Does adding consumers always solve consumer lag?

No. If the number of consumers exceeds the number of partitions, additional consumers may be idle. A hot partition may also remain a bottleneck.

### What is consumer lag?

How far a consumer group is behind the latest messages, typically measured per partition.

### Queue depth vs consumer lag?

Queue depth is useful for understanding backlog in a traditional queue. In partitioned systems, consumer lag per partition and consumer group gives a more useful picture.

### What is the most important architecture principle?

> **Choose the simplest architecture that satisfies the business requirements.**
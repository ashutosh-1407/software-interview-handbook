# Event Streaming — Part 1: Fundamentals

## 6.1 What Is Event Streaming?

Event streaming is an architecture where events are continuously produced, stored, and consumed by one or more independent consumers.

An event represents something that has already happened.

Example:

Order Service
    ↓
OrderPlaced
    ↓
Event Stream
    ├── Analytics
    ├── Fraud Detection
    └── Notification

The producer publishes the event without needing to know exactly which consumers will use it.

The stream retains events according to its retention policy, allowing consumers to process them independently and replay historical events when needed.

---

## 6.2 Message vs Event

A message in a traditional work queue generally represents:

> "Here is some work that needs to be done."

Example:

GenerateInvoice(order_id=123)
    ↓
Queue
    ↓
Worker

An event represents:

> "Something happened."

Example:

OrderPlaced(order_id=123)
    ↓
Event Stream
    ├── Analytics
    ├── Fraud
    └── Notification

The distinction is important because an event can be consumed independently by multiple applications.

---

## 6.3 Traditional Work Queue vs Event Stream

### Traditional Work Queue

The primary goal is to distribute work.

Producer
    ↓
Queue
    ↓
├── Worker 1
├── Worker 2
├── Worker 3
└── Worker 4

A message is generally processed by one worker in the work queue.

Use this when:

- Each job needs to be processed by one worker
- Replay is not required
- Independent consumer positions are unnecessary
- Simple work distribution is sufficient

Think:

> "Distribute work."

---

### Event Stream

The primary goal is to retain and distribute events independently.

Producer
    ↓
Event Stream
    │
    ├── Analytics
    ├── Fraud
    └── Notifications

Use this when:

- Multiple independent consumers need the same event
- Consumers need independent positions
- Events need to be retained/replayed
- Per-key ordering matters
- High throughput requires partition-level parallelism

Think:

> "Retain and distribute events independently."

---

## 6.4 Why Event Streaming?

Consider:

Order Service
    ↓
OrderPlaced
    ↓
Event Stream
    ├── Analytics
    ├── Fraud
    └── Notification

Each consumer can process the event independently.

If Analytics is temporarily unavailable:

OrderPlaced
    ├── Analytics → DOWN
    ├── Fraud → continues
    └── Notification → continues

Analytics can later resume from its previous position and process the events it missed.

This provides:

- Loose coupling
- Independent processing
- Failure isolation
- Replay
- Consumer-specific progress

---

## 6.5 Event Retention

One of the key differences from a traditional work queue is that events can remain in the stream after a consumer processes them.

Example:

Event Stream
    ↓
E1 E2 E3 E4 E5 E6 E7 E8

Analytics processes:

E1 → E2 → E3 → E4 → E5

But the events do not necessarily disappear.

They remain available according to the stream's retention policy.

Retention is commonly based on:

- Time
- Storage size
- Or a combination of policies

Therefore:

> Event processing does not necessarily determine when an event is deleted.

The retention policy determines how long the event remains available.

---

## 6.6 Retention vs Consumption

Traditional work queue:

Message
    ↓
Worker
    ↓
Process
    ↓
ACK
    ↓
Message generally leaves the normal queue

Event stream:

Event
    ↓
Retained in stream
    ↓
Consumer processes it
    ↓
Consumer advances its position
    ↓
Event remains available until retention expires

This separation is fundamental.

> Consumption and retention are independent concepts.

---

## 6.7 Consumer Position

Each consumer group maintains its own position in the stream.

Example:

Event Stream:

E1 E2 E3 E4 E5 E6 E7 E8

Consumer groups:

Analytics → E5
Fraud → E7
Email → E3

The groups can be at different positions.

For example:

Analytics:
    processed through E5

Fraud:
    processed through E7

Email:
    processed through E3

The same stream can therefore support consumers operating at different speeds.

---

## 6.8 Offsets

A consumer's position in a partition is typically represented using an offset.

Example:

Partition 0

Offset:
  0    1    2    3    4    5
  ↓    ↓    ↓    ↓    ↓    ↓
  E1   E2   E3   E4   E5   E6

The offset identifies a position within the ordered sequence of a partition.

Important distinction:

> Partition provides the ordering boundary; offset provides the position within that ordering.

---

## 6.9 Offset Is Not the Same as Ordering

Offsets do not create ordering.

The partition provides the ordered sequence:

E1 → E2 → E3 → E4 → E5

The offsets identify positions:

0 → 1 → 2 → 3 → 4

Therefore:

- Partition → ordering boundary
- Offset → position in that ordering
- Consumer offset → how far the consumer has progressed

With multiple partitions:

Partition 0:
E1 → E2 → E3

Partition 1:
E4 → E5 → E6

There is no automatic global ordering between the two partitions.

---

## 6.10 Durable Consumer Position

A consumer's position needs to survive failures and restarts.

If the position exists only in memory:

Consumer
    ↓
Processes events
    ↓
Stores offset in memory
    ↓
Consumer crashes
    ↓
Offset disappears

The consumer may no longer know where it left off.

Instead, the consumer group's position is durably stored by the streaming system.

Conceptually:

Consumer
    ↓
Process event
    ↓
Commit offset
    ↓
Durable consumer position

After failure:

Consumer restarts
    ↓
Reads committed position
    ↓
Resumes processing

The new consumer does not need the previous consumer's memory or local state to determine where to continue.

---

## 6.11 Consumer Group + Partition + Offset

These three concepts work together.

### Consumer Group

Identifies an independent consumer application/workload.

### Partition

Provides an ordered sequence.

### Offset

Identifies the consumer group's progress within that partition.

Conceptually:

Consumer Group A
    ↓
Partition P1
    ↓
Committed Offset = 900K

If the consumer processing P1 fails, another consumer can take ownership of P1 and resume from the group's committed position.

---

## 6.12 Failure Recovery

Suppose:

Partition P1

E1 E2 E3 ... E900K E900K+1 ...

Consumer has processed E900K.

If the offset was successfully committed:

Processed E900K
    ↓
Commit offset
    ↓
Crash

A replacement consumer can resume after the committed position.

But suppose:

Processed E900K
    ↓
Commit failed
    ↓
Crash

The replacement consumer may process E900K again.

This creates a duplicate processing possibility.

Therefore:

> Event streams commonly rely on at-least-once processing combined with idempotent consumers when duplicate processing must not create duplicate business effects.

---

## 6.13 Process Before Commit

For reliability-sensitive processing, the common conceptual ordering is:

Read event
    ↓
Process event
    ↓
Processing succeeds
    ↓
Commit offset

Why?

If we commit before processing:

Read event
    ↓
Commit offset
    ↓
Process event
    ↓
Consumer crashes

The event may be skipped when the consumer resumes.

If we process first:

Process event
    ↓
Commit offset

A failure between processing and committing can cause the event to be processed again.

That produces a duplicate rather than silently losing the business effect.

With an idempotent consumer:

First processing:
    → Apply business effect

Second processing:
    → Already processed
    → No additional business effect

Therefore:

> Process → Commit favors at-least-once processing and allows duplicate delivery to be handled through idempotency.

---

## 6.14 Replay

Event retention + consumer positions enables replay.

Suppose:

E1 E2 E3 E4 E5 E6 E7 E8 E9

Analytics has processed through E4.

Analytics goes down.

When it recovers:

Analytics
    ↓
Resume from previous position
    ↓
E5 → E6 → E7 → E8 → E9

This is replay for recovery.

Replay can also be intentional.

For example, Analytics has a bug:

Events
    ↓
Analytics
    ↓
Incorrect state

After fixing the bug:

Retained Events
    ↓
Start from an earlier position
    ↓
Reprocess historical events
    ↓
Rebuild Analytics state

---

## 6.15 Replay vs Recovery

Replay can happen for two major reasons.

### Recovery

Consumer crashes or becomes unavailable.

Consumer
    ↓
Last committed position
    ↓
Resume
    ↓
Catch up

### Reprocessing

A consumer needs to process historical events again.

Retained events
    ↓
Earlier position
    ↓
Reprocess
    ↓
Rebuild/fix state

Therefore:

> Replay is not only a failure-recovery mechanism; it can also be used for rebuilding or correcting derived state.

---

## 6.16 Retention Limits Replay

Replay is only possible while the required events remain retained.

Example:

Retention = 7 days

If an event was produced:

Day 1 → Event created

and today is:

Day 10

the event may no longer be available.

Therefore:

> Event retention determines how far back a consumer can replay from that stream.

Retention is a business and operational decision, not merely a technical setting.

---

## 6.17 Independent Consumer Groups

Suppose:

OrderPlaced
    ↓
Event Stream
    │
    ├── Analytics Group
    ├── Fraud Group
    └── Notification Group

Each group has its own position.

Example:

Analytics → offset 100
Fraud → offset 500
Notification → offset 50

The groups do not have to progress at the same speed.

This allows one consumer to be temporarily slow without forcing all other consumers to stop.

---

## 6.18 Consumers Within a Group

Consumers within the same consumer group share the workload.

Example:

4 partitions:

P0
P1
P2
P3

Two consumers:

C1
C2

Possible assignment:

P0 → C1
P1 → C1
P2 → C2
P3 → C2

The consumers collectively process the group's workload.

They do not independently process every event.

Therefore:

> Consumers within a group share work; consumer groups independently consume the stream.

---

## 6.19 Multiple Consumer Groups

Different consumer groups independently consume the same events.

Example:

OrderPlaced
    ↓
Event Stream
    │
    ├── Analytics Group
    ├── Fraud Group
    ├── Notification Group
    └── Recommendation Group

An event can therefore be processed once by each consumer group.

For example:

OrderPlaced

Analytics Group → process once
Fraud Group → process once
Notification Group → process once
Recommendation Group → process once

This provides fan-out without requiring the producer to directly call every consumer.

---

## 6.20 Event Streaming and Loose Coupling

Compare two architectures.

### Direct service chain

Order Service
    ↓
Analytics API
    ↓
Fraud API
    ↓
Notification API

Failures or latency in one component can affect subsequent components.

### Event-driven fan-out

Order Service
    ↓
OrderPlaced
    ↓
Event Stream
    │
    ├── Analytics
    ├── Fraud
    └── Notification

Each consumer independently reacts to the event.

If Fraud is temporarily unavailable:

Analytics → continues
Notification → continues
Fraud → catches up later

This provides stronger isolation between consumers.

---

## 6.21 Adding New Consumers

Suppose the system initially has:

OrderPlaced
    ↓
Event Stream
    ├── Analytics
    ├── Fraud
    └── Notification

Six months later, we introduce:

Recommendation Service

A new consumer group can consume retained historical events, subject to the retention window.

OrderPlaced
    ↓
Event Stream
    ├── Analytics
    ├── Fraud
    ├── Notification
    └── Recommendation ← new group

The new service does not need existing consumers to replay or forward the historical events.

It can maintain its own position independently.

---

## 6.22 Core Mental Model

Remember:

### Event

> Something happened.

### Event Stream

> A retained sequence of events that consumers can independently process.

### Partition

> An ordered sequence and parallelism boundary.

### Offset

> A consumer's position within a partition.

### Consumer Group

> An independent processing workload with its own positions.

### Retention

> How long events remain available.

### Replay

> Processing retained events again from a selected position.

The overall model:

Producer
    ↓
Event Stream
    ↓
Partitions
    ↓
Consumer Groups
    ↓
Independent Processing

---

# Interview Cheat Sheet — Part 1

### What is an event?

> A record of something that already happened.

### Why use event streaming?

> To retain events and allow multiple independent consumers to process them at their own pace.

### Traditional queue vs event stream?

> Queue → distribute work.  
> Event stream → retain and independently distribute events.

### What is retention?

> The policy determining how long events remain available.

### What is an offset?

> A consumer's position within a partition.

### Does offset create ordering?

> No. The partition provides the ordering boundary; the offset identifies position within it.

### What is a consumer group?

> An independent consumer workload with its own positions.

### Why multiple consumer groups?

> To let different applications process the same events independently.

### What happens if a consumer crashes?

> Another consumer can take over and resume from the group's committed position.

### Why can duplicates happen?

> If processing succeeds but the offset commit fails, the event may be processed again after recovery.

### Why process before committing?

> To favor at-least-once processing rather than risking an event being skipped.

### Why is idempotency important?

> Replayed/duplicate events should not create duplicate business effects.

### What is replay?

> Reprocessing retained events from an earlier consumer position.

### Can events be replayed forever?

> No. Replay is limited by the stream's retention policy.

### Why is event streaming loosely coupled?

> Producers publish facts without needing to know which independent consumers will react to them.

### Core principle

> **Event stream = retained event history + independent consumer positions + replay.**
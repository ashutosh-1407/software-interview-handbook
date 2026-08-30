# Event Streaming — Part 4: Interview Guide, Engineering Principles & Final Review

## 6.84 Event Streaming — Senior-Level Design Principles

When designing an event-streaming system, avoid starting with:

> "Let's use Kafka."

Start with the business requirements.

Ask:

- Do multiple independent consumers need the same event?
- Do consumers need independent progress?
- Is replay required?
- How long must events be retained?
- What ordering is actually required?
- What throughput is required?
- What happens when consumers or downstream systems fail?
- Can duplicate processing be tolerated?
- What is the acceptable processing latency?

Then choose the simplest architecture that satisfies those requirements.

---

## 6.85 Event Stream vs Traditional Queue

### Traditional Work Queue

Best when:

- One worker should process each job
- Work distribution is the primary requirement
- Replay is unnecessary
- Independent consumer positions are unnecessary
- Simplicity is preferred

Mental model:

Producer
    ↓
Queue
    ↓
Competing Workers

Think:

> "Who should do this work?"

---

### Event Stream

Best when:

- Multiple applications need the same event
- Consumers need independent positions
- Events need to be retained
- Replay is required
- High throughput and partition-level parallelism are needed
- Per-key ordering is important

Mental model:

Producer
    ↓
Event Stream
    ├── Consumer Group A
    ├── Consumer Group B
    └── Consumer Group C

Think:

> "Who needs to know that this happened?"

---

## 6.86 Event Streaming vs Synchronous APIs

Consider:

Order Service
    ↓
Analytics API
    ↓
Fraud API
    ↓
Notification API

This creates stronger runtime coupling.

If Fraud is slow:

Order processing chain
    ↓
Fraud latency
    ↓
Subsequent processing delayed

With event streaming:

Order Service
    ↓
OrderPlaced
    ↓
Event Stream
    ├── Analytics
    ├── Fraud
    └── Notification

Each consumer can operate independently.

This provides:

- Loose coupling
- Failure isolation
- Independent scaling
- Independent recovery

---

## 6.87 Event Streaming Does Not Mean Everything Should Be Asynchronous

Not every operation should become an event.

For example:

Place Order
    ↓
Payment
    ↓
Inventory
    ↓
Order DB
    ↓
Order Placed

If payment and inventory must succeed before the order is considered complete, those operations may need to remain synchronous or part of a carefully designed transactional workflow.

After the order is successfully placed:

OrderPlaced
    ↓
Event Stream
    ├── Email
    ├── Analytics
    └── Recommendations

The principle is:

> Make work asynchronous when the business does not require the caller to wait for it.

---

## 6.88 Event Stream as Durable History

An event stream can act as a durable history of business events.

Example:

OrderCreated
OrderPaid
OrderShipped
OrderDelivered

Consumers can use these events to build derived state.

Example:

Event Stream
    ↓
OrderCreated
OrderPaid
OrderShipped
    ↓
Order Projection
    ↓
Current Order State

The stream represents the history.

The consumer's database represents derived/current state.

---

## 6.89 Rebuilding Derived State

Suppose a consumer's database becomes corrupted.

If the required events are still retained:

Retained Event History
    ↓
New Consumer / Rebuild Process
    ↓
Replay events
    ↓
Reconstruct state

This can be useful for:

- Analytics
- Search indexes
- Materialized views
- Recommendation systems
- Reporting systems
- Derived databases

However:

> Rebuilding is only possible for events still available within the retention period or from another durable source.

---

## 6.90 Event Schema Evolution

Events are long-lived data.

A producer may publish an event today:

OrderPlaced
    {
        order_id,
        user_id,
        amount
    }

Six months later, the producer may need to add:

currency

Consumers may still be processing older events.

Therefore:

> Event schemas should be designed for compatibility and evolution.

When evolving schemas, consider:

- Backward compatibility
- Forward compatibility
- Optional fields
- Versioning
- Consumer migration strategy

The exact schema-management approach depends on the event-streaming platform.

---

## 6.91 Event Size

Large events increase:

- Network traffic
- Storage requirements
- Serialization/deserialization cost
- Consumer processing cost
- Replication cost

Prefer events that contain the information consumers actually need.

For example:

Instead of placing a massive object into every event:

OrderPlaced
    {
        entire_order_object: ...
    }

consider a compact event:

OrderPlaced
    {
        order_id,
        user_id,
        timestamp
    }

Consumers can retrieve additional information when appropriate.

However, fetching additional data can introduce coupling and latency.

Therefore:

> Event payload design is a trade-off between self-contained events and excessive payload size.

---

## 6.92 Ordering vs Scalability

Strict global ordering:

    ↓
Requires stronger coordination
    ↓
Limits parallelism
    ↓
Lower potential throughput

Per-key ordering:

    ↓
Partition by business key
    ↓
Different keys process concurrently
    ↓
Higher throughput

Therefore:

> Never choose global ordering unless the business actually requires it.

---

## 6.93 Hot Key vs Hot Partition

A hot key occurs when one partition key receives disproportionate traffic.

Example:

partition_key = celebrity_user_id

Suppose one user generates:

100K events/sec

while most users generate:

100 events/sec.

If the key always maps to one partition:

Hot key
    ↓
Hot partition
    ↓
Single consumer becomes bottleneck

Possible approaches depend on the ordering requirement.

If strict ordering for that key is required, distributing that key across multiple partitions may violate the requirement.

Therefore:

> Sometimes a hot partition is an unavoidable consequence of a strict ordering requirement.

---

## 6.94 Partition Count Is a Capacity Decision

Do not choose partition count arbitrarily.

Consider:

- Expected event rate
- Consumer processing rate
- Required parallelism
- Ordering requirements
- Number of consumers
- Growth expectations
- Operational cost
- Rebalancing behavior
- Partition distribution

The goal is not:

> "Maximum number of partitions."

The goal is:

> **Enough partitions to provide the required parallelism without unnecessary complexity.**

---

## 6.95 Consumer Scaling Decision Tree

When consumer lag increases:

Consumer lag increasing
        ↓
Check producer rate
        ↓
Check consumer throughput
        ↓
Check partition distribution
        ↓
Check consumer resources
        ↓
Check downstream capacity

Then:

### Consumers are bottleneck?

→ Add consumers, assuming enough partitions and downstream capacity.

### Not enough partitions?

→ Consider increasing partitions, while evaluating ordering and system-specific behavior.

### Hot partition?

→ Investigate partition key and workload distribution.

### Downstream bottleneck?

→ Apply backpressure, reduce concurrency, optimize/scale downstream.

### Producer rate too high?

→ Consider throttling or reducing upstream work.

---

## 6.96 Failure Handling Decision Tree

When an event fails:

Event processing fails
        ↓
Is failure likely transient?
        │
    ┌───┴───┐
   Yes      No
    ↓        ↓
 Retry     DLQ / isolate
    ↓
Backoff
    ↓
Retry exhausted?
    │
 ┌──┴──┐
No    Yes
 ↓      ↓
Done   DLQ

The exact policy depends on business requirements and the failure type.

---

## 6.97 Production Incident: Consumer Lag Increasing

Suppose:

Producer = 100K/sec
Consumer = 80K/sec

Lag is continuously increasing.

A weak answer:

> "Add more consumers."

A stronger answer:

> "First determine whether consumers are actually the bottleneck. Check partition utilization, consumer throughput, downstream latency/capacity, and lag trend. If consumers are the bottleneck and the workload is parallelizable, scale consumers. If downstream is saturated, adding consumers could make the problem worse."

---

## 6.98 Production Incident: Database Is Saturated

Suppose:

Producer = 50K/sec
Consumer = 50K/sec
Database = 30K/sec capacity

Do not simply add consumers.

Instead:

Consumer
    ↓
Reduce concurrency
    ↓
Database stabilizes
    ↓
Lag temporarily grows

Then:

Scale/optimize database
    ↓
Increase consumer capacity
    ↓
Drain backlog

This protects the system while preserving the events for later processing.

---

## 6.99 Production Incident: One Consumer Is Lagging

Suppose:

P0 → low lag
P1 → low lag
P2 → low lag
P3 → high lag

Investigate:

- Is P3 receiving more events?
- Is there a hot partition key?
- Are P3 events more expensive to process?
- Is the consumer assigned to P3 unhealthy?
- Is a downstream dependency affecting only P3's workload?

Do not immediately conclude that the entire consumer group needs scaling.

---

## 6.100 Production Incident: Consumer Group Is Down

Suppose Analytics is unavailable for 30 minutes.

If events are retained:

OrderPlaced events
    ↓
Stream
    ↓
Analytics unavailable
    ↓
Events continue being retained
    ↓
Analytics recovers
    ↓
Resume from committed position
    ↓
Catch up

Other consumer groups can continue independently.

This demonstrates:

> Independent consumer positions + retention provide failure isolation and recovery.

---

## 6.101 Production Incident: New Consumer Added

Suppose six months after launch, we introduce:

Recommendation Service

Existing:

Event Stream
    ├── Analytics
    ├── Fraud
    └── Notification

New:

    └── Recommendation

Recommendation can create its own consumer group and consume retained historical events from an appropriate starting position.

This allows the new service to build its own state without requiring existing consumers to replay or forward events.

---

## 6.102 Event Streaming Anti-Patterns

Avoid:

### Using an event stream when a simple work queue is enough

This adds unnecessary operational complexity.

### Adding consumers without checking downstream capacity

This can overwhelm the actual bottleneck.

### Adding partitions without understanding ordering requirements

This can create unexpected ordering behavior and operational complexity.

### Using a poor partition key

This can create hot partitions.

### Assuming global ordering

Ordering is generally per partition.

### Treating lag as the only metric

Lag trend and oldest event age are also important.

### Ignoring duplicate processing

At-least-once processing can cause duplicates.

### Assuming retention is infinite

Events eventually expire according to retention policies.

### Retrying permanent failures forever

Malformed or invalid events should usually be isolated.

---

## 6.103 Event Streaming Engineering Principles

### Principle 1 — Start with the business requirement

Don't start with Kafka or another specific technology.

Start with:

- Ordering
- Replay
- Throughput
- Retention
- Consumer independence
- Reliability

---

### Principle 2 — Prefer the simplest architecture

If the requirement is simply:

> "Distribute 10M independent jobs across workers."

A traditional work queue may be sufficient.

Do not introduce event streaming just because it is more powerful.

---

### Principle 3 — Partition based on ordering requirements

Ask:

> What needs to remain ordered?

Then choose the partition key accordingly.

---

### Principle 4 — Scale the bottleneck

If consumers are the bottleneck:

→ Scale consumers.

If partitions are limiting parallelism:

→ Consider partition scaling.

If downstream is the bottleneck:

→ Protect or scale downstream.

Do not scale components blindly.

---

### Principle 5 — Expect duplicates

Reliable event processing should assume that an event can be delivered more than once.

Design consumers to be idempotent when duplicate business effects are unacceptable.

---

### Principle 6 — Protect downstream systems

The fastest consumer is not necessarily the best consumer.

A consumer should operate at a rate the downstream system can sustainably support.

---

### Principle 7 — Treat replay as a capability

Retention provides the ability to:

- Recover after failures
- Catch up slow consumers
- Rebuild derived state
- Add new consumers
- Correct processing bugs

---

### Principle 8 — Monitor trends, not snapshots

Don't ask only:

> "How much lag do we have?"

Ask:

> "Is lag increasing or decreasing?"

Also monitor:

- Oldest event age
- Producer rate
- Consumer throughput
- Partition distribution
- Downstream latency

---

### Principle 9 — Ordering has a cost

Global ordering reduces parallelism.

Per-key ordering often provides the required business guarantee while allowing much higher throughput.

---

### Principle 10 — Events are facts

An event should represent:

> "Something happened."

It should not unnecessarily encode a tightly coupled workflow between services.

---

# Chapter Summary

Event streaming provides a durable, ordered event history that multiple independent consumer groups can process at their own pace.

The core architecture is:

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
Downstream Systems

The most important concepts are:

- Events represent facts.
- Partitions provide ordering boundaries and parallelism.
- Offsets track consumer progress.
- Consumer groups maintain independent positions.
- Retention allows recovery and replay.
- Rebalancing redistributes partition ownership.
- Consumer lag measures processing delay.
- Partition keys determine ordering and distribution.
- Backpressure protects downstream systems.
- At-least-once processing can produce duplicates.
- Idempotent consumers prevent duplicate business effects.
- DLQs isolate repeatedly failing events.

The central mental model is:

> **Event streaming = retained event history + partitioned ordering + independent consumer progress + replay.**

---

# Engineering Principles

1. **Choose event streaming when independent consumers and replay provide real business value.**

2. **Use traditional queues when the requirement is simply distributing work.**

3. **Partition based on the ordering requirement, not arbitrary technical preference.**

4. **Prefer per-key ordering over global ordering when the business allows it.**

5. **Never scale consumers blindly; identify the actual bottleneck first.**

6. **Protect downstream dependencies with concurrency limits and backpressure.**

7. **Design for duplicate processing when using at-least-once semantics.**

8. **Treat retention as a deliberate recovery and replay capability.**

9. **Monitor lag trends and event age, not just instantaneous backlog.**

10. **Keep event producers loosely coupled from consumers.**

---

# Interview Questions

### Fundamentals

1. What is event streaming?
2. How is an event different from a message?
3. When would you choose Kafka/event streaming over a traditional queue?
4. What is event retention?
5. Why is retention useful?
6. What is replay?
7. What is an offset?
8. How is an offset related to ordering?
9. What is a consumer group?
10. Why does each consumer group maintain an independent position?

### Partitioning

11. Why do event streams use partitions?
12. What ordering guarantees do partitions provide?
13. How would you preserve ordering for a particular order?
14. What is a partition key?
15. Does a partition key need to be globally unique?
16. What is a hot partition?
17. Why can adding consumers fail to solve a hot partition?
18. What happens when there are more consumers than partitions?
19. What is the trade-off between global and per-key ordering?
20. Why not always use a single partition for global ordering?

### Consumer Groups

21. What happens when a consumer crashes?
22. What is rebalancing?
23. Why can rebalancing temporarily increase lag?
24. What happens when a new consumer joins a group?
25. What is the difference between consumer ownership and consumer position?
26. Why doesn't a replacement consumer need the previous consumer's memory?
27. How can multiple consumer groups consume the same event independently?

### Reliability

28. Why can an event be processed twice?
29. Why process before committing the offset?
30. What happens if processing succeeds but offset commit fails?
31. How does idempotency help?
32. What is exactly-once delivery?
33. What is exactly-once business effect?
34. How do retries interact with event processing?
35. What is a poison event?
36. When should an event move to a DLQ?

### Production Scenarios

37. Consumer lag is increasing. What do you investigate?
38. Would you immediately add consumers?
39. What if the downstream database is saturated?
40. What if only one partition has high lag?
41. What if all consumers become slow simultaneously?
42. What if adding consumers does not reduce lag?
43. How would you protect a downstream service during an outage?
44. How would you handle a retry storm?
45. How would you recover a consumer that has been down for 30 minutes?
46. How would you add a new consumer six months after the system was launched?
47. How would you rebuild analytics after discovering a processing bug?
48. How would you design for Black Friday traffic spikes?

---

# Interview Cheat Sheet — Event Streaming

### Event vs Message

**Message:** "Do this work."

**Event:** "This happened."

### Traditional Queue

> Distribute work among competing workers.

### Event Stream

> Retain events and let independent consumer groups process them.

### Partition

> Ordering boundary + parallelism unit.

### Offset

> Consumer position within a partition.

### Consumer Group

> Independent processing workload with its own offsets.

### Retention

> Determines how long events remain available.

### Replay

> Process retained events again from an earlier position.

### Ordering

> Generally guaranteed within a partition, not globally.

### Partition Key

> Determines partition placement and can preserve per-key ordering.

### Hot Partition

> One partition receives disproportionate traffic/work and becomes a bottleneck.

### Consumer Lag

> How far a consumer group is behind.

### Rebalancing

> Redistributing partition ownership after group membership changes.

### Backpressure

> Limit processing so downstream systems aren't overwhelmed.

### Retry

> Useful for transient failures.

### DLQ

> Isolate repeatedly failing events.

### Idempotency

> Reprocessing an event produces no additional business effect.

### Key Reliability Pattern

At-least-once
      +
Idempotent Consumer
      ↓
Exactly-once business effect

### Key Scaling Rule

> **Find the bottleneck before scaling.**

### Key Partition Rule

> **Use the partition key to preserve only the ordering the business actually requires.**

### Final Mental Model

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

Retention → Replay
Offsets → Progress
Partitions → Ordering + Parallelism
Groups → Independent Consumption
Backpressure → Downstream Protection
Idempotency → Duplicate Safety

> **Event streaming is not just a faster queue. It is a retained event history that enables independent consumers, durable progress, replay, and partition-level parallelism.**
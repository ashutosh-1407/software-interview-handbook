# Event Streaming — Part 3: Backpressure, Failure Handling & Production Design

## 6.53 Backpressure

Backpressure is a mechanism for preventing consumers from overwhelming downstream systems.

Example:

Producer
    ↓
Event Stream
    ↓
Consumers
    ↓
Database

Suppose:

Producer = 50K/sec
Consumers = 50K/sec
Database = 20K/sec

If consumers continue processing at 50K/sec:

Consumers
    ↓
50K/sec
    ↓
Database
    ↓
💥 Overloaded

The queue may not be the bottleneck.

The downstream database is.

Therefore:

> Consumers should not blindly process as fast as possible if downstream capacity is lower.

---

## 6.54 Controlling Consumer Concurrency

One way to apply backpressure is to limit consumer concurrency.

Example:

Before:

Consumer
    ↓
100 concurrent requests
    ↓
Database

After:

Consumer
    ↓
20 concurrent requests
    ↓
Database

This reduces pressure on the database.

The trade-off is:

> Consumer lag may temporarily increase.

This can be acceptable if protecting the downstream system prevents a larger failure.

---

## 6.55 Backlog Is Not Always Bad

Suppose:

Producer = 50K/sec
Consumer = 40K/sec

Backlog grows by:

10K/sec

This is a problem if the mismatch is permanent.

But if the producer temporarily spikes:

Producer = 50K/sec
Consumer = 60K/sec

The consumer can eventually catch up.

Therefore:

> A backlog is not automatically a failure. The important question is whether the backlog is growing or shrinking.

---

## 6.56 Lag Trend

Consider:

Current lag = 1M events

Case 1:

Lag:
1M → 900K → 800K → 700K

The consumer is catching up.

Case 2:

Lag:
1M → 1.1M → 1.2M → 1.3M

The consumer is falling further behind.

Therefore:

> Lag trend is often more useful than a single lag measurement.

---

## 6.57 Producer Rate vs Consumer Rate

A basic capacity model is:

Producer rate = P
Consumer processing rate = C

If:

P < C

The consumer can keep up and potentially drain existing backlog.

If:

P = C

The system can remain stable if there is no existing backlog.

If:

P > C

Backlog grows.

Example:

Producer = 100K/sec
Consumer = 80K/sec

Backlog growth:

100K - 80K = 20K/sec

A permanent mismatch requires architectural intervention.

---

## 6.58 Diagnosing Consumer Lag

When consumer lag increases, do not immediately add consumers.

Investigate:

### Producer

- Did traffic increase?
- Is the producer generating more events than expected?

### Partitions

- Are there enough partitions?
- Is one partition hot?
- Is the partition key distributing traffic evenly?

### Consumers

- CPU utilization
- Memory utilization
- Processing latency
- Number of concurrent operations
- Consumer failures/restarts

### Downstream

- Database latency
- API latency
- Connection pool exhaustion
- Rate limits
- Error rates
- Capacity limits

The goal is to identify the actual bottleneck.

---

## 6.59 Adding Consumers

Adding consumers can help when:

- The workload is parallelizable
- There are enough partitions
- Consumers are the bottleneck
- Downstream systems can handle additional load

Example:

Producer = 100K/sec

Current consumer capacity = 60K/sec

If there are enough partitions and downstream capacity:

Add consumers
    ↓
Consumer capacity = 100K/sec
    ↓
Lag stabilizes

But if the database can only handle 60K/sec:

Add consumers
    ↓
More database requests
    ↓
Database overloaded
    ↓
Consumer latency increases
    ↓
Lag may increase further

Therefore:

> Scale consumers only when consumers are actually the bottleneck.

---

## 6.60 Adding Partitions

Adding partitions can increase potential parallelism.

Example:

4 partitions
    ↓
4 possible active consumers

Increase to:

8 partitions
    ↓
8 possible active consumers

However, adding partitions does not automatically solve every throughput problem.

If the downstream database is already saturated:

More partitions
    ↓
More consumer parallelism
    ↓
More database pressure
    ↓
Same bottleneck

Therefore:

> Partition scaling is useful when partition-level parallelism is the constraint, not when downstream capacity is the constraint.

Partition-count changes can also affect partition distribution, ownership, ordering behavior, and rebalancing depending on the streaming system.

---

## 6.61 Downstream Bottleneck

Consider:

Producer
    ↓
Event Stream
    ↓
20 Consumers
    ↓
Database

Suppose:

Consumers can process = 100K/sec
Database can process = 40K/sec

The sustainable throughput is constrained by the database.

Adding more consumers does not make the system sustainably process 150K/sec.

Instead:

Consumers
    ↓
100K/sec
    ↓
Database
    ↓
40K/sec capacity

The database becomes the bottleneck.

---

## 6.62 Protecting a Saturated Downstream

If the downstream system is overloaded:

1. Reduce consumer concurrency.
2. Apply backpressure.
3. Allow lag to grow temporarily.
4. Scale or optimize the downstream system.
5. Resume higher consumer concurrency once capacity improves.

Example:

Database capacity = 40K/sec

Consumer concurrency produces = 70K/sec

Reduce concurrency:

Consumer = 35K/sec
    ↓
Database = 35K/sec
    ↓
Database stabilizes

Meanwhile:

Producer = 50K/sec
Consumer = 35K/sec

Lag grows temporarily.

Once the database is recovered/scaled:

Consumer capacity = 70K/sec
    ↓
Lag begins shrinking.

---

## 6.63 Handling Temporary Downstream Failures

Suppose:

Email Service
    ↓
HTTP 503

A 503 often indicates a potentially temporary failure.

The consumer can:

1. Retry the operation.
2. Use exponential backoff.
3. Limit concurrency if necessary.
4. Avoid overwhelming the downstream service.
5. Move permanently failing messages to a DLQ when appropriate.

Conceptually:

Event
    ↓
Consumer
    ↓
Email Service
    ↓
503
    ↓
Retry
    ↓
Backoff
    ↓
Retry
    ↓
Success
    ↓
Commit offset

---

## 6.64 Retry Storms

Suppose:

100K events fail simultaneously.

If every consumer retries immediately:

100K requests
    ↓
Downstream already unhealthy
    ↓
100K more requests
    ↓
Further overload
    ↓
More failures
    ↓
More retries

This creates a retry storm.

Exponential backoff helps spread retries over time.

Example:

1 sec
    ↓
2 sec
    ↓
4 sec
    ↓
8 sec
    ↓
16 sec

The exact retry strategy depends on the system and failure type.

---

## 6.65 Dead Letter Queue

A DLQ can hold events that repeatedly fail processing.

Example:

Event
    ↓
Consumer
    ↓
Processing failure
    ↓
Retry
    ↓
Retry
    ↓
Retry exhausted
    ↓
DLQ

The goal is to prevent one problematic event from continuously consuming consumer capacity.

The DLQ can later be:

- Investigated
- Corrected
- Replayed
- Returned to the main processing path

---

## 6.66 Transient vs Permanent Failures

Not every failure should be treated the same way.

### Transient failure

Examples:

- Temporary network failure
- HTTP 503
- Temporary database outage
- Service overload

Retry may succeed.

### Permanent failure

Examples:

- Malformed event
- Invalid schema
- Missing required field
- Unsupported data

Retrying may never fix the event.

A common approach:

Transient failure
    ↓
Retry + backoff

Permanent/repeated failure
    ↓
DLQ

---

## 6.67 Idempotent Consumers

Event streaming commonly uses at-least-once processing.

Therefore, an event may be processed more than once.

Example:

E5
    ↓
Process successfully
    ↓
Commit fails
    ↓
Consumer restarts
    ↓
E5 processed again

An idempotent consumer ensures:

First processing:
    → Apply business effect

Second processing:
    → No additional business effect

The net result is equivalent to processing the event once.

---

## 6.68 Idempotency Key

A consumer can use an idempotency key to detect previously processed events.

Example:

Event:

OrderPaid
order_id = 123

Possible idempotency key:

order_id + event_type

Before processing:

Has this event already been processed?

If yes:

    Skip / safely return

If no:

    Process
    Record processed event
    Continue

The exact idempotency design depends on the business operation and storage guarantees.

---

## 6.69 Exactly-Once Delivery vs Business Effect

These should not be confused.

### Exactly-once delivery

The messaging system guarantees that the message is delivered exactly once.

This is a strong system-level guarantee and is highly dependent on the messaging system and processing architecture.

### Exactly-once business effect

Even if an event is delivered or processed multiple times, the final business result is equivalent to processing it once.

Example:

Deduct $100 from account.

Without idempotency:

E1 → -$100
E1 → -$100

Final result:

-$200

With idempotency:

E1 → -$100
E1 → duplicate → ignored

Final result:

-$100

Therefore:

> Exactly-once business effect can often be achieved through at-least-once delivery + idempotent processing.

---

## 6.70 Event Ordering and Idempotency

Idempotency does not automatically solve ordering problems.

Suppose:

E1 = OrderCreated
E2 = OrderCancelled

Correct:

E1 → E2

But if they are processed out of order:

E2 → E1

The consumer may produce an invalid state.

Therefore:

> Idempotency protects against duplicate effects; ordering protects against incorrect event sequence.

They solve different problems.

---

## 6.71 Poison Events

A poison event is an event that repeatedly fails processing.

Example:

Event E500
    ↓
Consumer
    ↓
Validation failure
    ↓
Retry
    ↓
Failure
    ↓
Retry
    ↓
Failure

If the event remains in the normal processing path indefinitely, it can consume resources and potentially block useful work.

A DLQ or equivalent isolation mechanism can move it out of the primary processing path.

---

## 6.72 Monitoring Event Streams

Important metrics include:

### Producer

- Event production rate
- Error rate
- Event size

### Consumer

- Processing throughput
- Processing latency
- Error rate
- Consumer restarts

### Partition

- Per-partition traffic
- Partition distribution
- Hot partitions

### Consumer Group

- Consumer lag
- Lag per partition
- Oldest event age
- Rebalance frequency

### Downstream

- Latency
- Error rate
- Saturation
- Connection pool usage
- Rate-limit responses

Monitoring should help answer:

> Where is the bottleneck?

---

## 6.73 Lag vs Oldest Event Age

Consider:

System A:

Lag = 1M
Oldest event = 2 seconds

System B:

Lag = 10K
Oldest event = 30 minutes

System B may be more concerning if the business requires low event-processing latency.

Therefore:

> Backlog size alone does not tell the complete story.

Use:

- Lag
- Lag trend
- Oldest event age
- Producer rate
- Consumer rate

together.

---

## 6.74 Production Incident: Consumer Lag Increasing

Suppose:

Producer = 100K/sec
Consumer = 80K/sec

Lag is continuously increasing.

First question:

> Is consumer throughput actually lower than producer throughput?

If yes:

Investigate:

Producer traffic
    ↓
Partition distribution
    ↓
Consumer capacity
    ↓
Downstream capacity

Do not immediately add consumers.

---

## 6.75 Production Incident: All Consumers Are Slow

If all consumers in a group become slow simultaneously, investigate shared dependencies.

Example:

Consumer 1
Consumer 2
Consumer 3
Consumer 4
     ↓
Shared Database
     ↓
High latency

This suggests the database or another shared downstream dependency may be the bottleneck.

Adding consumers may make the problem worse.

---

## 6.76 Production Incident: One Partition Is Lagging

Suppose:

P0 → low lag
P1 → low lag
P2 → low lag
P3 → very high lag

Investigate:

- Traffic distribution
- Partition key
- Hot key
- Processing cost
- Consumer assigned to P3
- Downstream behavior for events in P3

This is a classic hot-partition investigation.

---

## 6.77 Production Incident: Adding Consumers Does Nothing

Suppose:

Before:

Consumers = 4
Lag = increasing

After:

Consumers = 10
Lag = still increasing

Possible explanations:

- Not enough partitions
- Downstream bottleneck
- Hot partition
- Work cannot be parallelized
- Consumer coordination overhead
- External rate limits

The correct next step is to identify which constraint is limiting throughput.

---

## 6.78 Production Incident: Downstream Is Overloaded

Suppose:

Producer = 50K/sec
Consumer capacity = 50K/sec
Database capacity = 30K/sec

Do not blindly scale consumers.

Instead:

Consumer
    ↓
Control concurrency
    ↓
Database

Allow lag to grow temporarily if necessary.

Then:

- Scale database
- Optimize database
- Reduce consumer concurrency
- Apply backpressure
- Throttle upstream work if required

Once downstream capacity increases, consumers can drain the backlog.

---

## 6.79 Event Stream as a Buffer

An event stream can absorb temporary producer spikes.

Example:

Normal:

Producer = 30K/sec
Consumer = 30K/sec

Traffic spike:

Producer = 80K/sec
Consumer = 40K/sec

The stream absorbs the difference:

80K - 40K = 40K/sec backlog growth

When traffic returns to normal:

Producer = 20K/sec
Consumer = 40K/sec

The consumer can drain the backlog.

Therefore:

> Event streams can absorb temporary workload spikes, but they do not eliminate permanent capacity mismatches.

---

## 6.80 Permanent Capacity Mismatch

Suppose:

Producer = 100K/sec
Consumer = 60K/sec

Backlog grows by:

40K/sec

If this continues indefinitely, retention/storage and processing latency become problems.

Eventually we must:

- Increase consumer capacity
- Increase downstream capacity
- Reduce producer rate
- Optimize processing
- Apply admission control
- Or combine these approaches

A stream is not an infinite buffer.

---

## 6.81 Backpressure vs Dropping Events

For important business events, blindly dropping events is usually unacceptable.

Instead, consider:

- Slow consumer processing
- Queue/stream retention
- Throttling
- Backpressure
- Downstream scaling
- Retry
- DLQ

Whether events can be dropped depends on the business requirement.

For analytics or telemetry, losing a small amount of data may sometimes be acceptable.

For payments or orders, it generally is not.

---

## 6.82 Event Streaming Design Checklist

When designing an event-stream system, ask:

### Requirements

- What events are produced?
- Who consumes them?
- Do consumers need the same event?
- How long must events be retained?
- Is replay required?
- What ordering is required?

### Partitioning

- What is the partition key?
- Do we need global or per-key ordering?
- Can the key create hot partitions?
- How many partitions are required?

### Consumers

- How many consumer groups exist?
- How many consumers per group?
- Can the workload be parallelized?
- What happens when a consumer fails?

### Reliability

- What delivery semantics are required?
- Can processing be duplicated?
- Is the consumer idempotent?
- What retry policy is needed?
- When should events move to a DLQ?

### Operations

- How is lag monitored?
- How is downstream saturation detected?
- How is backpressure applied?
- How are rebalances handled?
- How are events replayed?

---

## 6.83 Core Production Mental Model

When something goes wrong:

Producer
    ↓
Event Stream
    ↓
Partitions
    ↓
Consumer Group
    ↓
Consumers
    ↓
Downstream

Walk the pipeline from left to right.

Ask:

1. Is producer traffic unexpectedly high?
2. Is partition distribution uneven?
3. Is there a hot partition?
4. Are there enough partitions?
5. Are consumers saturated?
6. Is consumer lag increasing or shrinking?
7. Is downstream saturated?
8. Can we safely increase concurrency?
9. Would increasing concurrency worsen downstream pressure?
10. Should we apply backpressure?
11. Can we replay events if needed?

The goal is:

> **Find the actual bottleneck before scaling anything.**

---

# Interview Cheat Sheet — Part 3

### What is backpressure?

> Limiting upstream/consumer work so downstream systems are not overwhelmed.

### Should we always maximize consumer concurrency?

> No. Concurrency should respect downstream capacity.

### When should we add consumers?

> When consumers are the bottleneck, the workload is parallelizable, and enough partitions and downstream capacity exist.

### When shouldn't we add consumers?

> When downstream is already saturated or a hot partition/workload is the bottleneck.

### Does adding partitions always improve throughput?

> No. It helps only when partition-level parallelism is the constraint.

### What should you check when lag increases?

> Producer rate, consumer throughput, partitions, hot partitions, consumer resources, and downstream capacity.

### Growing lag vs shrinking lag?

> Growing lag means processing cannot keep up; shrinking lag means consumers are catching up.

### Why monitor oldest event age?

> A small backlog can still represent significant latency if the oldest event is very old.

### What is a retry storm?

> Large numbers of failed events retrying simultaneously and further overwhelming an unhealthy downstream system.

### How mitigate retry storms?

> Exponential backoff, jitter where appropriate, concurrency limits, and downstream recovery.

### What is a poison event?

> An event that repeatedly fails processing and should be isolated rather than consuming normal processing capacity indefinitely.

### What is a DLQ?

> A separate destination for events that cannot be successfully processed after the normal retry policy.

### Why idempotency?

> At-least-once processing can produce duplicates; idempotency prevents duplicate business effects.

### Idempotency vs ordering?

> Idempotency handles duplicate effects; ordering ensures events are processed in the required sequence.

### What is the key production principle?

> **Don't scale blindly. Identify the bottleneck, protect downstream dependencies, and scale the actual constraint.**
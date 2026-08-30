# Event-Driven Architecture — Cheat Sheet

## Core Mental Model

Producer
   ↓
Event
   ↓
Broker / Event Stream
   ↓
Independent Consumers

EDA gives:

- Loose coupling
- Independent processing
- Failure isolation
- Independent scaling
- Replay / recovery
- Extensibility

Tradeoff:

- Eventual consistency
- Duplicate handling
- Ordering complexity
- Harder debugging
- More observability
- Distributed workflow complexity

---

## Event vs Command

### Event

> "This happened."

Examples:

OrderCreated
PaymentSucceeded
PaymentFailed
ShipmentCreated

Events describe facts.

### Command

> "Please do this."

Examples:

ProcessPayment
RefundPayment
ReserveInventory
CreateShipment

Commands request actions.

---

## When to Use EDA

Use EDA when:

- Downstream work can happen independently
- Multiple consumers need the same event
- Failure isolation matters
- Replay is useful
- Consumers need independent scaling
- New consumers may be added later
- Caller does not need to wait for all downstream work

Think:

> Publish the fact and let interested consumers react independently.

---

## When NOT to Use EDA

Prefer synchronous communication when:

- Caller needs the result immediately
- Every step must succeed before returning success
- Strict immediate consistency is required
- No independent consumers exist
- Replay provides no value
- Workflow is naturally simple and sequential

Example:

GET /account/balance

If the caller needs the authoritative balance now:

Client
   ↓
Account Service
   ↓
Balance

Don't add an unnecessary event round trip.

---

## Business Transaction Boundary

Before choosing sync vs async, ask:

> What must succeed before the business action is considered complete?

Example:

If order creation requires:

Payment
Inventory
Order DB

then keep those on the critical path.

Optional work:

Email
Analytics
Recommendation

can happen asynchronously.

Important:

> EDA does NOT mean "make everything asynchronous."

---

## Loose Coupling

Producer:

Order Service
     ↓
OrderCreated

Consumers:

OrderCreated
     ├── Email
     ├── Analytics
     ├── Fraud
     └── Recommendation

The producer does not need to know how each consumer processes the event.

New consumers can often be added without changing the producer.

---

## Failure Isolation

OrderCreated
     ├── Email       ✅
     ├── Fraud       ✅
     └── Analytics   ❌

Analytics failure should not block Email or Fraud.

Each consumer:

- processes independently
- fails independently
- retries independently
- recovers independently

---

## Eventual Consistency

Payment Service:

payment = SUCCEEDED

Order Service has not consumed PaymentSucceeded yet:

order = PAYMENT_PENDING

Later:

PaymentSucceeded
      ↓
Order Service
      ↓
order = PAID

Temporary disagreement is expected.

> EDA often trades immediate consistency for loose coupling and independent processing.

Always ask:

> Can the business tolerate the temporary inconsistency?

---

## Caching Does NOT Fix Eventual Consistency

Cache can make stale data fast.

It cannot guarantee that the latest event has already propagated.

> Caching improves read latency, not consistency guarantees.

---

## Read Model / Materialized View

Events
   ↓
Consumer
   ↓
Precomputed Read Model
   ↓
Fast Queries

Example:

order_id        = 123
payment_status  = PAID
shipping_status = READY

Useful for:

- fast reads
- scalable queries
- simplified read paths

But:

> Read models can still be temporarily stale.

---

# Reliable Event Publication

## Dual-Write Problem

Producer needs to:

1. Update business DB
2. Publish event

Example:

Create Order ✅
Publish OrderCreated ❌

Now:

Order exists
but
consumers never learn about it.

This is the:

> Dual-write problem.

---

## Outbox Pattern

Write:

Business change
+
Event-to-be-published

into the SAME local DB transaction.

Example:

BEGIN TRANSACTION

    Create Order

    Insert OrderCreated into Outbox

COMMIT

Then:

Outbox
   ↓
Publisher
   ↓
Broker

Core rule:

> Outbox makes the business change and intent to publish atomic.

---

## Publisher vs Broker

**Publisher**
> Sends events to the broker.

**Broker**
> Receives, stores/retains, and distributes events to consumers.

Publisher
   ↓
Broker
   ↓
Consumers

---

## Outbox Failure Case

Order created        ✅
Outbox written       ✅
Broker unavailable   ❌

Event remains:

Outbox → PENDING

Publisher retries later.

No event is lost.

---

## At-Least-Once Publication

Publisher:

Publish event          ✅
Mark Outbox published  ❌
Crash

After restart:

Publisher sends event again.

Result:

Same event may appear twice.

This is acceptable when consumers are idempotent.

---

# Idempotency

## Idempotent Consumer

Same event arrives twice:

OrderCreated(evt-123)
OrderCreated(evt-123)

Consumer checks:

Already processed evt-123?

YES
→ Don't apply business effect again.

NO
→ Process
→ Record evt-123

Result:

> Multiple deliveries → one business effect.

---

## Consumer-Side Atomicity

Do this in one transaction:

BEGIN TRANSACTION

    Apply business effect

    Record event_id as processed

COMMIT

Why?

Otherwise:

Business effect succeeds
Processed-event record fails
Consumer crashes
Event arrives again
Business effect happens twice

---

## Producer Outbox vs Consumer Idempotency

### Outbox

Protects producer-side:

DB change
+
event publication intent

### Idempotent Consumer

Protects consumer-side:

duplicate event
+
duplicate business effect

Remember:

> Outbox prevents lost events.

> Idempotency prevents duplicate business effects.

---

## External-System Idempotency

External side effects are different.

Example:

Payment Provider
   ↓
Charge $100

If Payment Service crashes after the provider charged the customer, blindly retrying could charge twice.

Use:

idempotency_key = payment-123

First call:

payment-123 → charge → SUCCESS

Retry:

payment-123 → provider recognizes duplicate
            → don't charge again

Important:

> Outbox does NOT make an external side effect atomic with your DB.

Use external-system idempotency when supported.

---

# Ordering

## Idempotency vs Ordering

Idempotency protects against:

> Duplicate events

Ordering protects against:

> Events applied in the wrong sequence

Example:

Correct:

PaymentSucceeded
      ↓
PaymentRefunded

Wrong order:

PaymentRefunded
      ↓
PaymentSucceeded

Even an idempotent consumer could end in the wrong state.

---

## Per-Entity Ordering

Usually we don't need global ordering.

We need:

Order 123:

PaymentSucceeded
      ↓
PaymentRefunded

Use:

partition_key = order_id

Same order → same partition.

Different orders can be processed in parallel.

---

## Ordering Rule

> Preserve only the ordering the business actually requires.

Global ordering:

- less parallelism
- lower throughput

Per-key ordering:

- correct entity-level sequence
- higher parallelism

---

# Saga / Distributed Workflows

## Partial Failure

Example:

Order Created      ✅
Payment Succeeded  ✅
Shipping           ❌

We cannot simply rollback everything because the steps happened in different systems.

Need:

> Compensation.

---

## Compensation

Payment succeeded
      ↓
Shipping failed
      ↓
Refund Payment
      ↓
Cancel Order

Compensation is:

> A business-level undo.

It is NOT a database rollback.

Examples:

Payment succeeded + Shipping failed
→ Refund payment

Inventory reserved + Payment failed
→ Release inventory

Coupon consumed + Order cancelled
→ Restore coupon

---

## Saga

A Saga is:

> Sequence of local transactions + compensating actions for failures.

Example:

Create Order        ✅
Process Payment     ✅
Reserve Inventory   ✅
Create Shipment     ❌
       ↓
Release Inventory
       ↓
Refund Payment
       ↓
Cancel Order

---

## Choreography

No central coordinator.

Services react to events.

OrderCreated
     ↓
PaymentSucceeded
     ↓
InventoryReserved
     ↓
ShipmentCreated

Good for:

- simpler workflows
- loose coupling
- natural event reactions

Risk:

> Complex workflows can become "event spaghetti."

---

## Orchestration

Central Saga Orchestrator coordinates steps.

Saga Orchestrator
      ↓
ProcessPayment
      ↓
ReserveInventory
      ↓
CreateShipment

On failure:

ShippingFailed
      ↓
ReleaseInventory
      ↓
RefundPayment
      ↓
CancelOrder

Good for:

- complex workflows
- branching
- compensation
- easier workflow visibility

Tradeoff:

- more centralized workflow coupling

Rule:

> Simple flow → choreography can work well.

> Complex flow → orchestration is often easier to reason about.

---

## Retry vs Compensation

Transient failure:

Database temporarily down
      ↓
Retry

Permanent business failure:

Item cannot be shipped
      ↓
Compensate

Remember:

> Retry temporary failures.

> Compensate permanent business failures.

---

# Event Contracts

Events become contracts once consumers depend on them.

Bad breaking change:

amount
   ↓
removed

total_amount
   ↓
added

Old consumers may break.

Prefer backward-compatible evolution.

Example:

amount        = 100
total_amount  = 100
currency      = USD

Old consumers continue working.

New consumers adopt new fields.

Core rule:

> Don't casually break published event contracts.

---

# Failure Handling

## Retry

Use for transient failures:

- timeout
- temporary network issue
- temporary DB outage
- service unavailable

---

## Backoff

Don't retry immediately forever.

Failure
   ↓
Wait
   ↓
Retry
   ↓
Wait longer
   ↓
Retry

Goal:

> Avoid overwhelming an unhealthy dependency.

---

## Poison Event

An event that repeatedly fails.

Don't let it block useful work indefinitely.

---

## DLQ

Repeated failure
      ↓
Retries exhausted
      ↓
DLQ
      ↓
Investigate
      ↓
Fix
      ↓
Replay if appropriate

---

# Observability

In EDA:

> No immediate error does NOT mean everything is healthy.

Monitor:

### Consumer Lag

How far behind is the consumer?

### Throughput

How many events are being processed?

### Processing Latency / Event Age

How long does an event wait before successful processing?

### Errors / Retries / DLQ

Is processing repeatedly failing?

Core mental model:

> Lag + Throughput + Latency + Failures

---

## Consumer Lag

Incoming = 10K/sec
Consumer = 7K/sec

Lag grows:

3K/sec

Consumer may be healthy but under-capacity.

---

## Downstream Bottleneck

Event Stream
     ↓
Consumers
     ↓
Database

If DB capacity = 5K/sec:

Adding more consumers does NOT increase sustainable throughput.

It may make the DB worse.

Rule:

> Find the actual bottleneck before scaling.

---

## Backpressure

If downstream is overloaded:

Reduce consumer concurrency
      ↓
Allow lag to grow temporarily
      ↓
Protect downstream
      ↓
Recover / scale downstream
      ↓
Catch up later

The stream can absorb temporary backlog.

It cannot solve permanent capacity mismatch.

---

# Production Failure Mental Model

## Broker Down

Business DB
   +
Outbox
   ↓
COMMIT
   ↓
Broker ❌

Event stays in Outbox.

Publisher retries later.

---

## Consumer Down

Broker
   ↓
Consumer ❌

Other consumers continue.

Failed consumer's lag grows.

When it recovers:

Resume from position
      ↓
Catch up

---

## Poison Event

Event repeatedly fails
      ↓
Retry
      ↓
Backoff
      ↓
DLQ

Main processing continues.

---

## Downstream DB Overloaded

Consumers
    ↓
DB saturated

Do NOT blindly add consumers.

Instead:

- reduce concurrency
- apply backpressure
- let lag grow temporarily
- scale/optimize DB
- catch up afterward

---

# EDA Design Checklist

Ask:

1. What must complete before the user sees success?
2. What work can happen asynchronously?
3. Do independent consumers need the same event?
4. Can the business tolerate eventual consistency?
5. What happens if publishing fails?
6. What happens if the same event arrives twice?
7. What ordering is required?
8. What is the partition key?
9. What happens if one consumer fails?
10. What happens if a downstream dependency fails?
11. What happens if a multi-step workflow partially succeeds?
12. Do we need compensation / Saga?
13. Choreography or orchestration?
14. How will schema changes remain compatible?
15. How will we monitor lag, latency, throughput, retries, and DLQ?

---

# 15-Second Interview Memory Model

EDA:
> Publish facts; consumers react independently.

Event:
> "This happened."

Command:
> "Please do this."

Outbox:
> DB change + event intent in one transaction.

Idempotency:
> Duplicate event → one business effect.

External idempotency:
> Retry external side effect safely.

Ordering:
> Idempotency handles duplicates; ordering handles sequence.

Partition key:
> Preserve per-entity ordering.

Eventual consistency:
> Services may temporarily disagree.

Saga:
> Local transactions + compensation.

Choreography:
> Services react to each other.

Orchestration:
> Coordinator manages workflow.

Retry:
> Temporary failure.

Compensation:
> Permanent business failure after earlier steps succeeded.

DLQ:
> Isolate repeatedly failing events.

Observability:
> Lag + throughput + latency + failures.

Scaling:
> Find the bottleneck first.

Architecture:
> Use EDA only when independence, failure isolation, replay, extensibility, or async processing justify the added complexity.

---

# Final Mental Model

Business Change
      ↓
Outbox
      ↓
Publisher
      ↓
Broker
      ↓
Independent Consumers
      ↓
Idempotent Processing
      ↓
Local State

If duplicate:
→ Idempotency

If wrong sequence:
→ Ordering / Partition Key

If temporary failure:
→ Retry + Backoff

If poison event:
→ DLQ

If distributed workflow partially fails:
→ Saga + Compensation

If workflow is simple:
→ Choreography may be enough

If workflow is complex:
→ Orchestration may be easier

If consumer falls behind:
→ Check lag + throughput + downstream capacity

If caller needs result immediately:
→ Prefer synchronous communication

> **EDA = loose coupling and independent processing in exchange for eventual consistency and distributed-systems complexity.**
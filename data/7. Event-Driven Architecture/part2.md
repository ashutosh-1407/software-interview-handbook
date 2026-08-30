# Event-Driven Architecture — Part 2: Reliable Event Publication & Idempotency

## 1. The Dual-Write Problem

Suppose the Order Service needs to:

1. Create an order in its database.
2. Publish an `OrderCreated` event.

A naive implementation might be:

Create Order
     ↓
Order DB
     ↓
Publish OrderCreated
     ↓
Event Broker

The problem is that the database and event broker are two independent systems.

Consider:

Create Order → SUCCESS ✅
Publish Event → FAILURE ❌

Now:

Order DB:

Order 123 exists ✅

Event Broker:

OrderCreated(123) missing ❌

Downstream consumers may never learn that the order was created.

For example:

OrderCreated
     │
     ├── Email
     ├── Analytics
     └── Fraud

None of these consumers receive the event.

This is known as the:

> **Dual-write problem.**

We successfully changed one system but failed to update another.

---

## 2. Why Idempotent Order Creation Does Not Solve the Dual-Write Problem

We could make:

CreateOrder(123)

idempotent.

That protects us from accidentally creating the same order multiple times.

But it does not guarantee:

OrderCreated(123)

will eventually reach the broker.

These are different problems.

Idempotency protects against:

Same operation repeated
      ↓
Duplicate business effect

The Outbox Pattern protects against:

Business DB updated
      ↓
Event publication lost

Important:

> **Idempotency and reliable event publication solve different failure modes.**

---

## 3. Why Not Just Use One Transaction?

If both writes were in the same database:

BEGIN TRANSACTION

    Create Order

    Store OrderCreated

COMMIT

then:

Both succeed

or

Both fail

But normally we have:

Order Database          Event Broker
      │                      │
      ↓                      ↓
 PostgreSQL                Kafka

A normal local database transaction cannot atomically commit changes across both independent systems.

We therefore need another approach.

---

## 4. The Outbox Pattern

The key idea is simple:

> **Store the business change and the event-to-be-published in the same database transaction.**

We introduce an Outbox table:

Order DB
│
├── orders
│
└── outbox

Now creating an order becomes:

BEGIN TRANSACTION

    INSERT Order 123

    INSERT OrderCreated(123)
        INTO Outbox

COMMIT

Because both operations use the same database transaction:

### Success

Order created          ✅
Outbox event created   ✅

### Failure

Order created          ❌
Outbox event created   ❌

We avoid:

Order created          ✅
Outbox event missing   ❌

---

## 5. What Does the Outbox Actually Store?

Conceptually:

Outbox

ID     Event                 Status
---------------------------------------
101    OrderCreated(123)     PENDING
102    OrderCreated(124)     PENDING
103    OrderCreated(125)     PENDING

The Outbox represents:

> **Events that were atomically recorded with the business transaction and still need to be published.**

The event is now durable even if the broker is temporarily unavailable.

---

## 6. The Outbox Publisher

Writing the event into the Outbox does NOT mean it has reached the event broker.

We need another component:

Order Service
      ↓
┌───────────────────────┐
│       Order DB        │
│                       │
│ orders                │
│ outbox                │
└───────────┬───────────┘
            ↓
     Outbox Publisher
            ↓
       Event Broker
            ↓
        Consumers

The publisher finds unpublished Outbox records and sends them to the broker.

For example:

Outbox:

101 → PENDING

      ↓

Publisher

      ↓

Event Broker

      ↓

OrderCreated(123)

Once publication succeeds, the Outbox record can eventually be marked appropriately or cleaned up.

---

## 7. Broker vs Publisher

These are different components.

### Publisher

The publisher sends events.

Example:

Outbox
   ↓
Publisher
   ↓
OrderCreated

### Broker

The broker receives, stores/distributes or retains events and makes them available to consumers.

Example:

Publisher
    ↓
Event Broker
    ↓
Consumers

Simple mental model:

> **Publisher sends the event to the broker; the broker makes the event available to consumers.**

---

## 8. What If the Broker Is Down?

Suppose:

Order created             ✅
Outbox event written      ✅
Broker unavailable        ❌

We still have:

Outbox:

OrderCreated(123) → PENDING

Therefore the publisher can retry later:

Outbox
   ↓
Publisher
   ↓
Broker ❌

...later...

Outbox
   ↓
Publisher
   ↓
Broker ✅

The event is not lost.

This is one of the main benefits of the Outbox Pattern.

---

## 9. The Critical Outbox Guarantee

The Outbox Pattern does NOT guarantee:

> "The event was published exactly once."

Instead, its critical guarantee is:

> **The business change and the intent to publish its event are recorded atomically.**

For example:

BEGIN TRANSACTION

    Create Order

    Record OrderCreated in Outbox

COMMIT

Then reliable publication can happen asynchronously.

---

## 10. Publisher Failure After Successful Publication

Now consider:

Outbox:

101 → PENDING

Publisher sends:

OrderCreated(123)

Broker receives it:

SUCCESS ✅

But before the publisher records:

101 → PUBLISHED

the publisher crashes.

After restarting:

Outbox:

101 → PENDING

The publisher cannot know from its local state that the event was already published.

So it may publish again:

OrderCreated(123)
OrderCreated(123)

This means:

> **Reliable retry can produce duplicate events.**

---

## 11. Why Duplicate Publication Is Acceptable

Distributed systems often face an ambiguity:

Publisher sends event
      ↓
Broker accepts event
      ↓
Publisher crashes before recording success

The publisher must choose between:

Do NOT retry
      ↓
Risk losing an event

or:

Retry
      ↓
Risk duplicate delivery

For important business events, we generally prefer:

> **Possible duplicate over possible loss.**

This leads naturally to:

> **At-least-once delivery.**

The event is guaranteed to be attempted until successful, but it may appear more than once.

---

## 12. Idempotent Consumers

If duplicate events are possible, consumers must be designed to tolerate them.

Suppose:

OrderCreated(evt-789)

is published twice:

OrderCreated(evt-789)

OrderCreated(evt-789)

Without idempotency:

Email sent twice

or:

Shipment created twice

or:

Analytics counted twice

or:

Payment charged twice

depending on the consumer.

Instead, the consumer can recognize:

event_id = evt-789

has already been processed.

Conceptually:

Receive evt-789
      ↓
Already processed?
      │
   ┌──┴──┐
   │     │
  YES    NO
   │     │
Ignore   Process
          ↓
       Record
       evt-789

This gives us:

Duplicate delivery
      ↓
One business effect

---

## 13. Why Use an Event ID?

Every logical event should have a stable identifier.

Example:

{
    "event_id": "evt-789",
    "event_type": "OrderCreated",
    "order_id": "123"
}

The important distinction is:

order_id

identifies the business entity.

event_id

identifies the particular event.

For example, Order 123 could have many events:

OrderCreated
PaymentSucceeded
OrderShipped
OrderDelivered

Each event should be independently identifiable.

---

## 14. Consumer-Side Atomicity

There is another subtle failure scenario.

Suppose Shipping consumes:

PaymentSucceeded(evt-789)

and does:

Create Shipment      ✅

Then before recording:

evt-789 processed

the consumer crashes.

When it restarts, the event may be delivered again.

If Shipping does:

Create Shipment

again, we could create two shipments.

Therefore:

Business effect
      +
Processed event ID

should generally be committed atomically when they are stored in the same transactional system.

Example:

BEGIN TRANSACTION

    Create Shipment

    INSERT evt-789
        INTO processed_events

COMMIT

Now:

### Transaction succeeds

Shipment created       ✅
evt-789 recorded       ✅

### Transaction fails

Shipment created       ❌
evt-789 recorded       ❌

The event can safely be retried.

---

## 15. Producer Outbox vs Consumer Processed-Event Table

These are easy to confuse.

### Producer Side

Order DB

├── orders
└── outbox

Purpose:

> Make the business change and event intent atomic.

---

### Consumer Side

Shipping DB

├── shipments
└── processed_events

Purpose:

> Make the business effect and duplicate detection atomic.

---

Conceptually:

                 PRODUCER

             ┌──────────────┐
             │   Order DB   │
             │              │
             │ orders       │
             │ outbox       │
             └──────┬───────┘
                    │
               Transaction
                    │
                    ↓
                 Publisher
                    │
                    ↓
              Event Broker
                    │
                    ↓
                 CONSUMER
                    │
             ┌──────┴───────┐
             │ Shipping DB  │
             │              │
             │ shipments    │
             │ processed ID │
             └──────────────┘

The two patterns protect opposite sides of event delivery.

---

## 16. The Most Important Distinction

Remember:

> **Outbox protects the producer-side dual write.**

Meaning:

Business DB changed
      +
Event must eventually be published

---

> **Idempotent consumer processing protects against duplicate delivery.**

Meaning:

Same event received multiple times
      ↓
One business effect

This is one of the most important reliability relationships in EDA.

---

## 17. Duplicate Delivery Can Happen in Multiple Places

There are several ways the same event can reach a consumer more than once.

### Publisher-side ambiguity

Publish event              ✅
Record publication status  ❌
Publisher crashes

      ↓

Publisher retries

      ↓

Duplicate event

---

### Consumer-side ambiguity

Apply business effect      ✅
Commit consumer offset     ❌
Consumer crashes

      ↓

Event delivered again

      ↓

Duplicate processing attempt

Although the failure occurs at different places, the result is similar:

> **The consumer may see the same logical event more than once.**

Therefore consumer idempotency protects against both scenarios.

---

## 18. Polling the Outbox

How does the publisher discover new Outbox records?

One simple approach is polling.

For example:

Every second:

SELECT *
FROM outbox
WHERE status = 'PENDING'

Then:

PENDING
   ↓
Publisher
   ↓
Broker

Advantages:

- simple to implement
- easy to understand
- relatively little additional infrastructure

Disadvantages:

- repeated database queries
- polling can occur when no events exist
- additional DB load
- polling interval introduces publication latency

Example:

Publisher → DB

"Anything new?"

"No."

Publisher → DB

"Anything new?"

"No."

Publisher → DB

"Anything new?"

"Yes."

Polling therefore trades simplicity for some recurring database overhead and latency.

---

## 19. Change Data Capture — CDC

Another approach is Change Data Capture.

Instead of repeatedly asking:

> "Did anything change?"

CDC observes database changes, often through the database transaction log.

Conceptually:

Order DB
   ↓
Transaction Log
   ↓
CDC
   ↓
Event Broker

This can provide a more change-driven event pipeline.

Compared with polling:

Polling:

Publisher → DB
Publisher → DB
Publisher → DB
Publisher → DB

CDC:

DB Change
   ↓
Transaction Log
   ↓
CDC
   ↓
Broker

CDC can reduce repeated polling and work well at larger scale.

However, it introduces:

- additional infrastructure
- operational complexity
- another system that must be monitored and operated

Important:

> **CDC is not automatically better than polling.**

For a simpler system, polling may be completely reasonable.

---

## 20. Multiple Outbox Publishers

For availability and throughput, we may run multiple publisher instances.

Example:

               Outbox
              /      \
             ↓        ↓
       Publisher 1  Publisher 2
             \        /
              ↓      ↓
               Broker

But now both publishers might see:

101 → PENDING

at the same time.

Without coordination:

Publisher 1 → Event 101

Publisher 2 → Event 101

Both could publish the same event unnecessarily.

---

## 21. Claiming Outbox Records

Instead of locking the entire Outbox table, publishers can claim individual records.

Conceptually:

Outbox:

101 PENDING
102 PENDING
103 PENDING
104 PENDING

Publisher 1 claims:

101
102

Publisher 2 claims:

103
104

Now:

101 PROCESSING → Publisher 1
102 PROCESSING → Publisher 1

103 PROCESSING → Publisher 2
104 PROCESSING → Publisher 2

Row-level locking / atomic claiming can allow multiple publishers to work concurrently without locking the entire table.

The exact mechanism depends on the database and implementation.

---

## 22. Why Have a PROCESSING State?

Suppose we delete the Outbox record immediately when a publisher claims it:

Claim event
     ↓
Delete event
     ↓
Publisher crashes ❌
     ↓
Event never published

The event has now been lost.

Instead:

PENDING
   ↓
PROCESSING
   ↓
Publish
   ↓
PUBLISHED

If the publisher crashes while the event is `PROCESSING`, the event still exists.

Important:

> **Claiming an event is not the same as successfully publishing an event.**

---

## 23. Detecting Abandoned Outbox Records

Suppose:

Event 101 → PROCESSING

Publisher 1 crashes.

Other publishers need a way to determine whether event 101 has been abandoned.

An Outbox record might therefore contain information such as:

id

event

status

attempt_count

claimed_at

published_at

Example:

ID     Status       Attempts     Claimed At
----------------------------------------------
101    PROCESSING   3            10:00:00

If the event remains `PROCESSING` beyond an expected timeout, another publisher may consider the claim stale and retry it.

`attempt_count` helps understand:

- how many times publication has been attempted
- problematic events
- retry behavior

`claimed_at` helps determine:

- whether a processing claim may be stale

---

## 24. Timeout Ambiguity

Suppose Publisher 1 claims event 101.

It appears stuck for too long.

Publisher 2 decides:

> "Publisher 1 probably died."

So Publisher 2 retries event 101.

But Publisher 1 was not actually dead.

It was simply slow.

Now:

Publisher 1 → Event 101

Publisher 2 → Event 101

Both might successfully publish it.

This demonstrates an important distributed-systems reality:

> **Timeouts create uncertainty.**

A timeout does not necessarily mean an operation failed.

It may mean:

- operation failed
- operation succeeded
- operation is still running
- response was lost
- network is slow

Therefore duplicates can still happen even with careful publisher coordination.

Once again:

At-least-once delivery
        ↓
Possible duplicate
        ↓
Idempotent consumer
        ↓
One business effect

---

## 25. External Side Effects Are Different

Now consider Payment Service:

Payment Service
      ↓
External Payment Provider
      ↓
Charge $100

Suppose:

Charge succeeds        ✅
Payment Service crashes ❌

Payment Service may not know whether the charge succeeded.

If it blindly retries:

Charge $100
Charge $100

the customer could potentially be charged twice.

The Outbox Pattern alone cannot solve this.

Why?

Because:

External Payment Provider

is outside the Payment Service's local database transaction.

We cannot simply do:

BEGIN TRANSACTION

    Charge external provider
    Update local DB

COMMIT

and expect a normal database transaction to atomically control the external provider.

---

## 26. External-System Idempotency

For external side effects, we want the external operation itself to support idempotency.

Example:

idempotency_key = payment-123

First request:

payment-123
    ↓
Charge $100
    ↓
SUCCESS

Payment Service crashes.

Retry:

payment-123
    ↓
Charge $100
    ↓
Provider recognizes same key
    ↓
Already processed
    ↓
Do NOT charge again

The same logical operation can therefore be retried safely.

This is particularly important for operations such as:

- payment
- refunds
- financial transfers
- creating external resources
- other non-repeatable side effects

---

## 27. Outbox vs External Idempotency

These solve different problems.

### Outbox

Protects:

Local business DB
      +
Event publication intent

Example:

Payment DB
    +
PaymentSucceeded Outbox Event

---

### External Idempotency

Protects:

External side effect

Example:

Charge customer once

---

A robust Payment Service might therefore use both:

OrderCreated
     ↓
Payment Service
     ↓
External Provider
     ↓
Stable Idempotency Key
     ↓
Payment succeeds
     ↓
BEGIN TRANSACTION

    payment = SUCCESS

    PaymentSucceeded → Outbox

COMMIT
     ↓
Outbox Publisher
     ↓
Event Broker

---

## 28. Complete Reliability Mental Model

The complete flow looks like:

                 PRODUCER SIDE

              Business Operation
                      ↓
              ┌───────────────┐
              │ Business DB   │
              │               │
              │ business data │
              │ +             │
              │ outbox event  │
              └───────┬───────┘
                      │
                 Transaction
                      │
                      ↓
               Outbox Publisher
                      │
                      ↓
                 Event Broker
                      │
               possible duplicate
                      │
                      ↓

                 CONSUMER SIDE

               Idempotent Consumer
                      │
                      ↓
              ┌───────────────┐
              │ Consumer DB   │
              │               │
              │ business      │
              │ effect        │
              │ +             │
              │ processed ID  │
              └───────────────┘
                      │
                 Transaction


For external operations:

               Consumer / Service
                      ↓
               Idempotency Key
                      ↓
               External System
                      ↓
                 Safe Retry

---

## 29. Three Rules to Remember

### Rule 1 — Outbox

> **Make the local business change and the intent to publish its event atomic.**

---

### Rule 2 — Idempotent Consumer

> **If the same event arrives multiple times, produce only one business effect.**

---

### Rule 3 — External Idempotency

> **If an external operation may need to be retried, use a stable idempotency key when the external system supports it.**

---

## 30. Core Mental Model

When you see:

Database update
      +
Publish event

Think:

> **Dual-write problem → Outbox Pattern**

When you see:

Same event delivered twice

Think:

> **Idempotent Consumer**

When you see:

External side effect succeeded
but caller doesn't know whether it succeeded

Think:

> **External-system idempotency**

And remember the overall reliability philosophy:

> **Prefer retryable at-least-once delivery with idempotent processing over silently losing important business events.**
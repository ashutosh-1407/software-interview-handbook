# Event-Driven Architecture — Part 4: Failure Handling, Observability & Design Decisions

## 1. Failure Handling in Event-Driven Systems

Failures behave differently in asynchronous systems.

In a synchronous system:

Service A
    ↓
Service B ❌
    ↓
Error returned to Service A

The failure is immediately visible to the caller.

In EDA:

Producer
    ↓
Event Broker
    ↓
Consumer
    ↓
Processing ❌

The producer may have already completed successfully.

It may have no idea that the consumer is currently failing.

Therefore:

> **Asynchronous systems require explicit mechanisms for detecting, retrying, isolating, and observing failures.**

---

## 2. Consumer Failure Does Not Mean Event Loss

Suppose:

OrderCreated
     ↓
Analytics
     ↓
Processing fails ❌

If the consumer has not successfully committed its progress, the event can be processed again.

Conceptually:

OrderCreated
     ↓
Analytics
     ↓
Failure
     ↓
No successful progress commit
     ↓
Retry / redelivery

This gives us failure recovery.

However, repeatedly retrying immediately can create additional problems.

---

## 3. Retry

Some failures are temporary.

Examples:

- temporary database outage
- network timeout
- downstream service temporarily unavailable
- transient infrastructure failure

For these failures, retrying is reasonable.

Example:

Process Event
     ↓
Failure
     ↓
Retry
     ↓
Failure
     ↓
Retry
     ↓
Success

But retries should generally be bounded.

Otherwise one bad event could be retried forever.

---

## 4. Retry With Backoff

Suppose a downstream database is unavailable.

Immediately retrying thousands of times can make the situation worse.

Instead:

Attempt 1
   ↓
Failure
   ↓
Wait
   ↓
Attempt 2
   ↓
Failure
   ↓
Wait longer
   ↓
Attempt 3

This is commonly called:

> **Retry with backoff.**

The goal is to give the failing dependency time to recover instead of continuously overwhelming it.

We will study retry/backoff more deeply in the Reliability section of the handbook.

---

## 5. Poison Events

Sometimes the infrastructure is healthy, but one particular event always fails.

Example:

Analytics Events

Event 1001 → SUCCESS
Event 1002 → SUCCESS
Event 1003 → FAILURE
Event 1004 → waiting
Event 1005 → waiting

Suppose event 1003 contains malformed or unexpected data.

Retrying it indefinitely may prevent useful work from progressing.

Such an event is often called a:

> **Poison event/message.**

We need a mechanism to move it out of the normal processing path after retries are exhausted.

---

## 6. Dead-Letter Queue — DLQ

After a configured number of failed attempts:

Event
  ↓
Consumer
  ↓
Failure
  ↓
Retry
  ↓
Failure
  ↓
Retry exhausted
  ↓
DLQ

The DLQ isolates events that could not be successfully processed.

This allows the normal processing loop to continue.

Conceptually:

Main Event Stream
       ↓
    Consumer
       │
   ┌───┴────┐
   │        │
Success   Repeated Failure
   │        │
   ↓        ↓
 Done      DLQ

---

## 7. What Happens to Events in the DLQ?

A DLQ is not simply:

> "A place where bad events go and are forgotten."

Events in the DLQ should be observable and investigated.

For example:

DLQ
 ↓
Engineer investigates
 ↓
Identify bug / malformed data
 ↓
Fix problem
 ↓
Replay event if appropriate

Possible reasons for DLQ events include:

- application bug
- invalid data
- unexpected schema
- permanent downstream rejection
- repeated dependency failure

Important:

> **A growing DLQ is an operational signal that requires attention.**

---

## 8. Failure Isolation

Suppose:

OrderCreated
     │
     ├── Payment      ✅
     ├── Email        ✅
     ├── Fraud        ✅
     └── Analytics    ❌

Analytics failing should NOT prevent the other independent consumers from processing the event.

Analytics can:

Retry
  ↓
Backoff
  ↓
Retry
  ↓
DLQ if necessary

while:

Payment      → continues

Email        → continues

Fraud        → continues

This is one of the major motivations for EDA:

> **Independent consumer processing provides failure isolation.**

---

## 9. Why Observability Is More Important in EDA

Consider:

Order Service
     ↓
OrderCreated
     ↓
Event Broker
     ↓
Email Service

The Order Service successfully publishes the event.

From its perspective:

SUCCESS

But suppose Email Service stopped processing events 20 minutes ago.

Nothing necessarily fails in the Order Service.

This means:

> **No immediate error does not mean the entire asynchronous workflow is healthy.**

We need observability across the event pipeline.

---

## 10. Consumer Lag

One of the most important metrics is:

> **Consumer lag.**

Suppose the broker has events through offset:

1,000,000

but Email has only processed through:

900,000

Then:

Consumer Lag = 100,000 events

If incoming events continue while Email is unhealthy:

Broker:

1,000,000
1,010,000
1,020,000
1,030,000

Email:

900,000

Consumer lag keeps growing.

A growing lag can indicate:

- consumer failure
- consumer processing too slowly
- downstream bottleneck
- insufficient consumer capacity
- traffic spike

---

## 11. Throughput

Another important signal is consumer throughput.

For example:

Normal:

Incoming events = 10K/sec
Email processing = 10K/sec

Then suddenly:

Incoming events = 10K/sec
Email processing = 0/sec

Consumer lag will rapidly increase.

Throughput helps answer:

> **How quickly is the consumer actually processing events?**

A sudden drop can indicate a consumer problem.

---

## 12. Processing Latency / Event Age

Suppose an event was created at:

10:00:00

but Email processes it at:

10:05:00

The event experienced approximately:

5 minutes

of end-to-end processing delay.

This can happen even if the consumer is technically still processing events.

Therefore we should also monitor:

> **How old are events when they are successfully processed?**

This helps distinguish:

Consumer is working

from:

Consumer is keeping up.

---

## 13. Error, Retry, and DLQ Rates

Suppose consumer throughput remains high, but:

Retry count ↑

Error rate ↑

DLQ size ↑

The consumer may be alive but encountering problematic events.

Useful signals therefore include:

- processing errors
- retry count
- retry rate
- DLQ depth
- DLQ growth rate

These help distinguish different failure modes.

---

## 14. Core EDA Observability Signals

For V1, remember:

### Consumer Lag

> How far behind is the consumer?

### Throughput

> How many events are being processed?

### Processing Latency / Event Age

> How long does it take an event to reach successful processing?

### Errors / Retries / DLQ

> Is processing repeatedly failing?

Together:

> **Lag + throughput + latency + failures provide a strong basic view of consumer health.**

---

## 15. A Consumer Can Be Healthy but Still Fall Behind

Suppose:

Incoming Rate:

10K events/sec

Consumer Capacity:

7K events/sec

The consumer is not crashing.

Every event it processes succeeds.

But:

Backlog growth:

10K - 7K

=

3K events/sec

Consumer lag continuously increases.

Therefore:

> **Successful processing does not necessarily mean sufficient processing capacity.**

We must monitor whether consumers can sustainably keep up with incoming traffic.

---

## 16. The Downstream System May Be the Real Bottleneck

Suppose:

Event Broker
     ↓
Analytics Consumers
     ↓
Analytics Database

We observe:

Incoming = 10K/sec

Analytics DB sustainable capacity = 5K/sec

Adding consumers:

5 Consumers
     ↓
10 Consumers
     ↓
20 Consumers

does not necessarily solve the problem.

Instead:

20 Consumers
      ↓
Analytics DB
      ↓
💥

The database is the bottleneck.

Therefore:

> **Adding consumers or partitions does not increase sustainable throughput when the bottleneck is downstream.**

---

## 17. Protecting a Slow Downstream Dependency

Suppose the Analytics database is overloaded.

Instead of continuously increasing consumer concurrency, we may deliberately reduce pressure.

Conceptually:

Event Stream
     ↓
Controlled Consumer Concurrency
     ↓
Analytics DB

Consumer lag may temporarily grow:

Lag ↑

but the database remains healthy.

Once the downstream system recovers:

Consumer throughput ↑

Lag begins shrinking.

This is often preferable to overwhelming the database and causing a larger system failure.

Possible long-term solutions include:

- scale the downstream database
- optimize processing
- increase sustainable downstream capacity
- reduce incoming work
- throttle producers where appropriate

Important:

> **The queue/stream can absorb temporary backlog, but it cannot fix a permanent capacity mismatch.**

---

## 18. Backlog Is Sometimes Intentional

Consumer lag is not always immediately catastrophic.

Suppose:

Traffic spike
     ↓
Incoming = 20K/sec
     ↓
Consumer capacity = 10K/sec
     ↓
Lag grows temporarily

After the spike:

Incoming = 5K/sec
Consumer capacity = 10K/sec

Now the consumer has spare capacity:

10K - 5K = 5K/sec

which can be used to process the backlog.

Therefore:

> **Temporary consumer lag can be an acceptable buffering mechanism if the system has enough later capacity to catch up.**

The key question is whether the mismatch is:

Temporary

or

Permanent.

---

## 19. When NOT to Use Event-Driven Architecture

EDA provides powerful benefits, but it should not be the default solution for every interaction.

Suppose:

Service A
   ↓
Service B
   ↓
Service C

Requirements:

- every step must complete before returning success
- strict immediate consistency
- no need for replay
- no independent consumers
- caller needs the final result immediately

Using EDA might produce:

Service A
   ↓
Event
   ↓
Service B
   ↓
Event
   ↓
Service C
   ↓
Event
   ↓
Coordinate final result

This adds:

- broker hops
- asynchronous coordination
- failure states
- correlation complexity
- eventual consistency concerns
- operational overhead

without providing much benefit.

---

## 20. Prefer Synchronous Communication When the Result Is Needed Now

Suppose:

GET /account/balance

Requirement:

> The caller needs the current authoritative balance before continuing.

A synchronous interaction is usually simpler:

Client
   ↓
Account Service
   ↓
Current Balance
   ↓
Client

Using an event round trip:

Client
   ↓
BalanceRequested
   ↓
Broker
   ↓
Account Consumer
   ↓
BalanceCalculated
   ↓
Broker
   ↓
Client

would add unnecessary complexity and latency.

A useful rule:

> **If the caller needs the result immediately to continue, synchronous communication is often the better choice.**

---

## 21. When EDA Is a Strong Fit

EDA becomes attractive when we have requirements such as:

### Independent Consumers

OrderCreated
     │
     ├── Email
     ├── Analytics
     ├── Fraud
     └── Recommendation

Each consumer can operate independently.

---

### Failure Isolation

Analytics failing should not stop Email or Fraud.

---

### Replay

A consumer may need to rebuild its state from historical events.

---

### Extensibility

A new consumer may be added later without redesigning the producer.

---

### Asynchronous Work

The caller does not need to wait for every downstream operation.

---

### Independent Scaling

Different consumers may have very different processing requirements.

---

## 22. When EDA May Be Overkill

EDA may be unnecessary when:

- there is only one simple request/response interaction
- the caller requires an immediate answer
- all steps must succeed before responding
- strict consistency is required
- there is no independent downstream processing
- replay provides no value
- the workflow is naturally sequential
- operational simplicity matters more than asynchronous flexibility

Important:

> **Do not choose EDA simply because it sounds more scalable or modern.**

Architecture should follow the requirements.

---

## 23. Critical vs Optional Business Operations

A useful way to decide what belongs in the asynchronous path is to classify operations.

Suppose an order workflow includes:

Payment

Inventory

Email

Analytics

Recommendation Update

Ask:

> **Which operations must succeed before the business operation can be considered successful?**

If the business says:

Payment        → Critical
Inventory      → Critical
Email          → Optional
Analytics      → Optional
Recommendation → Optional

we might choose:

                 SYNCHRONOUS

User
 ↓
Payment
 ↓
Inventory
 ↓
Create Order
 ↓
Response

                 ASYNCHRONOUS

OrderCreated
     │
     ├── Email
     ├── Analytics
     └── Recommendation

But if the business allows:

Order = PAYMENT_PENDING

then Payment itself could move into the asynchronous workflow.

Therefore:

> **The business transaction boundary determines what should be synchronous versus asynchronous.**

---

## 24. If the Event Broker Fails

Suppose:

Producer
   ↓
Event Broker ❌
   ↓
Consumers

Without reliable publication mechanisms, events could be lost.

With the Outbox Pattern:

Business DB
    ↓
Business Change
+
Outbox Event
    ↓
COMMIT
    ↓
Publisher
    ↓
Broker ❌

The event remains durable in the Outbox and can be retried.

However, if the broker remains unavailable for a long time:

Outbox backlog ↑

Eventually this may create:

- storage pressure
- delayed downstream processing
- stale business state
- operational alerts

Therefore broker availability and Outbox backlog should be monitored.

---

## 25. If a Consumer Fails

Suppose:

Event Broker
     ↓
Analytics ❌

Other consumers:

Email       ✅

Fraud       ✅

Payment     ✅

continue independently.

Analytics lag grows.

When Analytics recovers:

Committed Position
       ↓
Resume
       ↓
Process backlog
       ↓
Catch up

If particular events repeatedly fail:

Retry
  ↓
Backoff
  ↓
DLQ

This is the normal failure-isolation model.

---

## 26. If a Downstream Database Fails

Suppose:

Event Broker
     ↓
Analytics Consumer
     ↓
Analytics DB ❌

The consumer should not blindly increase pressure on the failing database.

Instead:

Retry / Backoff
      ↓
Controlled Concurrency
      ↓
Allow Lag to Grow Temporarily
      ↓
Database Recovers
      ↓
Consumer Catches Up

If the database cannot sustainably handle the workload:

> **The architecture has a capacity problem, not merely a consumer problem.**

The sustainable throughput of the pipeline is limited by its bottleneck.

---

## 27. If a Poison Event Appears

Suppose:

E1 → SUCCESS
E2 → SUCCESS
E3 → FAIL
E4 → waiting
E5 → waiting

After bounded retries:

E3
 ↓
DLQ

Then:

E4
E5

can continue when the processing semantics allow it.

Engineers can investigate E3 separately.

Important:

> **One permanently bad event should not indefinitely block unrelated useful work.**

Ordering requirements may affect exactly how this is implemented, but the architectural goal remains the same.

---

## 28. Critical vs Optional Features in EDA

### Critical

These are fundamental to a reliable EDA system:

- durable event publication
- appropriate delivery semantics
- consumer progress tracking
- idempotent processing where duplicates matter
- retry handling
- failure isolation
- monitoring
- appropriate ordering guarantees
- capacity planning

Without these, failures can lead to:

- lost events
- duplicate business effects
- stuck consumers
- inconsistent state
- undetected backlog

---

### Optional / Requirement-Dependent

These depend on system complexity and requirements:

- Outbox Pattern
- CDC
- DLQ
- Saga
- Saga Orchestrator
- schema registry
- read models
- event replay
- complex event versioning
- dedicated workflow engines

For example:

A simple analytics event pipeline may not require a Saga.

A multi-step order/payment/inventory workflow may.

A system with no DB + broker dual-write may not require an Outbox.

Architecture should solve actual failure modes rather than mechanically applying every available pattern.

---

## 29. Business Impact

EDA is not primarily about brokers, partitions, or events.

Its value comes from business capabilities.

### Faster User Responses

Optional downstream work can happen asynchronously.

Example:

Create Order
     ↓
Return Success

instead of waiting for:

Email
Analytics
Recommendation

---

### Failure Isolation

Analytics being unavailable does not necessarily stop order creation or email.

---

### Easier Extensibility

New consumers can react to existing events without tightly coupling themselves to producers.

---

### Independent Scaling

Analytics may need significantly more processing capacity than Email.

They can scale separately.

---

### Recovery and Replay

With retained event streams, consumers can recover from outages and rebuild state.

---

But these benefits come with costs:

- eventual consistency
- duplicate handling
- ordering complexity
- harder debugging
- more infrastructure
- distributed workflow complexity
- increased observability requirements

Therefore:

> **EDA trades centralized simplicity for distributed flexibility and independence.**

---

## 30. EDA Design Checklist

When considering EDA, ask:

### Business Boundary

What must complete before the user sees success?

### Independence

Can downstream work happen independently?

### Consistency

Can the business tolerate eventual consistency?

### Failure Isolation

Should one downstream failure affect others?

### Replay

Do consumers need historical events?

### Ordering

What actually needs ordering?

Global?

Per customer?

Per order?

Per account?

### Duplicates

Can the same event safely be processed more than once?

### Reliable Publication

What happens if the DB succeeds but publishing fails?

### Compensation

What happens if step 1 and step 2 succeed but step 3 permanently fails?

### Capacity

Can consumers and downstream systems sustainably handle the incoming event rate?

### Observability

How will we detect:

- growing lag
- processing failures
- retry storms
- DLQ growth
- stale consumers
- downstream bottlenecks?

---

## 31. Complete EDA Mental Model

A robust event-driven workflow may look like:

                    PRODUCER
                       │
                       ▼
                Business Change
                       +
                  Outbox Event
                       │
                  Transaction
                       │
                       ▼
                Outbox Publisher
                       │
                       ▼
                  Event Broker
                       │
              ┌────────┼─────────┐
              ↓        ↓         ↓
          Consumer A Consumer B Consumer C
              │        │         │
              ↓        ↓         ↓
         Idempotent Processing
              │
              ▼
          Local Business State


Consumers may:

- process independently
- scale independently
- fail independently
- retry independently
- maintain independent positions
- replay retained events

If a distributed workflow partially fails:

Saga
 ↓
Compensating Actions

If an event repeatedly fails:

Retry
 ↓
Backoff
 ↓
DLQ

If consumers fall behind:

Consumer Lag
 ↓
Investigate
 ↓
Consumer?
Downstream?
Capacity?
Traffic spike?

---

## 32. Final Mental Model

When designing an event-driven system, think in this order:

1. What is the actual business transaction?

2. What work must be synchronous?

3. What work can happen independently?

4. What facts should become events?

5. What happens if event publication fails?

6. What happens if an event is delivered twice?

7. What ordering does the business actually require?

8. What happens if a consumer is unavailable?

9. What happens if a multi-step workflow partially succeeds?

10. How will we know when the asynchronous system is unhealthy?

The important lesson is not:

> "Use events everywhere."

It is:

> **Use events when independence, failure isolation, replay, asynchronous processing, or extensibility justify the additional distributed-systems complexity.**

---

# Event-Driven Architecture — V1 Summary

EDA:

Producer
   ↓
Event
   ↓
Broker
   ↓
Independent Consumers

Reliable publication:

Business DB
   +
Outbox
   ↓
Same Transaction
   ↓
Publisher
   ↓
Broker

Duplicate safety:

At-Least-Once Delivery
        ↓
Idempotent Consumer
        ↓
One Business Effect

Ordering:

Related Entity
      ↓
Partition Key
      ↓
Per-Entity Ordering

Distributed workflow:

Local Transaction
      ↓
Local Transaction
      ↓
Local Transaction Fails
      ↓
Saga
      ↓
Compensation

Failure handling:

Failure
   ↓
Retry
   ↓
Backoff
   ↓
DLQ

Observability:

Consumer Lag
+
Throughput
+
Processing Latency
+
Errors / Retries / DLQ

And the final architectural rule:

> **EDA is a tradeoff: we gain loose coupling, independent processing, failure isolation, replay, and extensibility at the cost of eventual consistency, duplicate handling, ordering concerns, observability needs, and distributed workflow complexity.**
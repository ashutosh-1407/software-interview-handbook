# Event-Driven Architecture — Part 3: Ordering, Consistency & Distributed Workflows

## 1. Ordering in Event-Driven Systems

Idempotency protects us from duplicate events.

However, it does NOT protect us from events being processed in the wrong order.

Consider:

PaymentSucceeded
      ↓
PaymentRefunded

The correct final state is:

Payment = REFUNDED

But suppose the events are processed as:

PaymentRefunded
      ↓
PaymentSucceeded

The final state might incorrectly become:

Payment = SUCCEEDED

The consumer could be perfectly idempotent and still produce the wrong result.

Therefore:

> **Idempotency protects against duplicates; ordering protects against events being applied in the wrong sequence.**

---

## 2. Global Ordering vs Per-Entity Ordering

Suppose we have:

Order 123:
PaymentSucceeded
PaymentRefunded

Order 456:
PaymentSucceeded
PaymentRefunded

Order 789:
PaymentSucceeded
PaymentRefunded

We generally do NOT need:

Order 123 PaymentSucceeded
      ↓
Order 456 PaymentSucceeded
      ↓
Order 789 PaymentSucceeded
      ↓
Order 123 PaymentRefunded
      ↓
...

to have one global order.

What we actually care about is:

Order 123:

PaymentSucceeded
      ↓
PaymentRefunded

Order 456:

PaymentSucceeded
      ↓
PaymentRefunded

The events for each individual order need to remain ordered.

Events belonging to different orders can usually be processed concurrently.

This gives us:

> **Per-entity ordering instead of global ordering.**

---

## 3. Partition Key and Ordering

A common solution is to use:

order_id

as the partition key.

Conceptually:

order_id
    ↓
hash(order_id)
    ↓
Partition

For example:

Order 123 ──→ Partition 1
Order 456 ──→ Partition 3
Order 789 ──→ Partition 2
Order 999 ──→ Partition 1

Important:

> **One order does NOT necessarily get one physical partition.**

Many orders can share the same partition.

The important property is:

> **Events for the same order should consistently map to the same partition.**

Therefore:

Partition 1:

Order123 PaymentSucceeded
Order999 PaymentSucceeded
Order123 PaymentRefunded
Order999 PaymentRefunded

The partition maintains ordering for the events it contains.

---

## 4. Ordering vs Throughput

Suppose we require strict global ordering.

We might effectively constrain processing toward:

Event 1
   ↓
Event 2
   ↓
Event 3
   ↓
Event 4

This limits parallelism.

But if we only need per-order ordering:

Partition 1        Partition 2        Partition 3
    ↓                  ↓                  ↓
Order 123          Order 456          Order 789
    ↓                  ↓                  ↓
Events             Events             Events

different partitions can be processed concurrently.

Therefore:

> **Ordering and throughput often involve a tradeoff.**

Global ordering:

Strong ordering
     ↓
Less parallelism

Per-entity ordering:

Ordering where needed
     +
More parallelism

A useful system-design question is:

> **What actually needs to be ordered?**

Do not require global ordering unless the business genuinely needs it.

---

## 5. Eventual Consistency Revisited

Suppose Payment Service publishes:

PaymentSucceeded

But Order Service has not consumed the event yet.

At that moment:

Payment Service:

payment = SUCCEEDED

Order Service:

order = PAYMENT_PENDING

This is not necessarily a failure.

The systems are processing independently.

Eventually:

PaymentSucceeded
      ↓
Order Service
      ↓
order = PAID

The services converge toward the correct state.

This is:

> **Eventual consistency.**

---

## 6. Why EDA Often Introduces Eventual Consistency

With synchronous communication:

Order Service
      ↓
Payment Service
      ↓
Wait for response
      ↓
Update Order
      ↓
Return response

the caller waits for the dependent operation.

With asynchronous communication:

Order Service
      ↓
OrderCreated
      ↓
Return
      ↓
Payment processes later
      ↓
PaymentSucceeded
      ↓
Order updates later

there is naturally a period where different services may have different views of the business state.

Therefore:

> **Independent asynchronous processing often means accepting temporary inconsistency.**

---

## 7. Business Invariants Still Matter

Eventual consistency does NOT mean:

> "Anything can happen temporarily."

Some business rules must never be violated.

Suppose the requirement is:

> **Never ship an order before payment succeeds.**

We could still use an asynchronous workflow:

OrderCreated
     ↓
Payment Service
     ↓
PaymentSucceeded
     ↓
Shipping Service

Shipping does not create the shipment until it receives the required payment-success event.

The order might temporarily remain:

PAYMENT_PENDING

but the critical invariant remains:

No PaymentSucceeded
        ↓
No Shipment

Therefore:

> **EDA can tolerate temporary state differences while still enforcing important business invariants.**

---

## 8. When Stronger Consistency May Be Required

Suppose the requirement says:

> "The user must immediately see the authoritative payment status before continuing."

An asynchronously updated Order Service may not satisfy this requirement.

For example:

Payment succeeded
      ↓
PaymentSucceeded published
      ↓
Order Service hasn't processed it
      ↓
GET /orders/123
      ↓
PAYMENT_PENDING

If the business cannot tolerate this, we may need a synchronous operation on the critical path.

For example:

Client
   ↓
Authoritative Payment Service
   ↓
Current Payment Status
   ↓
Client

Important:

> **Architecture follows the consistency requirement.**

Do not force EDA onto a workflow that fundamentally requires an immediate authoritative answer.

---

## 9. Distributed Business Transactions

Now consider an asynchronous order workflow:

OrderCreated
     ↓
Payment
     ↓
PaymentSucceeded
     ↓
Shipping
     ↓
ShipmentCreated

These operations may happen in different services with different databases.

For example:

Order Service
     ↓
Order DB

Payment Service
     ↓
Payment DB

Shipping Service
     ↓
Shipping DB

There is no single local database transaction covering the entire workflow.

---

## 10. The Partial Failure Problem

Suppose:

Order Created          ✅
Payment Succeeded      ✅
Shipping               ❌

Now:

Order exists           ✅
Customer charged       ✅
Shipment created       ❌

We cannot simply execute:

ROLLBACK

because the successful operations occurred across independent systems.

This is a distributed business workflow.

We need a way to bring the business back to a valid state.

---

## 11. Compensation

Suppose Shipping permanently fails because the item cannot be shipped.

We might perform:

ShippingFailed
      ↓
RefundPayment
      ↓
PaymentRefunded
      ↓
CancelOrder

Instead of technically undoing the original database transactions, we perform new business operations that compensate for them.

For example:

Payment succeeded
      ↓
Shipping failed
      ↓
Refund payment

Another example:

Inventory reserved
      ↓
Payment failed
      ↓
Release inventory

Another:

Coupon consumed
      ↓
Order cancelled
      ↓
Restore coupon

These are called:

> **Compensating actions.**

---

## 12. Compensation Is Not a Database Rollback

This distinction is important.

A database rollback might mean:

BEGIN TRANSACTION

    Update A
    Update B

ROLLBACK

Neither change becomes permanent.

A distributed compensation is different:

Payment succeeded      ← already happened
      ↓
Later...
      ↓
Refund payment         ← NEW business operation

The original payment happened.

The refund does not erase history.

Instead, it creates another business action that restores the desired business state.

Therefore:

> **Compensation is a business-level undo, not a technical database rollback.**

---

## 13. Saga Pattern

A Saga is a way to manage a business transaction that spans multiple independent services.

Instead of one distributed transaction:

BEGIN

Order
Payment
Inventory
Shipping

COMMIT

we perform a sequence of local transactions.

Example:

Create Order
     ↓
Process Payment
     ↓
Reserve Inventory
     ↓
Create Shipment

Each service commits its own local transaction.

If a later step fails, compensating actions are executed.

Example:

Create Order          ✅
Process Payment       ✅
Reserve Inventory     ✅
Create Shipment       ❌
      ↓
Release Inventory
      ↓
Refund Payment
      ↓
Cancel Order

This is the core idea:

> **Saga = sequence of local transactions + compensating actions for failure.**

---

## 14. Why Saga Is Needed

Suppose:

Order DB
Payment DB
Inventory DB
Shipping DB

are all independent.

We generally cannot rely on one simple local transaction spanning all four systems.

Instead:

Order transaction       → COMMIT

Payment transaction     → COMMIT

Inventory transaction   → COMMIT

Shipping transaction    → FAIL

At that point, earlier transactions have already committed.

Saga provides a business-level mechanism for handling this partial completion.

---

## 15. Saga Choreography

One way to implement a Saga is:

> **Choreography.**

There is no central workflow coordinator.

Services react to events.

Example:

Order Service
     ↓
OrderCreated
     ↓
Payment Service
     ↓
PaymentSucceeded
     ↓
Inventory Service
     ↓
InventoryReserved
     ↓
Shipping Service
     ↓
ShipmentCreated

Each service:

1. consumes an event
2. performs its local operation
3. publishes another event

---

## 16. Choreography Failure Flow

Suppose Shipping fails.

We might have:

Shipping Service
      ↓
ShippingFailed
      ↓
Inventory Service
      ↓
InventoryReleased
      ↓
Payment Service
      ↓
PaymentRefunded
      ↓
Order Service
      ↓
OrderCancelled

There is no single component controlling the complete workflow.

Each service reacts to relevant events.

---

## 17. Advantages of Choreography

Choreography provides:

### Loose Coupling

Services react to events rather than being directly coordinated by one central workflow component.

### Natural EDA Model

Services publish facts and independently react to other facts.

### Independent Services

Each service owns its local business logic.

For relatively simple workflows, this can be elegant.

---

## 18. The Problem With Complex Choreography

Suppose the workflow becomes:

Order
  ↓
Payment
  ↓
Inventory
  ↓
Fraud
  ↓
Shipping
  ↓
Loyalty

Now introduce multiple failure paths:

ShippingFailed
      ↓
ReleaseInventory
      ↓
RefundPayment
      ↓
CancelOrder

FraudRejected
      ↓
ReleaseInventory
      ↓
RefundPayment
      ↓
CancelOrder

InventoryFailed
      ↓
RefundPayment
      ↓
CancelOrder

The workflow logic becomes distributed across many services.

It may become difficult to answer:

- What step is the order currently in?
- Which service is responsible for the next action?
- Which compensations already happened?
- What happens if compensation fails?
- Why is this order stuck?

This is sometimes described informally as:

> **Event spaghetti.**

The system may be loosely coupled but difficult to reason about.

---

## 19. Saga Orchestration

Another approach is:

> **Orchestration.**

We introduce a Saga Orchestrator.

Conceptually:

                 Saga Orchestrator
                       │
             ┌─────────┼─────────┐
             ↓         ↓         ↓
          Payment   Inventory  Shipping

The orchestrator knows the workflow.

For example:

Create Order
     ↓
Process Payment
     ↓
Reserve Inventory
     ↓
Run Fraud Check
     ↓
Create Shipment

The orchestrator explicitly coordinates which step should happen next.

---

## 20. Orchestration Failure Flow

Suppose:

Payment             ✅
Inventory           ✅
Fraud               ✅
Shipping            ❌

The orchestrator knows which previous operations succeeded.

It can coordinate:

ShippingFailed
      ↓
ReleaseInventory
      ↓
RefundPayment
      ↓
CancelOrder

The overall workflow state is easier to see because coordination is centralized.

---

## 21. Events and Commands in Orchestration

Our earlier distinction becomes useful here.

The orchestrator might send:

ProcessPayment

This is a:

COMMAND

because it means:

> "Please perform this action."

Payment Service might respond by publishing:

PaymentSucceeded

This is an:

EVENT

because it means:

> "This happened."

Similarly:

Orchestrator:

RefundPayment
      ↓
COMMAND

Payment Service:

PaymentRefunded
      ↓
EVENT

So:

Command
   ↓
Request action

Event
   ↓
Report fact

---

## 22. Choreography vs Orchestration

### Choreography

No central coordinator.

Services react to events.

Example:

OrderCreated
     ↓
PaymentSucceeded
     ↓
InventoryReserved
     ↓
ShipmentCreated

Benefits:

- loose coupling
- natural event-driven model
- good for simpler workflows

Cost:

- complex workflows can become difficult to understand
- compensation logic becomes distributed
- debugging overall workflow state can become harder

---

### Orchestration

Central workflow coordinator.

Example:

Saga Orchestrator
      ↓
Payment
      ↓
Inventory
      ↓
Shipping

Benefits:

- workflow visible in one place
- easier to reason about complex flows
- easier to coordinate compensation
- easier to understand current workflow state

Cost:

- central coordinator knows the workflow
- more centralized coupling
- changing workflow may require changing orchestrator logic

---

## 23. Choosing Choreography vs Orchestration

There is no universal winner.

A useful rule is:

> **Simple independent reactions → choreography can work very well.**

> **Complex multi-step workflows with branching and compensation → orchestration often becomes easier to reason about.**

Do not choose choreography simply because:

> "Loose coupling is always better."

Too much distributed coordination can make the overall business process extremely difficult to understand.

Similarly, do not introduce an orchestrator for every simple event reaction.

The complexity of the business workflow should drive the choice.

---

## 24. Retry vs Compensation

This distinction is important.

Suppose Shipping fails because:

Database temporarily unavailable

This may be a transient failure.

We should probably:

Retry

But suppose Shipping fails because:

Item cannot legally be shipped to this location

Retrying 100 times will not help.

This is a permanent business failure.

We may need:

Compensation

Therefore:

Transient failure
      ↓
Retry

Permanent business failure
      ↓
Compensate

Examples:

Network timeout
      ↓
Retry

Temporary DB outage
      ↓
Retry

Invalid shipping destination
      ↓
Compensate

Inventory permanently unavailable
      ↓
Compensate

---

## 25. Compensation Can Also Fail

Suppose:

Shipping failed
      ↓
RefundPayment
      ↓
Refund fails ❌

Distributed workflows therefore need to consider failures during compensation as well.

Possible mechanisms include:

- retry
- backoff
- idempotent compensation
- alerting
- manual intervention

For V1, the important concept is:

> **Compensating actions are distributed operations too, so they can also fail and should be designed to be retryable/idempotent where possible.**

---

## 26. Event Schema as a Contract

Suppose we publish:

OrderCreated

{
    "event_id": "evt-123",
    "order_id": "order-456",
    "amount": 100
}

Consumers include:

OrderCreated
     │
     ├── Payment
     ├── Analytics
     ├── Fraud
     └── Recommendation

Once multiple consumers depend on this event, its schema becomes a contract.

Now suppose the producer suddenly changes:

amount

to:

total_amount

Old Analytics code might still expect:

amount

and begin failing.

Therefore:

> **Events are contracts between producers and consumers.**

---

## 27. Backward-Compatible Schema Evolution

Instead of immediately doing:

amount       ❌ removed

total_amount ✅ added

we can evolve the event more carefully.

For example:

{
    "event_id": "evt-123",
    "order_id": "order-456",
    "amount": 100,
    "total_amount": 100,
    "currency": "USD"
}

Old consumers can continue using:

amount

New consumers can use:

total_amount
currency

Later, the old field can be deliberately deprecated/versioned.

For V1, the important rule is:

> **Prefer backward-compatible event changes so independent consumers do not have to deploy simultaneously.**

More advanced schema registries and compatibility/versioning strategies can be studied later.

---

## 28. The Complete Distributed Workflow

Putting the concepts together:

Order Service
     ↓
OrderCreated
     ↓
Event Broker
     ↓
Payment Service
     ↓
PaymentSucceeded
     ↓
Event Broker
     ↓
Shipping Service
     ↓
ShipmentCreated

Each service:

- owns its own state
- commits local transactions
- communicates through events
- may process duplicates
- should be idempotent where needed
- can fail independently

If the workflow cannot complete:

ShippingFailed
      ↓
Compensation
      ↓
RefundPayment
      ↓
PaymentRefunded
      ↓
CancelOrder

For complex workflows:

Saga Orchestrator

may explicitly coordinate these steps.

---

## 29. Core Mental Model

When you see:

Event A
   ↓
Event B
   ↓
Event C

ask:

> **Do these events need ordering?**

If yes:

Choose an appropriate partition key such as `order_id`.

---

When you see:

Service A succeeds
Service B succeeds
Service C permanently fails

ask:

> **Can earlier successful operations be compensated?**

Think:

Saga.

---

When you see:

Simple event reactions across independent services

think:

Choreography.

---

When you see:

Complex workflow
+
many steps
+
branching
+
compensation

think:

Orchestration may be easier to reason about.

---

And remember:

> **EDA replaces one large distributed transaction with independent local transactions, asynchronous communication, and explicit handling of partial failure.**

That gives us loose coupling and resilience, but it also means we must deliberately design for:

- ordering
- eventual consistency
- retries
- idempotency
- compensation
- workflow coordination
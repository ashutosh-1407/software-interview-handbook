# Event-Driven Architecture — Part 1: Fundamentals

## 1. What Is Event-Driven Architecture?

Event-Driven Architecture (EDA) is an architectural style in which components communicate by producing and reacting to events.

An event represents:

> **Something that has already happened.**

Examples:

OrderCreated

PaymentSucceeded

PaymentFailed

ShipmentCreated

UserRegistered

Instead of one service explicitly telling every downstream service what to do, it publishes a fact.

Example:

Order Service
     ↓
OrderCreated
     ↓
Event Broker
     │
     ├── Email Service
     ├── Analytics Service
     ├── Fraud Service
     └── Recommendation Service

The Order Service does not need to know which services are interested in `OrderCreated`.

Each consumer independently decides how to react.

---

## 2. Why Do We Need Event-Driven Architecture?

Consider an order workflow implemented using synchronous calls:

Order Service
     ↓
Email Service
     ↓
Analytics Service
     ↓
Fraud Service
     ↓
Response

Now the Order Service is coupled to downstream services in several ways:

- their availability
- their latency
- their failure behavior
- their APIs
- their processing capacity

If Email becomes slow, the user's request may become slow.

If Analytics fails, the entire request might fail even though analytics is not required to create the order.

EDA allows us to separate the core business operation from independent side effects.

For example:

User
 ↓
Order Service
 ↓
Create Order
 ↓
OrderCreated
 ↓
Response

Meanwhile:

OrderCreated
     │
     ├── Email Service
     ├── Analytics Service
     └── Fraud Service

These consumers can process the event independently.

---

## 3. Start With the Business Transaction Boundary

An important design question is:

> **What must actually happen before the business operation can be considered successful?**

Suppose the business defines successful order creation as:

- payment completed
- inventory reserved
- order persisted

But email notification is not required.

Then we might use:

User
 ↓
Payment
 ↓
Inventory
 ↓
Create Order
 ↓
Response
      \
       → OrderCreated
              ↓
            Email

The user does not need to wait for Email.

However, if the business changes and allows payment to happen asynchronously, we might instead design:

Create Order
     ↓
PAYMENT_PENDING
     ↓
OrderCreated
     ↓
Payment Service
     ↓
PaymentSucceeded
     ↓
Order → PAID

Both architectures can be valid.

The choice depends on the business requirements.

Important:

> **EDA does not mean making everything asynchronous.**

We first determine which operations belong to the synchronous business boundary.

Then we decide which operations can safely happen asynchronously.

---

## 4. Events vs Commands

This is an important distinction in EDA.

### Event

An event describes something that already happened.

Examples:

OrderCreated

PaymentSucceeded

PaymentFailed

ShipmentCreated

An event says:

> **"This happened."**

It does not necessarily tell any particular consumer what to do.

For example:

OrderCreated
     │
     ├── Email
     ├── Analytics
     ├── Fraud
     └── Recommendation

Each consumer independently decides how to react.

---

### Command

A command expresses an intention for something to happen.

Examples:

ProcessPayment

RefundPayment

ReserveInventory

CreateShipment

A command says:

> **"Please do this."**

Conceptually:

ProcessPayment
      ↓
Payment Service

Commands generally have a specific responsible handler.

---

### Mental Model

Event:

PaymentSucceeded

means:

> "Payment succeeded."

Command:

RefundPayment

means:

> "Please refund this payment."

A useful rule:

> **Events describe facts. Commands request actions.**

---

## 5. Loose Coupling

One of the biggest benefits of EDA is loose coupling between producers and consumers.

Suppose:

Order Service
     ↓
OrderCreated
     ↓
Event Broker
     │
     ├── Email
     ├── Analytics
     └── Fraud

The Order Service only needs to know:

> "I need to publish OrderCreated."

It does not need to know:

- how Email processes it
- whether Analytics is currently available
- how Fraud stores its data
- how many consumers exist
- how quickly each consumer processes events

Later we might add:

Recommendation Service

Now:

OrderCreated
     │
     ├── Email
     ├── Analytics
     ├── Fraud
     └── Recommendation

The producer does not necessarily need to change.

This makes it easier to evolve the system by adding new independent consumers.

---

## 6. Independent Consumer Processing

Different consumers can process the same event independently.

Example:

OrderCreated
     │
     ├── Email
     ├── Analytics
     └── Fraud

Suppose:

Email       → 100 ms
Analytics   → 2 sec
Fraud       → 500 ms

Analytics being slower does not necessarily slow Email or Fraud.

Each consumer can:

- process independently
- scale independently
- fail independently
- maintain independent progress

This provides an important architectural property:

> **Failure isolation.**

---

## 7. Failure Isolation

Suppose:

OrderCreated
     │
     ├── Email       ✅
     ├── Analytics   ❌
     └── Fraud       ✅

Analytics failing should not prevent Email or Fraud from processing the event.

This is fundamentally different from a synchronous chain such as:

Order
 ↓
Email
 ↓
Analytics ❌
 ↓
Fraud

where failure in one component can prevent later work from happening.

With independent event consumers:

OrderCreated
     │
     ├── Email       continues
     ├── Analytics   retries independently
     └── Fraud       continues

Important:

> **One consumer's failure should not cascade to unrelated consumers.**

---

## 8. Producer and Consumer Independence

Once an event has been durably published, the producer should not need to care whether every consumer is currently available.

Example:

Payment Service
      ↓
PaymentSucceeded
      ↓
Event Stream
      ↓
Shipping Service ❌

Suppose Shipping is unavailable for 30 minutes.

Payment Service does not need to repeatedly call Shipping.

Instead:

PaymentSucceeded
      ↓
Retained Event Stream
      ↓
Shipping unavailable
      ↓
Shipping recovers
      ↓
Resume from committed position
      ↓
Process PaymentSucceeded

This connects directly with Event Streaming:

> **Independent consumer position + retained events = independent failure recovery.**

---

## 9. EDA and Event Streaming Are Related but Different

These concepts are closely related, but they solve different architectural questions.

### Event Streaming

Event Streaming focuses on:

- storing events
- partitioning
- offsets
- retention
- replay
- consumer groups
- ordering
- consumer lag

It answers:

> **How do we reliably store and distribute a stream of events?**

---

### Event-Driven Architecture

EDA focuses on:

- how services communicate through events
- how services remain loosely coupled
- how business workflows react to events
- how failures are isolated
- how distributed business operations are coordinated

It answers:

> **How should we structure a system around events?**

Event streaming infrastructure can be used to implement an event-driven architecture.

---

## 10. Retained Events and New Consumers

Suppose we initially have:

OrderCreated
     │
     ├── Email
     ├── Analytics
     └── Fraud

Six months later, we introduce:

Recommendation Service

If historical events are still retained, Recommendation Service can create its own consumer position and replay them:

Historical OrderCreated Events
          ↓
Recommendation Service
          ↓
Replay
          ↓
Build Recommendation State

Existing consumers do not need to rerun.

Email does not send old emails again.

Fraud does not redo its processing.

Recommendation independently consumes the retained history.

This is one major advantage of combining EDA with retained event streams.

---

## 11. Eventual Consistency

Asynchronous communication introduces an important tradeoff:

> **Different services may temporarily disagree about the current state.**

Example:

Payment Service
      ↓
Payment succeeds
      ↓
PaymentSucceeded published
      ↓
Order Service has NOT processed it yet

At this moment:

Payment Service:

payment = SUCCEEDED

Order Service:

order = PAYMENT_PENDING

The system is temporarily inconsistent.

Later:

PaymentSucceeded
      ↓
Order Service
      ↓
order = PAID

The system converges toward the expected state.

This is called:

> **Eventual consistency.**

---

## 12. Eventual Consistency Is a Business Decision

Eventual consistency is not automatically acceptable.

Suppose:

Payment succeeded
      ↓
PaymentSucceeded
      ↓
Order Service delayed by 30 sec

During those 30 seconds:

GET /orders/123

might return:

status = PAYMENT_PENDING

The architecture may be functioning correctly.

The question is:

> **Can the business tolerate this temporary inconsistency?**

For something like:

Analytics dashboard

a delay of several seconds may be completely acceptable.

For something like:

"Never ship an unpaid order"

we need stronger safeguards.

Important:

> **Consistency requirements should influence which operations are synchronous and which are asynchronous.**

---

## 13. Caching Does Not Solve Eventual Consistency

Suppose:

Payment Service = PAID

but:

Order Service = PAYMENT_PENDING

Adding a cache does not solve the fundamental problem.

A cache can make reads faster:

Client
  ↓
Cache
  ↓
Fast response

But if the underlying state has not yet received `PaymentSucceeded`, the cached representation may still be stale.

Therefore:

> **Caching improves access latency; it does not turn an eventually consistent architecture into a strongly consistent one.**

---

## 14. Read Models / Materialized Views

A read model is a representation of data designed specifically for efficient querying.

For example, events might be:

OrderCreated

PaymentSucceeded

ShipmentCreated

A consumer can build:

OrderReadModel

order_id        = 123
payment_status  = PAID
shipping_status = READY
order_status    = CONFIRMED

Then:

GET /orders/123

can query this precomputed representation instead of reconstructing the state from every event.

Conceptually:

Events
   ↓
Read Model Consumer
   ↓
Order Read Model
   ↓
GET /orders/123

Read models can improve:

- query performance
- read scalability
- simplicity of complex queries

However:

> **Read models do not eliminate eventual consistency.**

There is still propagation time:

Event published
      ↓
Consumer processes event
      ↓
Read model updated

Therefore the read model can temporarily be stale.

We will revisit this concept more deeply when discussing CQRS in a later iteration.

---

## 15. When Should Work Be Synchronous?

Synchronous communication is appropriate when the caller needs the result before continuing.

Example:

GET /account/balance

Suppose the requirement is:

> The caller must know the authoritative balance before performing the next operation.

A synchronous request is usually appropriate:

Client
   ↓
Account Service
   ↓
Current Balance
   ↓
Client

Trying to turn this into:

Client
   ↓
Event
   ↓
Consumer
   ↓
Another Event
   ↓
Client

would introduce unnecessary:

- coordination
- latency
- failure modes
- complexity

A useful mental model is:

> **Use synchronous communication when the caller needs the result now.**

> **Use asynchronous/event-driven communication when work can happen independently after a fact occurs.**

---

## 16. What EDA Gives Us

At this point, the major benefits should be clear.

### Loose Coupling

Producers don't need to know every downstream consumer.

### Independent Processing

Consumers react to events independently.

### Failure Isolation

One consumer failing does not necessarily block unrelated consumers.

### Independent Scaling

Different consumers can scale according to their own workload.

### Recovery

With retained events, consumers can resume from their previous position.

### Replay

New or repaired consumers can process historical events when retention allows.

### Extensibility

New consumers can often be introduced without redesigning the producer.

---

## 17. What EDA Does NOT Give Us for Free

EDA does not automatically provide:

- exactly-once processing
- immediate consistency
- correct event ordering
- duplicate protection
- atomic DB + broker writes
- automatic rollback across services
- simple debugging
- guaranteed downstream capacity
- compatibility between changing event schemas

These require additional design patterns and operational mechanisms.

The most important ones for our V1 are:

Outbox Pattern
    ↓
Reliable event publication

Idempotency
    ↓
Duplicate-safe processing

Ordering
    ↓
Correct sequence of related events

Saga
    ↓
Distributed workflow + compensation

Retries / DLQ
    ↓
Failure handling

Observability
    ↓
Detecting asynchronous failures

These are covered in the next parts.

---

## 18. Core Mental Model

Remember:

Business operation
       ↓
Event occurs
       ↓
Producer publishes fact
       ↓
Event Broker / Stream
       ↓
Independent Consumers
       │
       ├── Consumer A
       ├── Consumer B
       └── Consumer C

Each consumer:

- reacts independently
- maintains its own processing state
- can fail independently
- can recover independently

But the tradeoff is:

Loose coupling
      +
Independent processing
      +
Failure isolation
      +
Scalability
      ↓
More distributed coordination
      +
Eventual consistency
      +
More complex failure handling

The key architectural rule is:

> **Don't use EDA simply because asynchronous systems sound scalable. Use it when the business workflow benefits from loose coupling, independent processing, failure isolation, or replay.**
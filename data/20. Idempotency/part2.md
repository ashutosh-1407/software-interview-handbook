# Idempotency — Part 2
## Recovery, Failure Handling, and Distributed Systems

---

## 15. Recovering a Stuck `PROCESSING` State

A request can remain stuck:

```text
abc-123 → PROCESSING
```

if the worker crashes after claiming the operation.

A production system needs a way to determine whether the work is still active or abandoned.

Useful signals include:

```text
lease / ownership
heartbeat
started_at
last_updated_at
worker identity
timeout / deadline
```

Mental model:

```text
PROCESSING + active owner
        ↓
     still running

PROCESSING + abandoned owner
        ↓
      recover
```

### Important

A timeout does **not** prove that the external operation failed.

The external system may have completed successfully even though our worker timed out.

---

## 16. Recovering an Abandoned Operation

When an operation is stuck in `PROCESSING`, recovery should prefer a safe mechanism:

```text
PROCESSING
    ↓
Provider idempotency
    OR
Provider status lookup
    ↓
Determine outcome
    ↓
COMPLETED / FAILED
```

If the provider supports idempotency:

```text
Retry same idempotency key
        ↓
Provider recognizes operation
        ↓
Safe recovery
```

If the provider supports status lookup:

```text
PROCESSING
    ↓
Query provider
    ↓
SUCCESS → mark COMPLETED
FAILED  → recover/retry
```

### Key Principle

> Recovery must account for the possibility that the external side effect already happened.

---

## 17. What If the Provider Supports Neither?

Suppose the external system provides:

- no idempotency key
- no status lookup
- no reliable transaction identifier

Then after a crash:

```text
Request sent
    ↓
Service crashes
    ↓
Unknown outcome
```

We cannot reliably determine whether the external side effect occurred.

A local DB transaction cannot solve this:

```text
Our DB transaction
        ≠
External provider transaction
```

Possible solutions may require:

- a different integration
- a provider with idempotency support
- a reconciliation mechanism
- a business-specific recovery process

### Key Principle

> Distributed transactions cannot be created simply by wrapping our database operation in a local transaction.

---

## 18. Idempotency and Queue Delivery

Consider:

```text
Order Service
      ↓
Message Queue
      ↓
Payment Worker
      ↓
Payment Provider
```

The queue may deliver the same logical message more than once.

For example:

```text
Message #1 → Worker → PROCESSING
                  ↓
               Payment
                  ↓
               Worker crashes
```

The queue may redeliver:

```text
Message #2 → Worker
```

Without idempotency:

```text
Message #1 → Charge $100
Message #2 → Charge $100 again ❌
```

With idempotency:

```text
Message #1
    ↓
Claim abc-123
    ↓
Process

Message #2
    ↓
Claim abc-123
    ↓
Duplicate → don't process again
```

### Key Principle

> Idempotency is needed at the consumer when message delivery can occur more than once.

---

## 19. Outbox vs Idempotency

These solve different problems.

### Outbox

Protects the boundary:

```text
Database → Message Queue
```

It prevents:

```text
DB update ✓
Queue publish ✗
```

from losing the event.

### Consumer Idempotency

Protects:

```text
Queue → Worker
```

It prevents duplicate processing.

### Provider Idempotency

Protects:

```text
Worker → External Provider
```

It prevents duplicate external side effects.

```text
DB
 ↓
Outbox
 ↓
Queue
 ↓
Idempotent Worker
 ↓
Idempotent Provider
```

### Key Principle

> Outbox provides reliable publication; idempotency prevents duplicate effects.

---

## 20. Idempotency Across Multiple Boundaries

A robust payment workflow may therefore have multiple protections:

```text
┌──────────┐
│ Database │
└────┬─────┘
     │
     │ Outbox
     ↓
┌──────────┐
│  Queue   │
└────┬─────┘
     │
     │ at-least-once delivery
     ↓
┌──────────┐
│  Worker  │
└────┬─────┘
     │
     │ worker idempotency
     ↓
┌──────────┐
│ Provider │
└──────────┘
     │
     │ provider idempotency
     ↓
 External side effect
```

Each layer addresses a different failure boundary.

---

## 21. Idempotency and Exactly-Once

Idempotency does **not** mean exactly-once execution.

The system could execute:

```text
Attempt 1
Attempt 2
Attempt 3
```

but still produce the same intended business effect as one execution.

```text
Exactly-once execution
        ≠
Idempotency
```

A useful system-design model is:

```text
At-least-once processing
        +
Idempotency
        ↓
Effectively-once business outcome
```

### Key Principle

> Focus on guaranteeing the business effect, rather than assuming distributed execution can literally happen only once.

---

## 22. Naturally Idempotent Operations

Not every operation requires an idempotency record.

For example:

```text
PUT /users/123

status = ACTIVE
```

Repeating it:

```text
ACTIVE → ACTIVE
ACTIVE → ACTIVE
```

does not create a new business effect.

But:

```text
POST /payments
```

could create:

```text
Charge $100
Charge $100 again
```

Therefore, whether an operation needs explicit idempotency depends on its **business semantics**.

### Key Principle

> Don't decide idempotency purely from the HTTP method. Decide based on the side effect.

---

## 23. Idempotency Record Lifecycle

A typical record might look like:

```text
tenant_id
idempotency_key
request_hash
status
response
created_at
expires_at
```

Typical lifecycle:

```text
              ┌─────────────┐
              │ PROCESSING  │
              └──────┬──────┘
                     │
              operation succeeds
                     │
                     ▼
              ┌─────────────┐
              │ COMPLETED   │
              └─────────────┘
```

The record can then be used to answer future duplicate requests.

---

## 24. Same Key + Different Request

An idempotency key represents one logical operation.

Example:

```text
Request A
key = abc-123
amount = $100
```

Later:

```text
Request B
key = abc-123
amount = $500
```

The server should detect the mismatch.

A request hash can be stored:

```text
idempotency_key | request_hash | status
----------------|--------------|---------
abc-123         | HASH($100)   | COMPLETED
```

Then:

```text
Same key
+
Same request
→ duplicate → return previous result
```

But:

```text
Same key
+
Different request
→ reject key reuse
```

### Key Principle

> The idempotency key identifies the logical operation, while the request hash protects against accidental key reuse.

---

## 25. Idempotency Key Scope

Keys don't necessarily need to be globally unique.

For a multi-tenant system:

```text
Tenant A → abc-123
Tenant B → abc-123
```

may represent two independent operations.

A database constraint could therefore be:

```text
UNIQUE(tenant_id, idempotency_key)
```

This makes the uniqueness boundary explicit.

Possible scopes depend on the business:

```text
tenant_id + idempotency_key
account_id + idempotency_key
user_id + idempotency_key
```

### Key Principle

> The uniqueness scope should match the business boundary where duplicate detection matters.

---

## 26. Idempotency Retention

Idempotency records don't necessarily need to live forever.

Keep them long enough that a delayed duplicate cannot reasonably arrive and cause harm.

Possible sources of delayed duplicates:

```text
Client retry
Queue redelivery
Network delay
Queued requests
Consumer recovery
Message replay
```

Mental model:

```text
Retention period
=
maximum realistic duplicate-arrival window
+
business considerations
```

The correct duration depends on the operation and system behavior.

---

## 27. Failure Handling for the Idempotency Store

The idempotency mechanism itself can fail.

For example:

```text
Client
   ↓
Payment Service
   ↓
Idempotency DB ❌
```

For a payment operation, blindly continuing could create duplicate side effects because the service can no longer determine whether the operation was already processed.

Therefore, the failure policy depends on the business operation.

For critical side effects:

```text
Cannot verify idempotency
        ↓
Do not blindly execute
```

For less critical operations, the system may have a different degradation strategy.

### Key Principle

> Idempotency is part of the correctness path when duplicate execution can cause irreversible business harm.

---

## 28. Idempotency + Retry/Backoff

Retry and idempotency solve different problems.

### Retry

Answers:

> "How do I recover from a transient failure?"

### Idempotency

Answers:

> "What happens if I execute the same logical operation again?"

Together:

```text
Transient failure
      ↓
Retry
      ↓
Same idempotency key
      ↓
Duplicate detected / same operation recovered
```

Without idempotency:

```text
Retry
  ↓
Potential duplicate side effect
```

Without retry:

```text
Idempotency
  ↓
Doesn't automatically recover failed operations
```

### Key Principle

> Retry provides recovery; idempotency makes that recovery safe.

---

## 29. Idempotency + Timeouts

A timeout creates ambiguity:

```text
Client
  ↓
Request
  ↓
Service
  ↓
External system
```

If the response doesn't arrive:

```text
Client timeout
```

we don't automatically know whether the operation failed.

Therefore:

```text
Timeout
  ≠
Operation failed
```

It may mean:

```text
Operation failed
OR
Operation succeeded but response was lost
OR
Operation is still processing
```

Idempotency allows the retry to safely refer to the same logical operation.

---

## 30. Interview Decision Framework

When you see a system-design problem involving retries or duplicate requests, ask:

### 1. Can the operation create a side effect?

```text
No → explicit idempotency may not be necessary
Yes → continue
```

### 2. Can the same logical operation be delivered more than once?

```text
Retries
Queue redelivery
Client duplicates
Network uncertainty
```

If yes, consider idempotency.

### 3. Where is the business boundary?

Choose the idempotency key scope accordingly.

```text
tenant + key
account + key
order + key
```

### 4. Can the operation race concurrently?

If yes:

```text
Use atomic claim / uniqueness constraint
```

### 5. Does an external system perform the side effect?

If yes:

```text
Provider idempotency
OR
Provider status lookup / reconciliation
```

### 6. What happens if the worker crashes?

Design recovery for:

```text
PROCESSING
```

rather than assuming the operation failed.

---

## 31. Business Impact

Idempotency is especially important for operations such as:

- payments
- order creation
- inventory reservations
- shipment creation
- provisioning resources
- financial transfers
- queue consumers with side effects

The common pattern is:

```text
Duplicate execution
       ↓
Duplicate business effect
       ↓
Potential financial/data/business damage
```

For naturally idempotent state-setting operations, the risk is much lower.

---

## 32. Final Mental Model

Think of idempotency as a protection around a **logical business operation**:

```text
                Same logical operation
                         │
                         ▼
                 Idempotency Key
                         │
                         ▼
                Atomic Claim
                         │
                         ▼
                    PROCESSING
                         │
                         ▼
                Business Operation
                         │
              ┌──────────┴──────────┐
              │                     │
         Success                Ambiguous
              │                     │
              ▼                     ▼
         COMPLETED          Provider idempotency
              │              / reconciliation
              │                     │
              └──────────┬──────────┘
                         ▼
                  Stored Result
                         │
                         ▼
                Future Duplicate
                         │
                         ▼
                  Return Result
```

### Golden Rule

> **Identify the logical operation → atomically claim it → perform the side effect → safely recover ambiguity → return the same business result for duplicates.**
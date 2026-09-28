# Idempotency — Part 3
## System Design Decisions, Failure Analysis, and Interview Framework

---

## 33. Where Should Idempotency Live?

Idempotency should be enforced at the **business operation boundary** where duplicate effects matter.

For example:

```text
Client
  ↓
Order API
  ↓
Payment Service
  ↓
Payment Provider
```

If the payment operation can be duplicated, the payment boundary needs idempotency.

But the exact implementation can differ:

```text
API layer
   ↓
Idempotency Store
```

or:

```text
Queue
   ↓
Worker
   ↓
Idempotency Store
```

or both.

### Key Principle

> Place idempotency where the system can identify and prevent duplicate execution of the logical business operation.

---

## 34. Idempotency Is Not Necessarily One Global Table

Different business operations may have different idempotency boundaries.

For example:

```text
Create Order
Create Payment
Create Shipment
```

may each have different:

- keys
- scopes
- retention periods
- recovery mechanisms
- business consequences

Therefore, don't automatically design:

```text
One global idempotency service for everything
```

Instead ask:

> What logical operation am I protecting?

---

## 35. Critical vs Optional Features

Not every part of an idempotency design has equal importance.

### Critical

For a payment system:

```text
✓ Stable idempotency key
✓ Atomic uniqueness/claim
✓ Duplicate detection
✓ Correct handling of PROCESSING
✓ Safe external-provider interaction
✓ Recovery/reconciliation
```

### Important but Context-Dependent

```text
Request hash
Key scoping
Response storage
Expiration/retention
Lease/heartbeat
```

### Advanced

```text
Dedicated idempotency service
Complex reconciliation workflows
Advanced distributed ownership
Sophisticated cleanup strategies
```

### Interview Principle

Start with the correctness-critical path before discussing operational sophistication.

---

## 36. If the Idempotency Store Fails

Consider:

```text
Payment Request
      ↓
Idempotency Store ❌
      ↓
Payment Provider
```

If the service cannot determine whether the operation was already processed, blindly continuing can create a duplicate side effect.

For a critical payment:

```text
Cannot verify idempotency
        ↓
Do not blindly execute
```

For a less critical operation, the business may permit a different degradation strategy.

### Key Principle

> If idempotency is part of the correctness guarantee, its failure must be treated as a correctness problem—not merely a performance problem.

---

## 37. Failure Scenario: Duplicate Concurrent Requests

### Scenario

```text
Request A ──┐
            ├──→ Service
Request B ──┘
```

Both use:

```text
idempotency_key = abc-123
```

### Bad Design

```text
CHECK
  ↓
NOT FOUND
  ↓
PROCESS
```

Both requests can process.

### Correct Design

```text
INSERT / CLAIM
      ↓
UNIQUE CONSTRAINT
      ↓
 ┌────┴────┐
 ↓         ↓
Winner   Duplicate
 ↓
Process   Skip/wait/recover
```

The exact duplicate behavior can depend on whether the first request is:

```text
PROCESSING
```

or:

```text
COMPLETED
```

---

## 38. Failure Scenario: Worker Crashes

```text
Request
  ↓
Claim key
  ↓
PROCESSING
  ↓
External operation
  ↓
Worker crashes 💥
```

Now:

```text
Idempotency DB → PROCESSING
Provider       → UNKNOWN
```

The recovery system should not simply assume failure.

Instead:

```text
PROCESSING
    ↓
Check provider
    ↓
 ┌──┴─────┐
 ↓        ↓
SUCCESS  FAILED
 ↓        ↓
Complete  Retry/recover
```

If the provider supports idempotency:

```text
Retry same key
```

can safely resolve the ambiguity.

---

## 39. Failure Scenario: Queue Redelivery

```text
Message Queue
      ↓
Message #1
      ↓
Worker
      ↓
Processing
      ↓
ACK lost
```

The queue may redeliver:

```text
Message #2
```

Without consumer idempotency:

```text
Message #1 → side effect
Message #2 → duplicate side effect ❌
```

With consumer idempotency:

```text
Message #1 → claim key → process
Message #2 → duplicate → don't process again
```

### Key Principle

> At-least-once delivery shifts duplicate-prevention responsibility to the consumer.

---

## 40. Failure Scenario: Client Retries After Timeout

```text
Client
  ↓
Request
  ↓
Service
  ↓
Provider
  ↓
SUCCESS
  ↓
Response lost
```

Client sees:

```text
TIMEOUT
```

and retries.

The retry must use:

```text
same idempotency key
```

not:

```text
new idempotency key
```

Otherwise the system sees two different logical operations.

```text
Same key
→ same operation

New key
→ potentially new operation
```

---

## 41. Idempotency + Circuit Breaker

Circuit breakers and idempotency solve different problems.

### Circuit Breaker

Protects the system from repeatedly calling an unhealthy dependency.

```text
Service
   ↓
Circuit Breaker
   ↓
Provider
```

### Idempotency

Protects against duplicate business effects.

```text
Request
   ↓
Idempotency
   ↓
Business Operation
```

They can work together:

```text
Request
   ↓
Idempotency
   ↓
Circuit Breaker
   ↓
Provider
```

A circuit breaker does **not** make a retry safe.

Idempotency does **not** prevent dependency overload.

### Key Principle

> Circuit breaker controls whether we call; idempotency controls the business effect if the operation is repeated.

---

## 42. Idempotency + Retry/Backoff

Retry answers:

> Can I try the operation again?

Idempotency answers:

> What happens if I try the same logical operation again?

Therefore:

```text
Timeout
  ↓
Retry with backoff
  ↓
Same idempotency key
  ↓
Safe duplicate handling
```

But idempotency does not mean every failure should be retried.

For example:

```text
Validation failure
→ don't retry

Permanent business rejection
→ don't retry

Transient network failure
→ potentially retry
```

### Key Principle

> Retry policy determines **whether** to retry; idempotency determines **how safely** the repeated operation can be handled.

---

## 43. Idempotency + Timeouts

A timeout should be treated as:

```text
UNKNOWN
```

rather than automatically:

```text
FAILED
```

Possible outcomes:

```text
Request
  ↓
Timeout
  ↓
┌──────────────┬──────────────┬──────────────┐
│              │              │
FAILED       SUCCEEDED      STILL RUNNING
```

Idempotency gives the system a stable identity for that operation while the outcome is resolved.

### Key Principle

> A timeout tells you that you didn't receive the result—not necessarily what happened to the operation.

---

## 44. Idempotency and Distributed Systems

The fundamental difficulty is the gap between:

```text
Our system
```

and:

```text
External system
```

For example:

```text
Our DB
   ↓
Payment Service
   ↓
Payment Provider
```

There is no automatic single transaction spanning all three.

Therefore, robust designs use mechanisms such as:

```text
Atomic local claim
+
Provider idempotency
+
Status reconciliation
+
Recovery
```

rather than assuming distributed atomicity.

---

## 45. Idempotency vs Deduplication

These concepts are related but not identical.

### Deduplication

Answers:

> "Have I seen this identifier/message before?"

Example:

```text
Message ID = abc-123
```

### Idempotency

Answers:

> "If this logical operation is executed again, can I guarantee the same intended business effect?"

A system may use deduplication as part of an idempotency implementation:

```text
Idempotency key
      ↓
Deduplication
      ↓
Prevent duplicate side effect
```

But simply detecting a duplicate does not automatically solve ambiguous external outcomes.

---

## 46. Idempotency vs Exactly-Once

### Exactly-once execution

Means:

```text
Operation executes physically once
```

### Idempotency

Means:

```text
Repeated execution
        ↓
same intended business effect
```

Distributed systems often cannot guarantee literal exactly-once execution across all boundaries.

Instead:

```text
At-least-once delivery
        +
Idempotent processing
        ↓
Effectively-once business effect
```

This is usually the more useful system-design guarantee.

---

## 47. Choosing the Idempotency Store

The idempotency store needs to support the correctness guarantees required by the operation.

Common characteristics:

```text
Atomic uniqueness
Durability
Consistent reads/writes
Fast lookup
Expiration/cleanup
```

A relational database is often a natural choice because it can provide:

```text
UNIQUE constraint
Transactions
Durability
```

The exact storage technology depends on:

- scale
- latency requirements
- retention
- consistency requirements
- business criticality

### Key Principle

> Choose the store based on the guarantees needed for duplicate prevention, not simply on lookup speed.

---

## 48. Response Storage

If a duplicate request arrives after completion, the service may return the original response.

For example:

```text
abc-123
status = COMPLETED
response = {
    payment_id: "pay-789",
    status: "SUCCESS"
}
```

Then:

```text
Retry abc-123
      ↓
COMPLETED
      ↓
Return stored response
```

This avoids re-executing the operation.

The exact response-retention strategy depends on:

- response size
- sensitivity
- retention period
- API requirements

---

## 49. Idempotency and Security

Idempotency keys should not automatically be treated as authorization.

For example:

```text
Idempotency-Key: abc-123
```

does not prove:

```text
This user owns operation abc-123
```

Authentication and authorization still apply.

A safer model is:

```text
Authenticated principal
        +
Business scope
        +
Idempotency key
```

For example:

```text
UNIQUE(tenant_id, idempotency_key)
```

and authorization checks ensure the caller is allowed to access that tenant/business operation.

### Key Principle

> Idempotency identifies an operation; authorization determines who is allowed to perform or retrieve it.

---

## 50. If This Component Fails

| Component | Failure | Business Impact | Typical Response |
|---|---|---|---|
| Idempotency store | unavailable | duplicate protection may be lost | fail safely for critical operations |
| Worker | crashes | operation may remain `PROCESSING` | recover/reconcile |
| Queue | redelivery | duplicate processing | consumer idempotency |
| Provider | timeout | outcome becomes ambiguous | provider idempotency/reconciliation |
| Client | retries | duplicate request | same idempotency key |
| Response path | lost response | client may retry | same idempotency key |

The key question is always:

> Can the failure cause the same business operation to create its side effect twice?

---

## 51. Production Observability

Useful metrics include:

```text
Idempotency requests
Duplicate requests
Duplicate rate
PROCESSING count
Stuck PROCESSING count
Recovery attempts
Recovery success/failure
Idempotency-store latency
Idempotency-store errors
Key conflicts
Expired records
```

For external operations:

```text
Provider timeout rate
Provider reconciliation rate
Ambiguous outcome count
Provider idempotency conflicts
```

These metrics help distinguish:

```text
Normal retries
```

from:

```text
Unexpected duplicate traffic
```

or:

```text
Recovery failures
```

---

## 52. Interview Design Checklist

When designing an idempotent operation, walk through:

```text
1. What is the logical business operation?

2. What identifies it?
   → idempotency key

3. What is the uniqueness scope?
   → tenant/account/order/etc.

4. How is the key claimed atomically?
   → UNIQUE constraint / atomic insert

5. What states exist?
   → PROCESSING / COMPLETED / FAILED

6. What happens to concurrent duplicates?

7. What happens if the worker crashes?

8. What happens if the response is lost?

9. Does an external system create the side effect?

10. Does that system support idempotency or reconciliation?

11. How long do we retain the record?

12. What happens if the idempotency store fails?
```

If you can answer these, you've covered most of the important design surface.

---

## 53. Critical vs Optional Features

### Critical

```text
✓ Stable idempotency identity
✓ Atomic duplicate claim
✓ Correct concurrency handling
✓ Safe handling of external side effects
✓ Recovery of ambiguous outcomes
```

### Context-Dependent

```text
• Request hash
• Response storage
• Key expiration
• Lease/heartbeat
• Dedicated idempotency service
• Reconciliation workers
```

### Operational

```text
• Metrics
• Alerts
• Cleanup jobs
• Dashboards
• Capacity planning
```

The exact set depends on the business operation and its failure cost.

---

## 54. Final Interview Framework

When asked:

> "How would you make this API idempotent?"

A strong answer can follow this sequence:

```text
1. Identify the logical operation
        ↓
2. Require a stable idempotency key
        ↓
3. Atomically claim the key
        ↓
4. Store PROCESSING
        ↓
5. Execute the operation
        ↓
6. Store COMPLETED + result
        ↓
7. Return stored result for duplicates
        ↓
8. Handle crashes / ambiguous outcomes
        ↓
9. Use provider idempotency or reconciliation
        ↓
10. Define retention and failure policy
```

---

## 55. 60–90 Second Interview Answer

> I would first define the logical business operation and require a stable idempotency key for it. I'd store that key with a uniqueness constraint so concurrent requests can't both claim the same operation. Once claimed, I'd mark it as PROCESSING, execute the operation, and then store COMPLETED along with the result so future retries can return the original response.
>
> If the operation has an external side effect, I'd avoid assuming our database transaction can make that external call atomic. Ideally I'd propagate the idempotency key to the provider or use a provider status API for reconciliation. I'd also design recovery for abandoned PROCESSING records because a timeout or worker crash doesn't prove that the external operation failed.
>
> Finally, I'd define the key's business scope, retention period, and what happens if the idempotency store itself is unavailable. The goal isn't exactly-once execution; it's preventing duplicate business effects.

---

## 56. Final Mental Model

```text
                 Logical Business Operation
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
             Success              Ambiguous
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
                     Future Retry
                           │
                           ▼
                    Same Idempotency Key
                           │
                           ▼
                  Same Business Effect
```

### Golden Rule

> **Idempotency is about protecting a logical business operation from duplicate effects—not about guaranteeing that distributed execution happens only once.**
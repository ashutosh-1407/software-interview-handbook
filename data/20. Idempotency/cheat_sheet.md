# Idempotency — Cheat Sheet

## 1. Core Definition

> Repeating the same logical operation produces the same intended business effect as executing it once.

```text
Idempotency ≠ exactly-once execution

At-least-once processing
        +
Idempotency
        ↓
Effectively-once business outcome
```

---

## 2. Why Do We Need It?

Classic payment problem:

```text
Request
  ↓
Payment succeeds ✓
  ↓
Response lost
  ↓
Client retries
  ↓
Potential second payment ❌
```

Idempotency makes the retry refer to the **same logical operation**.

---

## 3. Idempotency Key

```text
POST /payments
Idempotency-Key: abc-123
```

Retry:

```text
Same logical operation
        ↓
Same key
```

Never generate a new key for every retry.

---

## 4. Basic Design

```text
Request
   ↓
Idempotency Key
   ↓
Atomic Claim
   ↓
PROCESSING
   ↓
Business Operation
   ↓
COMPLETED + Result
```

Future duplicate:

```text
Same key
   ↓
COMPLETED
   ↓
Return stored result
```

---

## 5. Concurrency

Don't use:

```text
CHECK → PROCESS → SAVE
```

Two concurrent requests can both see `NOT FOUND`.

Instead:

```text
INSERT key
    ↓
UNIQUE constraint
    ↓
┌──────────┴──────────┐
↓                     ↓
Winner              Duplicate
↓                     ↓
Process              Skip/wait
```

Typical constraint:

```text
UNIQUE(tenant_id, idempotency_key)
```

---

## 6. Request Hash

Same key must represent the same request.

```text
abc-123 + $100
        ↓
COMPLETED
```

Then:

```text
abc-123 + $500
        ↓
Reject key reuse
```

Store:

```text
idempotency_key
request_hash
status
response
```

---

## 7. Processing States

Basic:

```text
PROCESSING → COMPLETED
```

But external operations may require:

```text
PROCESSING
    ↓
UNKNOWN
    ↓
Reconciliation
    ↓
COMPLETED / FAILED
```

### Important

```text
Timeout ≠ failure
```

A timeout means we don't know the outcome yet.

---

## 8. External Side Effects

A DB transaction cannot make:

```text
Our DB
   +
External Provider
```

one atomic transaction.

Prefer:

```text
Our idempotency key
        ↓
External provider idempotency
        ↓
Safe retry
```

Or use:

```text
Provider status lookup
        ↓
Reconciliation
```

---

## 9. Worker Crash

```text
Claim
  ↓
PROCESSING
  ↓
Provider succeeds ✓
  ↓
Worker crashes 💥
```

Local state may still say:

```text
PROCESSING
```

Don't blindly retry.

Use:

```text
Provider idempotency
OR
Provider status/reconciliation
```

---

## 10. Queue Consumers

Queues may redeliver messages:

```text
Message #1 → process
Message #2 → duplicate
```

Consumer idempotency:

```text
Message
   ↓
Atomic claim
   ↓
Process only if new
```

---

## 11. Outbox vs Idempotency

```text
DB → Queue
     ↓
   OUTBOX
     ↓
Don't lose event
```

```text
Queue → Worker
          ↓
      IDEMPOTENCY
          ↓
Don't process duplicate
```

```text
Worker → Provider
             ↓
         IDEMPOTENCY
             ↓
Don't duplicate external effect
```

> Outbox protects publication; idempotency protects business effects.

---

## 12. Retry vs Idempotency

```text
Retry
→ Should I try again?

Idempotency
→ Is repeating the operation safe?
```

Together:

```text
Transient failure
      ↓
Retry
      ↓
Same idempotency key
      ↓
Safe duplicate handling
```

---

## 13. Circuit Breaker vs Idempotency

```text
Circuit Breaker
→ Should I call the dependency?

Idempotency
→ What happens if the operation repeats?
```

They complement each other.

---

## 14. Distributed Lock vs Idempotency

```text
Distributed Lock
→ controls concurrency

Idempotency
→ prevents duplicate business effects

Reconciliation
→ resolves ambiguous outcomes
```

A lock alone does not solve:

```text
Provider succeeds
      ↓
Worker crashes
      ↓
Unknown outcome
```

---

## 15. Idempotency Store

For critical operations, prefer durable state supporting:

```text
UNIQUE constraint
Durability
Consistent state
Transactions
```

A volatile cache alone can be risky:

```text
Payment completed
      ↓
Record disappears
      ↓
Retry
      ↓
Duplicate payment possible
```

---

## 16. Key Scope

The key doesn't necessarily need global uniqueness.

Examples:

```text
tenant_id + key
account_id + key
user_id + key
```

Choose the scope based on the business boundary.

---

## 17. Retention

Don't necessarily keep idempotency records forever.

```text
Retention
=
maximum realistic duplicate-arrival window
+
business considerations
```

Consider:

```text
Client retries
Queue redelivery
Delayed requests
Message replay
```

---

## 18. Multi-Region

Problem:

```text
US → abc-123 → claim ✓
EU → abc-123 → claim ✓
```

Both regions could process the same operation.

Possible approaches:

```text
Consistent routing
Shared/replicated state
Single authoritative region
Provider-side idempotency
```

> Multi-region idempotency is a distributed uniqueness problem.

---

## 19. If Idempotency Store Fails

For critical operations:

```text
Cannot verify idempotency
        ↓
Don't blindly execute
```

Ask:

> Can this failure create a duplicate business effect?

If yes, correctness may need to take priority over availability.

---

## 20. Production Metrics

Monitor:

```text
Duplicate request rate
Key conflicts
PROCESSING count
Stuck PROCESSING
Recovery attempts
Recovery success/failure
Store latency/errors
Provider timeouts
Unknown outcomes
```

Useful signal:

```text
Provider timeouts ↑
        ↓
UNKNOWN / PROCESSING ↑
        ↓
Reconciliation ↑
```

---

## 21. Common Interview Mistakes

```text
"Just use a UUID"
```

→ Only if the same UUID is reused across retries.

```text
"Just use Redis"
```

→ Fast doesn't automatically mean durable/correct enough.

```text
"Use one DB transaction"
```

→ Doesn't make an external call atomic.

```text
"Timeout means failure"
```

→ Outcome may be unknown.

```text
"Distributed lock solves it"
```

→ Lock handles concurrency, not external ambiguity.

```text
"Idempotency = exactly once"
```

→ Idempotency guarantees business effect, not physical execution count.

---

## 22. Interview Design Checklist

```text
1. What is the logical operation?
2. What is the idempotency key?
3. Who generates it?
4. Is it reused across retries?
5. What is the uniqueness scope?
6. How is the claim atomic?
7. What happens to concurrent duplicates?
8. What happens if the worker crashes?
9. What happens if the response is lost?
10. Is there an external side effect?
11. Does the provider support idempotency/reconciliation?
12. How long is state retained?
13. What happens if the idempotency store fails?
14. How does failover preserve the state?
```

---

## 23. 30-Second Recall

> **Idempotency protects a logical business operation from duplicate effects.**
>
> Use a stable idempotency key and atomically claim it with a uniqueness constraint. Store the operation state and result so retries return the same result. For external side effects, use provider-side idempotency or reconciliation because a local DB transaction cannot make the external call atomic. Treat timeouts as potentially ambiguous and recover abandoned `PROCESSING` operations.

### Golden Rule

> **Same logical operation → same key → one business effect.**
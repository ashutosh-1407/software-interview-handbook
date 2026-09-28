# Idempotency — Part 1
## Fundamentals, Keys, and Duplicate Prevention

---

## 1. What Is Idempotency?

Idempotency means:

> Repeating the same logical operation produces the same intended business effect as executing it once.

It does **not** mean the operation executes only once.

```text
Attempt 1 → execute
Attempt 2 → execute again
Attempt 3 → execute again

Business effect → same as one execution
```

### Key Principle

```text
Idempotency ≠ exactly-once execution

Idempotency = same intended business outcome
                despite repeated execution
```

---

## 2. Why Do We Need It?

The classic example is a payment:

```text
Client
  ↓
POST /payments
  ↓
Payment Service
  ↓
Payment Provider
```

The provider successfully charges $100, but the response is lost:

```text
Payment Provider
      ↓
   Charge $100 ✓
      ↓
Response lost
      ↓
Client times out
```

The client cannot tell whether:

```text
A. Payment failed

OR

B. Payment succeeded, but the response was lost
```

If it retries without protection:

```text
Attempt 1 → Charge $100 ✓
Attempt 2 → Charge $100 ✓

Customer charged twice ❌
```

### Key Principle

> Idempotency protects business operations from duplicate effects caused by retries, duplicate requests, or at-least-once delivery.

---

## 3. Idempotency Key

A client provides a stable identifier for the logical operation:

```text
POST /payments

Idempotency-Key: abc-123
amount: $100
currency: USD
```

If the request times out, the retry uses the **same key**:

```text
Retry
Idempotency-Key: abc-123
```

The server can now recognize:

```text
abc-123 → same logical payment
```

Do **not** generate a new key for every retry.

### Key Principle

```text
Same logical operation
        ↓
Same idempotency key
```

---

## 4. Basic Implementation

Maintain an idempotency record:

```text
idempotency_key | status      | response
----------------|-------------|----------------
abc-123         | COMPLETED   | charge-789
```

Request flow:

```text
Request
   ↓
Lookup key
   ↓
COMPLETED?
  /    \
YES     NO
 ↓       ↓
Return  Process
result  operation
```

If the operation already completed, return the stored result instead of executing it again.

### Key Principle

> Store enough information to recognize the duplicate and return the original result.

---

## 5. The Concurrency Problem

A simple:

```text
CHECK → PROCESS → SAVE
```

is unsafe.

Two requests can arrive at the same time:

```text
Request A                  Request B

CHECK abc-123              CHECK abc-123
      ↓                          ↓
 NOT FOUND                   NOT FOUND
      ↓                          ↓
   PROCESS                    PROCESS
      ↓                          ↓
      └──── duplicate side effect ────┘
```

Both requests saw the key as missing.

### Solution

Use an atomic claim backed by a database uniqueness constraint:

```text
UNIQUE(tenant_id, idempotency_key)
```

Then:

```text
Request A                  Request B
    ↓                          ↓
INSERT abc-123             INSERT abc-123
    ↓                          ↓
 SUCCESS ✓                 DUPLICATE ❌
    ↓
PROCESSING
    ↓
Perform operation
    ↓
COMPLETED
```

Only one request wins the claim.

### Key Principle

> Make the **claim** atomic. Don't hold a database transaction open while performing a slow external operation.

---

## 6. Processing State

The idempotency record can move through:

```text
PROCESSING
     ↓
COMPLETED
```

A duplicate request seeing:

```text
COMPLETED
```

can immediately return the stored response.

But:

```text
PROCESSING
```

is different.

The first worker may still be running—or it may have crashed.

Therefore:

> `PROCESSING` requires a recovery strategy.

---

## 7. The Ambiguous Outcome

Consider:

```text
1. Create idempotency record
   abc-123 → PROCESSING

2. Call payment provider
   Charge $100 ✓

3. Service crashes 💥

4. COMPLETED was never saved
```

Our database says:

```text
abc-123 → PROCESSING
```

But the customer may already have been charged.

We cannot safely:

```text
Retry blindly
→ possible double charge ❌
```

or:

```text
Assume success
→ payment may never have happened ❌
```

This is the **ambiguous outcome problem**.

---

## 8. External Provider Idempotency

Ideally, the external provider also supports idempotency.

```text
Our Service
     |
     | idempotency key = abc-123
     ↓
Payment Provider
```

If we retry after a crash:

```text
Retry abc-123
      ↓
Provider recognizes key
      ↓
Returns original result
      ↓
No second charge
```

We can then update our own state:

```text
PROCESSING
    ↓
Provider says SUCCESS
    ↓
COMPLETED
```

If the provider instead offers a status/lookup API, we can reconcile the operation before deciding what to do.

### Key Principle

> A database transaction cannot make our DB update atomic with an external system's side effect.

For external side effects, use **provider idempotency or reconciliation** whenever possible.

---

## 9. Same Key, Different Request

The same idempotency key must represent the same logical request.

For example:

```text
Request 1:
key = abc-123
amount = $100
```

Then:

```text
Request 2:
key = abc-123
amount = $500
```

This should not be treated as a normal retry.

Store a request fingerprint/hash:

```text
idempotency_key | request_hash | status
----------------|--------------|---------
abc-123         | HASH($100)   | COMPLETED
```

Then:

```text
Same key + same request
→ return previous result

Same key + different request
→ reject key reuse
```

The client should generate a new key only if `$500` represents a genuinely new logical operation.

### Key Principle

> An idempotency key identifies a **logical operation**, not merely a request string.

---

## 10. Key Scope and Retention

Idempotency keys don't necessarily need to be globally unique.

For a multi-tenant system:

```text
Tenant A + abc-123 → valid
Tenant B + abc-123 → valid
Tenant A + abc-123 → duplicate
```

So:

```text
UNIQUE(tenant_id, idempotency_key)
```

is often appropriate.

The scope should match the **business boundary where duplicate detection matters**.

### Retention

Records don't need to live forever.

Keep them long enough that a delayed duplicate cannot reasonably arrive and create harm.

Think:

```text
Retention
=
maximum realistic duplicate-arrival window
+
business lifecycle considerations
```

---

## 11. Idempotency at Queue Consumers

Queues commonly provide at-least-once delivery, so the same message may arrive more than once:

```text
Queue
  ↓
Payment Worker
```

The worker can use its own idempotency record:

```text
Message #1
    ↓
claim abc-123 ✓
    ↓
process

Message #2
    ↓
claim abc-123 ❌
    ↓
duplicate → skip
```

This is separate from the Outbox Pattern.

```text
Outbox
→ prevents losing an event between DB and queue

Worker idempotency
→ prevents duplicate processing

Provider idempotency
→ prevents duplicate external side effects
```

---

## 12. Idempotency vs Exactly-Once

Idempotency does **not** mean exactly-once execution.

The operation may execute multiple times:

```text
Attempt 1
Attempt 2
Attempt 3
```

while still producing the same intended business effect as one execution.

```text
Exactly-once execution
        ≠
Idempotency
```

A useful interview formulation is:

```text
At-least-once processing
        +
Idempotency
        ↓
Effectively-once business outcome
```

---

## 13. Interview Mental Model

When designing idempotency, think in four steps:

```text
1. IDENTIFY
   ↓
Idempotency key

2. CLAIM
   ↓
Atomic DB uniqueness

3. EXECUTE
   ↓
Perform business operation

4. RECOVER
   ↓
Provider idempotency / reconciliation
```

Complete flow:

```text
Request
   ↓
(tenant_id, idempotency_key)
   ↓
Atomic claim
   ↓
PROCESSING
   ↓
Business operation
   ↓
COMPLETED + response
   ↓
Future duplicate
   ↓
Return stored response
```

---

## 14. 60–90 Second Interview Answer

> Idempotency means that repeating the same logical operation produces the same intended business effect as executing it once. It's important for operations such as payments where retries or duplicate message delivery could otherwise create duplicate side effects.
>
> A common implementation uses an idempotency key with a database uniqueness constraint to atomically claim the operation. We store the operation's status and usually a request hash and response. A duplicate request with the same key can return the previous result instead of executing the operation again.
>
> For external side effects, a DB transaction alone cannot make our state change atomic with the external system. Ideally the provider supports idempotency or status reconciliation so an ambiguous timeout can be recovered safely.
>
> The key distinction is that idempotency doesn't guarantee exactly-once execution; it guarantees the same intended business outcome even when the operation may be executed multiple times.
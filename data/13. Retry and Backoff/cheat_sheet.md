# Retry / Backoff — Interview Cheat Sheet

---

# 1. Why Retry?

```text
Transient failure
↓
retry later
↓
may succeed
```

Retry is for **temporary failures**, not every failure.

---

# 2. What Should Be Retried?

```text
Network timeout             → often ✅
Connection reset            → often ✅
503 Service Unavailable     → often ✅
500 Internal Server Error   → sometimes ⚠️
429 Too Many Requests       → retry later ✅

400 Bad Request             → usually ❌
401 Unauthorized            → usually ❌ until credentials fixed
Business validation failure → ❌
```

Core question:

> **Will sending the same request later have a reasonable chance of succeeding?**

---

# 3. Retry Safety

Even if the failure is transient:

```text
Is the operation safe to repeat?
```

Example:

```text
POST /charge
↓
charge succeeds
↓
response lost
↓
caller sees timeout
```

Blind retry:

```text
charge again ❌
```

Use idempotency:

```text
Idempotency-Key: abc123
```

Retry:

```text
abc123 already processed
→ return previous result
→ no duplicate charge
```

---

# 4. Basic Retry Decision

```text
Transient failure
        +
Safe / idempotent operation
        ↓
Potentially retry
```

But that's only the beginning.

---

# 5. Exponential Backoff

Don't:

```text
fail
→ retry immediately
→ fail
→ retry immediately
```

Instead:

```text
Retry 1 → ~100 ms
Retry 2 → ~200 ms
Retry 3 → ~400 ms
Retry 4 → ~800 ms
```

```text
Backoff
→ reduce retry pressure
```

---

# 6. Jitter

If 10,000 requests fail together:

```text
all retry after exactly 1 sec
↓
10,000-request spike
```

Add randomness:

```text
0.8 sec
1.1 sec
0.9 sec
1.3 sec
...
```

```text
Jitter
→ prevent synchronized retries
```

Memory:

```text
Backoff
→ don't retry too aggressively

Jitter
→ don't retry together
```

---

# 7. Retry Storm

```text
Dependency overloaded
↓
timeouts
↓
retries
↓
more traffic
↓
dependency becomes slower
↓
more timeouts
↓
more retries
```

Retries can **amplify an outage**.

Mitigate:

```text
limited retries
+
backoff
+
jitter
+
Circuit Breaker
```

---

# 8. Bound Retries

Never retry forever.

Use:

```text
Max Attempts
+
Max Backoff
+
Overall Deadline
```

Example:

```text
Attempt 1
Attempt 2
Attempt 3
↓
STOP
```

---

# 9. Per-Attempt Timeout

Limits **one attempt**.

```text
Checkout → Payment

Per-attempt timeout = 2 sec
```

If Payment takes longer:

```text
attempt → timeout
```

Memory:

```text
Per-attempt timeout
→ How long can ONE attempt wait?
```

---

# 10. Overall Request Deadline

Limits the **entire operation**:

```text
attempt
+
backoff
+
attempt
+
backoff
+
attempt
```

Example:

```text
Overall deadline = 5 sec
```

Memory:

```text
Overall deadline
→ How long can the WHOLE operation take?
```

---

# 11. Timeout vs Deadline

```text
Per-attempt timeout
→ ONE attempt

Overall deadline
→ ALL attempts + backoffs + processing
```

Example:

```text
Deadline = 5 sec
Attempt timeout = 2 sec

Attempt 1 → 2 sec
Backoff  → 0.5 sec
Attempt 2 → 2 sec
--------------------
Used      → 4.5 sec
```

Only:

```text
0.5 sec
```

remains.

Don't blindly start another normal 2-second attempt.

---

# 12. Remaining Deadline Budget

Attempt timeout can be bounded by:

```text
min(
    configured attempt timeout,
    remaining deadline
)
```

Example:

```text
Attempt timeout = 2 sec
Remaining budget = 1.3 sec

Maximum new timeout = 1.3 sec
```

But if 1.3 sec is unlikely to be useful:

```text
don't retry
```

---

# 13. Deadline-Aware Retry

Don't use:

```text
if failure:
    retry 3 times
```

Use:

```text
failure retryable?
        +
operation safe?
        +
retry available?
        +
enough deadline remaining?
        ↓
      RETRY
```

---

# 14. Deadline Propagation

Suppose:

```text
Client
↓
Checkout
↓
Payment
↓
Bank
```

End-to-end deadline:

```text
5 sec
```

Don't do:

```text
Checkout → Payment = fresh 5 sec
Payment  → Bank    = fresh 5 sec
```

Instead:

```text
5 sec
↓
Checkout consumes time
↓
remaining budget
↓
Payment consumes time
↓
remaining budget
↓
Bank
```

> **Deadlines should shrink as the request moves downstream.**

---

# 15. Retry-After

Example:

```text
429 Too Many Requests

Retry-After: 8 sec
```

If:

```text
Remaining deadline = 20 sec
```

retry may be possible after waiting.

But:

```text
Retry-After = 8 sec
Remaining deadline = 3 sec
```

Then:

```text
don't retry
```

The caller will already have timed out.

---

# 16. Retry Amplification

Suppose:

```text
Checkout retries Payment 3x

Payment retries Bank 3x
```

Potential Bank calls:

```text
3 × 3 = 9
```

Add another retrying layer:

```text
3 × 3 × 3 = 27
```

This is:

```text
Retry Amplification
```

Avoid independent retries at every layer.

---

# 17. Where Should Retry Happen?

No universal answer.

Choose the layer with the best knowledge of:

```text
failure semantics
operation semantics
idempotency
remaining deadline
downstream behavior
```

Example:

```text
Checkout
→ understands user workflow/deadline

Payment
→ understands Bank API semantics
  and payment idempotency
```

> **Retry placement should be deliberate.**

---

# 18. Retry + Circuit Breaker

```text
Retry
→ transient failures

Circuit Breaker
→ sustained degradation
```

Flow:

```text
failure
↓
limited retry
↓
backoff + jitter
↓
continued failures
↓
CB threshold crossed
↓
OPEN
↓
stop normal downstream attempts
```

When CB is OPEN:

```text
normal retries → ❌
fail fast      → ✅
```

---

# 19. Wasted Work / Duplicate Load / Latency

Unlimited retries cause:

```text
Wasted Work
→ CPU/memory/network spent on
  unlikely-to-succeed requests

Duplicate Load
→ one user request creates
  many downstream calls

High User Latency
→ user waits through
  attempts + backoffs
```

---

# 20. Strong Retry Policy

```text
Retryable-error classification
        +
Idempotency
        +
Per-attempt timeout
        +
Overall deadline
        +
Max attempts
        +
Exponential backoff
        +
Jitter
        +
Max backoff
        +
Retry-After handling
        +
Circuit Breaker awareness
```

---

# 21. Common Interview Traps

```text
❌ Retry every error

✅ Retry transient failures
```

```text
❌ Retry unsafe writes blindly

✅ Use idempotency
```

```text
❌ Retry immediately

✅ Backoff + jitter
```

```text
❌ Unlimited retries

✅ Bound attempts + deadline
```

```text
❌ Always perform configured retry count

✅ Respect remaining deadline
```

```text
❌ Fresh deadline at every service

✅ Propagate remaining budget
```

```text
❌ Every layer independently retries

✅ Deliberately choose retry layer
```

```text
❌ Retry 429 immediately

✅ Respect Retry-After
```

---

# 22. Interview Decision Tree

```text
Request failed
     ↓
Transient failure?
├── NO → don't retry
└── YES
      ↓
Safe/idempotent?
├── NO → don't blindly retry
└── YES
      ↓
Retry count available?
├── NO → stop
└── YES
      ↓
Enough deadline remaining?
├── NO → stop
└── YES
      ↓
Retry-After satisfied?
├── NO → wait if budget permits
└── YES
      ↓
Circuit Breaker OPEN?
├── YES → fail fast
└── NO
      ↓
Backoff + Jitter
      ↓
RETRY
```

---

# 23. 30-Second Interview Answer

> **I use retries for transient failures and only when the operation is safe to repeat or protected with idempotency. Retries should be bounded and use exponential backoff with jitter to avoid retry storms. Each attempt should have a timeout, while the entire operation should have an overall deadline. That remaining deadline should propagate downstream and retries should stop when there isn't enough budget for another meaningful attempt. I also avoid independent retries at every layer because they can multiply downstream traffic, and for sustained failures I combine retries with a Circuit Breaker.**

---

# Final Mental Model

```text
             REQUEST FAILURE
                    │
                    ↓
             Retryable failure?
                    │
                   YES
                    ↓
              Safe to retry?
                    │
                   YES
                    ↓
              Budget remains?
                    │
                   YES
                    ↓
            Backoff + Jitter
                    │
                    ↓
                  RETRY
```

Boundaries:

```text
Per-Attempt Timeout
→ don't let one attempt wait forever

Max Attempts
→ don't retry forever

Max Backoff
→ don't wait absurdly long

Overall Deadline
→ don't let the operation live forever
```

Across services:

```text
Client
  │
  │ deadline
  ↓
Checkout
  │
  │ remaining budget
  ↓
Payment
  │
  │ remaining budget
  ↓
Bank
```

## One sentence to remember

> **Retry only when the failure is transient, the operation is safe to repeat, and enough deadline remains—and use bounded attempts with backoff and jitter so the retry mechanism doesn't become the outage.**
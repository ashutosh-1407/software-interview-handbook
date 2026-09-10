# Retry / Backoff — Part 1
## Retry Fundamentals, Retryable Failures, Idempotency, Backoff, and Jitter

---

# 1. Why Retry?

Distributed systems frequently experience temporary failures:

```text
Checkout
   ↓
Payment
   ↓
temporary network issue
   ↓
request fails
```

A retry gives the operation another chance:

```text
failure
↓
wait
↓
retry
↓
success
```

Retry is useful when the failure is **transient**.

---

# 2. Not Every Failure Should Be Retried

Core question:

> **Will sending the same request later have a reasonable chance of succeeding?**

Examples:

```text
Network timeout
→ often retryable

503 Service Unavailable
→ often retryable

500 Internal Server Error
→ sometimes retryable

400 Bad Request
→ usually NOT retryable

401 Unauthorized
→ usually NOT retryable without fixing credentials

429 Too Many Requests
→ retry later, usually respecting Retry-After
```

---

# 3. Retryable vs Non-Retryable Failures

## Retryable

Usually temporary conditions:

```text
network timeout
connection reset
temporary service outage
503
temporary overload
429 after waiting
```

Retrying later may succeed.

---

## Non-Retryable

Usually permanent for the current request:

```text
400 Bad Request
invalid input
authentication problem
authorization failure
business validation failure
```

Sending the exact same request again usually produces the same failure.

---

# 4. 500 Errors

`500 Internal Server Error` is not automatically retryable or non-retryable.

Ask:

```text
Was this likely transient?
```

Examples:

```text
temporary downstream failure
→ retry may help

application bug for this input
→ retry probably won't help
```

So retry behavior should depend on the API contract and known failure semantics.

---

# 5. 429 Too Many Requests

Example:

```text
Payment → 429 Too Many Requests
```

Retrying immediately:

```text
429
↓
retry immediately
↓
429
↓
retry immediately
```

can worsen overload.

Instead:

```text
429
↓
wait
↓
retry
```

If the service returns:

```text
Retry-After: 8 seconds
```

respect that guidance when possible.

---

# 6. Retry Safety

Even when the failure is retryable, the **operation itself must be safe to retry**.

Example:

```text
POST /charge-card
```

Checkout sends:

```text
Charge $100
```

Payment processes it successfully:

```text
Customer charged $100 ✅
```

But the response is lost:

```text
Payment → Checkout
       X
```

Checkout sees:

```text
timeout
```

It cannot know whether the charge happened.

Blind retry:

```text
POST /charge-card
$100
```

may produce:

```text
second $100 charge ❌
```

---

# 7. Idempotency

To make retries safe, use an idempotency identifier.

Example:

```text
POST /charge-card

Idempotency-Key: abc123
```

Payment stores:

```text
abc123
→ already processed
→ $100 charge succeeded
```

Retry:

```text
POST /charge-card
Idempotency-Key: abc123
```

Payment detects:

```text
abc123 already processed
↓
do NOT charge again
↓
return previous result
```

---

# 8. Retry Decision Rule

A strong retry rule is:

```text
Failure is transient
        +
Operation is safe to retry
        ↓
       RETRY
```

If either condition is false:

```text
do not automatically retry
```

---

# 9. Why Immediate Retry Is Dangerous

Suppose:

```text
10,000 Checkout requests
```

all receive:

```text
503
```

If every request retries exactly one second later:

```text
10,000 failures
↓
wait exactly 1 second
↓
10,000 retries together
```

This produces another traffic spike.

Possible result:

```text
Payment recovering
↓
huge retry wave
↓
Payment overloaded again
```

This is a **retry storm**.

---

# 10. Exponential Backoff

Instead of retrying immediately, wait progressively longer.

Example:

```text
Retry 1 → 100 ms
Retry 2 → 200 ms
Retry 3 → 400 ms
Retry 4 → 800 ms
```

General idea:

```text
delay grows after each failure
```

This gives the downstream system time to recover.

---

# 11. Why Backoff Helps

Without backoff:

```text
failure
→ retry
→ failure
→ retry
→ failure
```

With backoff:

```text
failure
↓
wait
↓
retry
↓
wait longer
↓
retry
```

Backoff reduces pressure on a degraded service.

---

# 12. Jitter

Backoff alone does not guarantee retries are spread out.

Suppose every caller uses:

```text
1 second
2 seconds
4 seconds
```

They can still retry together:

```text
10,000 callers
↓
all retry at 1 sec
↓
all retry at 2 sec
↓
all retry at 4 sec
```

Jitter adds randomness.

Example:

```text
Retry 1
→ 80 ms
→ 120 ms
→ 95 ms
→ 135 ms
```

instead of everyone retrying at exactly:

```text
100 ms
```

---

# 13. Backoff vs Jitter

```text
Backoff
→ reduce retry frequency

Jitter
→ prevent synchronized retries
```

Together:

```text
Exponential Backoff
+
Jitter
```

are a standard retry strategy.

---

# 14. Retry Amplification

One user request can generate many downstream requests.

Example:

```text
1 user request
↓
initial attempt
↓
retry 1
↓
retry 2
```

Result:

```text
1 user request
→ up to 3 downstream calls
```

At scale:

```text
100,000 user requests
×
3 attempts
=
up to 300,000 downstream calls
```

Retries increase load exactly when the dependency may already be struggling.

---

# 15. Wasted Work

Unlimited retries can create wasted work.

Example:

```text
Attempt 1 ❌
Attempt 2 ❌
Attempt 3 ❌
...
Attempt 50 ❌
```

The system keeps spending:

```text
CPU
memory
request processing
network calls
logging
downstream capacity
```

on an operation that is unlikely to succeed.

---

# 16. Duplicate Load

Even if retries do not create duplicate business effects, they still create duplicate network work.

```text
1 request
→ 10 attempts
→ 10 downstream calls
```

Across many users:

```text
retry traffic
```

can become a large percentage of total traffic.

---

# 17. User Latency

Retries also increase end-to-end latency.

The user waits for:

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

Instead of:

```text
fail quickly
```

the request may remain alive for tens of seconds.

So retry policy must balance:

```text
chance of recovery
        vs
latency + extra load
```

---

# 18. Limit Retry Count

Never retry forever.

Example:

```text
max attempts = 3
```

Then:

```text
Attempt 1
Attempt 2
Attempt 3
↓
stop
```

A retry policy needs a clear upper bound.

---

# 19. Limit Backoff Delay

Exponential backoff can grow very large:

```text
1 sec
2 sec
4 sec
8 sec
16 sec
32 sec
64 sec
...
```

Without a cap:

```text
request may become practically useless
```

So configure:

```text
maximum backoff delay
```

Example:

```text
1s
2s
4s
8s
8s
8s
```

---

# 20. Overall Retry Pattern

A safer retry configuration:

```text
Transient-failure detection
+
Idempotency / retry safety
+
Limited retry count
+
Exponential backoff
+
Jitter
+
Maximum backoff
```

Later we also combine this with:

```text
Per-attempt timeout
+
Overall request deadline
```

---

# 21. Example

Suppose:

```text
Checkout → Payment

Payment returns 503
```

A weak implementation:

```text
retry immediately
retry immediately
retry immediately
retry immediately
...
```

A stronger implementation:

```text
Attempt 1 → 503
↓
100ms + jitter
↓
Attempt 2 → 503
↓
200ms + jitter
↓
Attempt 3 → success
```

If all allowed attempts fail:

```text
stop retrying
→ return controlled failure
```

---

# 22. Common Interview Mistakes

### Mistake 1

```text
Retry every error ❌
```

Better:

```text
retry only transient/retryable failures
```

---

### Mistake 2

```text
Retry POST requests automatically ❌
```

Better:

```text
check idempotency / duplicate business effects
```

---

### Mistake 3

```text
Retry immediately ❌
```

Better:

```text
backoff + jitter
```

---

### Mistake 4

```text
Unlimited retries ❌
```

Better:

```text
bounded retries
```

---

### Mistake 5

```text
429 → retry immediately ❌
```

Better:

```text
respect Retry-After when provided
```

---

# 23. Interview Mental Model

When deciding whether to retry, ask:

```text
1. Is the failure transient?

2. Is the operation safe to retry?

3. Could retry create duplicate business effects?

4. How many retries are allowed?

5. What backoff strategy should be used?

6. Is jitter needed?
```

If the answers are sensible:

```text
retry may be appropriate
```

---

# Part 1 Takeaways

```text
Retry
→ recover from transient failures
```

But:

```text
Retry everything
→ dangerous
```

Use:

```text
Retryable failure detection
+
Idempotency
+
Limited attempts
+
Exponential Backoff
+
Jitter
+
Max Backoff
```

Core distinction:

```text
Backoff
→ don't retry too aggressively

Jitter
→ don't retry together
```

And always remember:

> **A retry is only useful when the failure may be temporary and the operation can be repeated safely.**
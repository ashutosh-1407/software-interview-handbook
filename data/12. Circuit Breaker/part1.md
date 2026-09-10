# Circuit Breaker — Part 1
## Why We Need It, States, Failure Detection, and Thresholds

---

# 1. Why Do We Need a Circuit Breaker?

Suppose:

```text
Checkout Service
      ↓
Payment Service
```

Normally:

```text
Checkout
→ Payment
→ response
```

Now Payment becomes slow or unavailable.

Without protection:

```text
Checkout → Payment → waits
Checkout → Payment → waits
Checkout → Payment → waits
...
```

Resources start accumulating:

```text
threads
connections
memory
request queues
```

Eventually:

```text
Payment unhealthy
↓
Checkout resources exhausted
↓
Checkout becomes unhealthy
↓
other functionality gets affected
↓
cascading failure
```

The failure's **blast radius increases**.

---

# 2. Circuit Breaker

A circuit breaker monitors calls to a dependency.

If that dependency appears sufficiently unhealthy:

```text
Circuit Breaker
→ stops sending normal traffic
→ fails fast
```

Instead of:

```text
Checkout
→ Payment
→ wait 10 sec
→ failure
```

we get:

```text
Checkout
→ Circuit OPEN
→ immediate failure/fallback
```

Benefits:

```text
less resource contention
lower latency during failure
protect upstream service
give downstream time to recover
prevent cascading failures
```

> **Circuit Breaker protects the caller from repeatedly invoking an unhealthy dependency.**

---

# 3. Slow Service vs Dead Service

Circuit breakers are not only for completely dead services.

Payment might be:

```text
Dead
→ connection refused

Failing
→ HTTP 500 / 503

Overloaded
→ HTTP 429

Slow
→ response takes several seconds
```

From Checkout's perspective, all of these may indicate an unhealthy dependency.

Example:

```text
Checkout's timeout for Payment = 2 sec

Payment responds after 10 sec
```

Checkout observes:

```text
0 sec ───────── 2 sec
                 ↑
               TIMEOUT
```

Even if Payment eventually returns:

```text
10 sec → 200 OK
```

Checkout already considered that attempt failed.

So:

> **The breaker cares about the dependency behavior observed by the caller, not merely whether the downstream process is alive.**

---

# 4. Circuit Breaker States

A circuit breaker normally has three states:

```text
CLOSED
OPEN
HALF-OPEN
```

Flow:

```text
CLOSED
  ↓ unhealthy threshold crossed
OPEN
  ↓ cooldown
HALF-OPEN
  ↓             ↓
healthy       unhealthy
  ↓             ↓
CLOSED         OPEN
```

---

# 5. CLOSED

CLOSED means:

```text
normal traffic allowed
+
outcomes monitored
```

Example:

```text
Checkout
↓
Circuit Breaker [CLOSED]
↓
Payment
```

The breaker records signals such as:

```text
successes
failures
timeouts
slow calls
```

If Payment remains healthy:

```text
CLOSED
→ CLOSED
```

If degradation crosses the configured threshold:

```text
CLOSED
→ OPEN
```

---

# 6. OPEN

OPEN means:

```text
normal downstream calls blocked
```

So:

```text
Checkout request
↓
Payment CB = OPEN
↓
do NOT call Payment
↓
fail fast / fallback
```

This prevents:

```text
repeated waiting
resource exhaustion
retry storms against Payment
additional pressure on Payment
```

The circuit remains OPEN for a configured cooldown period.

---

# 7. Why Not OPEN → CLOSED Directly?

Suppose Payment crashed because it was overloaded.

After 30 seconds:

```text
Payment starts recovering
```

If we immediately do:

```text
OPEN
↓
CLOSED
```

thousands of waiting/new requests could suddenly hit Payment:

```text
10,000 requests
      ↓
recovering Payment
      ↓
overloaded again
```

The service may collapse immediately.

Therefore we need an intermediate state.

---

# 8. HALF-OPEN

After the cooldown:

```text
OPEN
↓
HALF-OPEN
```

HALF-OPEN allows only a **small controlled number of probe calls**.

Example:

```text
10,000 incoming requests
↓
only 5 probes allowed to Payment
```

Then:

```text
probes sufficiently healthy
→ CLOSED

probes fail / remain unhealthy
→ OPEN
```

This allows Payment to prove that it has recovered without immediately receiving full production traffic.

Mental model:

```text
OPEN
→ "I believe you're unhealthy."

HALF-OPEN
→ "I'll cautiously test you."

CLOSED
→ "You appear healthy again."
```

---

# 9. HALF-OPEN Decision Rules

Recovery should not depend on one lucky request.

For example:

```text
HALF-OPEN

Allowed probes = 5

4/5 succeed
→ CLOSED

multiple probes fail
→ OPEN
```

The exact policy is configurable.

The important principle is:

> **Opening requires enough evidence of failure; closing requires enough evidence of recovery.**

HALF-OPEN normally uses a smaller controlled sample than normal CLOSED-state monitoring.

---

# 10. Sliding Window

A breaker should usually not react to one random failure.

Instead it evaluates recent calls over a **sliding window**.

Example:

```text
Window size = 20 calls
```

Initially:

```text
calls seen = 1
2
3
...
```

After 20 calls:

```text
[1 ... 20]
```

When call 21 arrives:

```text
[1 ... 20]
      ↓
call 21

→ remove call 1

[2 ... 21]
```

So the breaker continually evaluates recent dependency behavior.

---

# 11. Minimum Sample Size

A failure percentage can be misleading with very few calls.

Example:

```text
2 calls
2 failures

failure rate = 100%
```

But two calls may represent:

```text
temporary network glitch
brief deployment issue
random transient problem
```

Therefore configure a minimum sample size.

Example:

```text
Window size       = 20
Minimum calls     = 12
Failure threshold = 50%
```

Before 12 calls:

```text
2/2 failed
→ 100%

BUT

2 < minimum 12
→ don't open yet
```

---

# 12. Window Size ≠ Minimum Sample Size

This distinction is important.

```text
Window size = 20
```

means:

> **Remember/evaluate at most the latest 20 calls.**

```text
Minimum calls = 12
```

means:

> **Don't make a breaker decision until at least 12 calls have been observed.**

Therefore the window does **not** need to become full before the breaker opens.

Example:

```text
12 calls

6 success
6 failure
```

Then:

```text
sample size = 12
→ minimum reached ✅

failure rate = 50%
→ threshold reached ✅

Circuit can OPEN
```

No need to wait for calls 13–20.

---

# 13. Failure Threshold

Once minimum traffic has been observed:

```text
failure rate
=
failed calls / evaluated calls
```

Example:

```text
12 calls

4 failures
8 successes

failure rate = 33%
→ CLOSED
```

But:

```text
12 calls

6 failures
6 successes

failure rate = 50%
→ OPEN
```

assuming:

```text
failure threshold = 50%
```

So the mental model is:

```text
Sliding Window
+
Minimum Sample Size
+
Failure Threshold
↓
OPEN decision
```

---

# 14. What Counts as a Failure?

Not every non-200 response necessarily means the dependency is unhealthy.

Ask:

> **Does this response indicate that the downstream dependency is unable to serve us properly?**

Typical examples:

```text
Timeout
→ usually count

HTTP 500
→ usually count

HTTP 503
→ count

HTTP 429
→ often overload/degradation signal
```

But:

```text
HTTP 400
→ usually don't count

HTTP 404
→ usually don't count
```

Why?

Suppose:

```text
GET /payment/does-not-exist
↓
404
```

Payment correctly processed the request and reported:

```text
resource doesn't exist
```

That does not mean Payment itself is unhealthy.

---

# 15. Slow-Call Detection

We don't necessarily need to wait until requests completely fail.

Suppose:

```text
Checkout timeout = 2 sec
```

We might separately configure:

```text
Slow-call threshold = 1 sec
```

Meaning:

```text
< 1 sec
→ normal

>= 1 sec
→ slow

>= 2 sec
→ Checkout timeout
```

Now imagine:

```text
12 calls

8 take 1.3 sec → 200 OK
4 take 200 ms  → 200 OK
```

Failure rate:

```text
0%
```

But slow-call rate:

```text
8 / 12
≈ 67%
```

The breaker could still open if its configured slow-call-rate threshold is crossed.

---

# 16. Why Detect Slow Calls?

Without slow-call detection:

```text
Payment slows
↓
Checkout waits longer
↓
threads/connections accumulate
↓
timeouts begin
↓
retries begin
↓
Payment receives additional load
↓
cascading failure
```

Slow-call detection lets the breaker react **before outright failure**.

This is especially important because:

```text
Alive
≠
Healthy
```

A service returning `200 OK` in four seconds may still be operationally unhealthy for a caller expecting responses within hundreds of milliseconds.

---

# 17. Queue vs Circuit Breaker

A queue and circuit breaker solve different problems.

```text
Queue
→ absorb / buffer / defer work

Circuit Breaker
→ stop calling unhealthy dependency
```

Example:

```text
Traffic spike
↓
Queue
↓
Payment processes backlog
at sustainable rate
```

A queue is especially useful when work can be asynchronous.

---

# 18. Queue During Dependency Failure

Suppose:

```text
Order Service
↓
Email Service
```

Email becomes unavailable.

Instead of failing the order:

```text
Order succeeds
↓
"Send confirmation email"
↓
Queue
↓
Email recovers
↓
Worker processes event
↓
Email sent
```

This works because sending the confirmation email can safely happen later.

---

# 19. "If Semantics Allow"

Not every operation can safely be deferred.

Example:

```text
User → Pay $500
```

Dangerous behavior:

```text
Payment unavailable
↓
queue payment
↓
tell user to try again
↓
user retries successfully
↓
old queued payment later executes
↓
double charge
```

Asynchronous payment processing is possible, but would need explicit semantics such as:

```text
PENDING status
idempotency key
deduplication
retry policy
clear user experience
```

Therefore:

```text
Can safely happen later
→ queue may help

Needs immediate authoritative result
→ fail fast
```

---

# 20. Fallback Behavior

Opening the breaker protects the system, but we also need to think about the user.

Avoid blindly returning:

```text
500 Internal Server Error
```

Possible fallback strategies:

```text
Non-critical read
→ cached/default data

Async operation
→ queue if semantics allow

Critical synchronous operation
→ meaningful temporary-unavailable response
```

Example:

```text
"Payment is temporarily unavailable.
Please try again shortly."
```

Core distinction:

```text
Circuit Breaker
→ protects the system

Fallback
→ protects the user experience
```

---

# Part 1 Interview Takeaways

```text
Circuit Breaker
→ stop repeatedly calling
  an unhealthy dependency
```

Three states:

```text
CLOSED
→ normal traffic + monitoring

OPEN
→ fail fast

HALF-OPEN
→ controlled recovery probes
```

Opening decision:

```text
Sliding Window
+
Minimum Sample Size
+
Failure / Slow-Call Threshold
```

Remember:

```text
Window size
→ how much recent history to evaluate

Minimum sample
→ enough evidence before deciding

Threshold
→ how unhealthy is too unhealthy
```

A dependency can be unhealthy because of:

```text
timeouts
5xx
unavailability
overload
slow calls
```

And:

```text
Queue
→ defer work

Circuit Breaker
→ stop unhealthy calls

Fallback
→ preserve user experience
```

**Core principle:**

> A circuit breaker prevents a slow or failing downstream dependency from consuming upstream resources and causing cascading failures by detecting sustained degradation, failing fast, and cautiously testing recovery before restoring normal traffic.
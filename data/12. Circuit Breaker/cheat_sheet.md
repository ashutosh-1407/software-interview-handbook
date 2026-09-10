# Circuit Breaker — Interview Cheat Sheet

---

## 1. Why Circuit Breaker?

```text
Checkout
   ↓
Payment → slow / failing
```

Without protection:

```text
requests keep coming
→ calls wait
→ threads/connections accumulate
→ Checkout degrades
→ cascading failure
```

Circuit Breaker:

```text
Dependency unhealthy
→ stop normal calls
→ fail fast
→ allow dependency to recover
→ contain blast radius
```

> **Circuit Breaker prevents a downstream failure from propagating upstream.**

---

## 2. Three States

```text
CLOSED
→ normal traffic
→ monitor health

threshold crossed
      ↓
OPEN
→ block normal calls
→ fail fast

cooldown expires
      ↓
HALF-OPEN
→ allow few controlled probes
     ↓             ↓
 healthy        unhealthy
     ↓             ↓
 CLOSED           OPEN
```

Memory:

```text
CLOSED    → trust
OPEN      → stop
HALF-OPEN → test
```

---

## 3. When Does It OPEN?

Typical decision:

```text
Sliding Window
+
Minimum Sample Size
+
Failure / Slow-Call Threshold
```

Example:

```text
Window size       = 20
Minimum calls     = 12
Failure threshold = 50%
```

After:

```text
12 calls
6 failures
6 successes

12 >= minimum calls ✅
50% failure rate   ✅

→ OPEN
```

You **do not need to fill all 20 slots first**.

---

## 4. Window vs Minimum Sample

```text
Window Size
→ how much recent history to consider

Minimum Sample
→ how much evidence is required
  before making a decision
```

Once the window is full:

```text
[1 ... 20]

call 21 arrives
→ drop 1

[2 ... 21]
```

---

## 5. What Counts as Failure?

Ask:

> **Does this indicate that the dependency is unhealthy/unable to serve us?**

Usually:

```text
Timeout → ✅
500     → ✅
503     → ✅
429     → often degradation/overload signal

400     → usually ❌
404     → usually ❌
```

Example:

```text
GET /payment/invalid-id
→ 404
```

Payment may be working perfectly.

---

## 6. Slow Calls

A service doesn't need to be dead.

Example:

```text
Checkout timeout     = 2 sec
Slow-call threshold  = 1 sec
```

Then:

```text
300 ms
→ success

1.4 sec + 200 OK
→ success BUT slow

> 2 sec
→ timeout
```

A high slow-call rate can OPEN the breaker even if most calls eventually return `200`.

```text
Alive ≠ Healthy
```

---

## 7. Why HALF-OPEN?

Don't do:

```text
OPEN
↓
Payment recovers
↓
CLOSED
↓
10,000 requests
↓
Payment crashes again
```

Instead:

```text
OPEN
↓ cooldown
HALF-OPEN
↓
few probes
↓
healthy?
├── yes → CLOSED
└── no  → OPEN
```

Prevents a:

```text
thundering herd / recovery storm
```

---

## 8. HALF-OPEN Rules

HALF-OPEN should use a **small controlled sample**.

Example:

```text
5 probes

4/5 healthy
→ CLOSED

multiple failures
→ OPEN
```

Principle:

```text
Opening
→ enough evidence of failure

Closing
→ enough evidence of recovery
```

---

# 9. Timeout vs Retry vs Circuit Breaker

```text
Timeout
→ bound ONE attempt

Retry
→ handle transient failures

Circuit Breaker
→ stop repeated calls to
  persistently unhealthy dependency
```

Example:

```text
Attempt
↓
Checkout's 2-sec timeout
↓
timeout
↓
backoff + jitter
↓
retry
```

---

## 10. Retry Amplification

Suppose:

```text
100 requests
×
3 total attempts
=
300 possible downstream calls
```

During degradation:

```text
Payment slow
↓
timeouts
↓
retries
↓
more Payment traffic
↓
Payment slower
↓
more timeouts
```

This is a **retry storm**.

---

## 11. Backoff + Jitter

### Backoff

```text
failure
↓
100 ms
↓
retry
↓
200 ms
↓
retry
↓
400 ms
```

Reduces pressure.

### Jitter

Instead of everyone retrying at:

```text
1.0 sec
```

spread them:

```text
0.8 sec
1.1 sec
0.9 sec
1.3 sec
```

Memory:

```text
Backoff
→ retry less aggressively

Jitter
→ don't retry together
```

---

## 12. Retry Rules by CB State

```text
CLOSED
→ limited retries
→ backoff + jitter

OPEN
→ no downstream calls
→ no normal retries
→ fail fast

HALF-OPEN
→ controlled probes
→ retries disabled/tightly controlled
```

Don't turn:

```text
5 HALF-OPEN probes
```

into:

```text
5 × 3 attempts
= 15 downstream calls
```

---

# 13. Queue vs Circuit Breaker

```text
Queue
→ buffer / defer work

Circuit Breaker
→ stop unhealthy calls
```

Queue works well when the operation can safely happen later:

```text
Order
↓
Email unavailable
↓
queue email
↓
Email recovers
↓
send later
```

But:

```text
Payment
```

cannot blindly be queued unless the workflow explicitly supports asynchronous payment, idempotency, deduplication, pending status, etc.

---

# 14. Fallback

When OPEN:

```text
Non-critical read
→ cached/default response

Optional functionality
→ graceful degradation

Async operation
→ queue if semantics allow

Critical synchronous operation
→ fail fast meaningfully
```

Example:

```text
"Payment is temporarily unavailable.
Please try again shortly."
```

```text
Circuit Breaker
→ protects system

Fallback
→ protects user experience
```

---

# 15. CB Scope

Usually:

```text
Checkout
├── Payment CB
├── Inventory CB
└── Shipping CB
```

Payment failure should not disable Inventory.

Sometimes finer:

```text
Payment

POST /charge   → failing
GET /history   → healthy
```

Then consider:

```text
per endpoint / operation breaker
```

Principle:

> **Scope the breaker according to the failure boundary.**

---

# 16. Load Balancer vs Circuit Breaker

Suppose:

```text
Payment
├── P1 ❌
├── P2 ✅
├── P3 ✅
└── P4 ✅
```

Primarily:

```text
Load Balancer
→ remove P1
```

But:

```text
Payment dependency broadly unhealthy
→ Circuit Breaker
```

Memory:

```text
LB
→ bad instance isolation

CB
→ bad dependency/path isolation
```

---

# 17. Rate Limiter vs Circuit Breaker

```text
Rate Limiter
→ "How much traffic is allowed?"

Circuit Breaker
→ "Is this dependency healthy
   enough to call?"
```

Example:

```text
Rate Limiter
→ max 5K req/sec

Circuit Breaker OPEN
→ no normal Payment calls
```

---

# 18. Bulkhead

Bulkhead means:

> **Isolate resources so one failing dependency cannot exhaust resources required by unrelated functionality.**

Example:

```text
Checkout
├── Payment pool
├── Inventory pool
└── Shipping pool
```

If Payment exhausts its pool:

```text
Payment affected

BUT

Inventory still works
Shipping still works
```

Memory:

```text
CB
→ stop bad calls

Bulkhead
→ isolate resource exhaustion
```

---

# 19. The Five Resilience Mechanisms

```text
Timeout
→ bound waiting

Retry
→ transient recovery

Circuit Breaker
→ sustained failure protection

Rate Limiter
→ traffic-volume control

Bulkhead
→ resource isolation
```

Plus:

```text
Backoff + Jitter
→ safe retries

Queue
→ async buffering

Fallback
→ graceful degradation
```

---

# 20. Circuit Breaker Flapping

```text
CLOSED
→ OPEN
→ HALF-OPEN
→ CLOSED
→ OPEN
→ ...
```

Possible causes:

```text
small window
small minimum sample
low failure threshold
short cooldown
too few probes
weak recovery criteria
aggressive timeout
unstable dependency
excessive retries
```

Rule:

> **Don't immediately loosen the breaker—first determine whether the breaker is misconfigured or the dependency is genuinely unstable.**

---

# 21. Production Monitoring

Circuit Breaker:

```text
Current state
State transitions
Failure rate
Slow-call rate
Timeout rate
Rejected calls
HALF-OPEN results
```

Dependency:

```text
Request rate
Error rate

p50 latency
p95 latency
p99 latency

CPU
Memory
Thread pool
Connection pool
Queue depth
```

---

# 22. Debugging an Unexpected OPEN

```text
1. WHY did it open?
   → failures?
   → timeout?
   → slow calls?

2. CHECK breaker config
   → window
   → minimum calls
   → thresholds
   → timeout
   → cooldown

3. CHECK downstream
   → latency
   → CPU/memory
   → pools
   → queue

4. CHECK dependencies
   → DB
   → cache
   → network
   → external API

5. CHECK recent changes
   → deployment
   → config
   → traffic spike

6. CHECK recovery
   → HALF-OPEN probes
   → retries
```

---

# 23. Critical vs Optional Dependencies

```text
Payment unavailable
→ checkout may need to fail

Recommendations unavailable
→ hide recommendations

Analytics unavailable
→ queue events
```

Think:

```text
Critical
→ fail safely

Optional
→ degrade gracefully

Async
→ defer safely
```

---

# 24. Common Interview Traps

```text
❌ CB only protects against dead hosts

✅ Slow calls and partial failures matter too
```

```text
❌ Window must fill before opening

✅ Minimum sample must be reached
```

```text
❌ Continue retries while OPEN

✅ OPEN means fail fast
```

```text
❌ Immediately restore full traffic

✅ HALF-OPEN → controlled probes
```

```text
❌ One CB for everything

✅ Scope by dependency/failure boundary
```

```text
❌ Rate Limiter = Circuit Breaker

✅ Volume control vs health protection
```

```text
❌ One bad instance → service CB OPEN

✅ LB should normally isolate bad instances
```

```text
❌ CB opening often → increase threshold

✅ Investigate configuration AND downstream
```

---

# 25. Interview Decision Tree

```text
Can downstream call hang?
→ Timeout

Transient failures?
→ Retry + Backoff + Jitter

Repeated dependency degradation?
→ Circuit Breaker

One backend instance unhealthy?
→ Load Balancer

Too much traffic?
→ Rate Limiter

Dependency consuming all caller resources?
→ Bulkhead

Can work happen later?
→ Queue

Optional dependency failed?
→ Graceful degradation
```

---

# 26. 30-Second Interview Answer

> **A Circuit Breaker prevents a slow or failing downstream dependency from causing cascading failures. While CLOSED, it monitors failures, timeouts, and potentially slow-call rates over a sliding window. Once a minimum sample is reached and a configured threshold is exceeded, it moves to OPEN and fails fast. After a cooldown it moves to HALF-OPEN, where only a small number of controlled probes are allowed. If those demonstrate recovery it closes; otherwise it reopens. I would combine it with bounded timeouts, limited retries with backoff and jitter, appropriate fallbacks, and bulkheads for resource isolation.**

---

# Final Mental Model

```text
              DOWNSTREAM CALL
                     │
                  Timeout
                     │
             Limited Retries
                     │
             Backoff + Jitter
                     │
              Circuit Breaker
                     │
          ┌──────────┴─────────┐
          │                    │
       CLOSED                 OPEN
          │                    │
   normal traffic          fail fast
          │                    │
          │                 cooldown
          │                    │
          └────── HALF-OPEN ───┘
                  few probes
```

Supporting protection:

```text
Load Balancer
→ instance isolation

Rate Limiter
→ traffic control

Bulkhead
→ resource isolation

Queue
→ defer async work

Fallback
→ graceful degradation
```

## One sentence to remember

> **Timeout limits how long we wait, Retry handles transient failures, Circuit Breaker stops sustained unhealthy calls, Rate Limiter controls traffic, and Bulkhead prevents one failure from exhausting resources needed by the rest of the system.**
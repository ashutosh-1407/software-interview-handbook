# Bloom Filter

## Part 2 — Deletion, Synchronization, Rebuilding, Distributed Deployment, and Failure Handling

---

# 23. The Deletion Problem

A standard Bloom Filter supports:

```text
Insert
Lookup
```

but deletion is not straightforward.

Why?

Because multiple elements can share the same bits.

Suppose:

```text
Product 101 → bits [2, 7, 11]
Product 205 → bits [4, 7, 13]
                       ↑
                  shared bit
```

The bit array contains:

```text
bit[2]  = 1
bit[4]  = 1
bit[7]  = 1
bit[11] = 1
bit[13] = 1
```

Now Product `101` is deleted.

A naive implementation might try:

```text
101 used [2, 7, 11]

Delete 101:

bit[2]  → 0
bit[7]  → 0
bit[11] → 0
```

But `bit[7]` is also required by Product `205`.

Now check `205`:

```text
205 → [4, 7, 13]

bit[4]  = 1
bit[7]  = 0  ❌
bit[13] = 1
```

The Bloom Filter concludes:

```text
205 → DEFINITELY NOT PRESENT
```

even though `205` still exists.

We have introduced a **false negative**.

### Principle

> Standard Bloom Filter bits are shared, so clearing a bit during deletion can invalidate other elements.

Therefore, a standard Bloom Filter generally cannot safely delete individual elements by simply resetting their bits.

---

# 24. Counting Bloom Filter

One solution is a **Counting Bloom Filter**.

Instead of storing:

```text
0 or 1
```

at each position, store a counter.

Standard Bloom Filter:

```text
0 1 0 1 1 0 1
```

Counting Bloom Filter:

```text
0 1 0 2 1 0 3
```

Suppose both `101` and `205` use position `7`.

Insert `101`:

```text
counter[7]:

0 → 1
```

Insert `205`:

```text
counter[7]:

1 → 2
```

Delete `101`:

```text
counter[7]:

2 → 1
```

The position is still considered active because another element uses it.

When the final element using that position is removed:

```text
1 → 0
```

it can safely be considered unset.

### Trade-off

```text
Standard Bloom Filter
→ one bit per position
→ extremely compact
→ deletion difficult
```

```text
Counting Bloom Filter
→ counter per position
→ supports deletion
→ higher memory cost
```

### Principle

> Counting Bloom Filters trade additional memory for deletion support.

---

# 25. Bloom Filter Synchronization

The database remains the source of truth.

```text
Database
   ↓
Bloom Filter
```

This means the Bloom Filter must stay synchronized with changes to authoritative data.

Suppose initially:

```text
Database:
101
205
310

Bloom:
101
205
310
```

Now a new product is created:

```text
product_id = 500
```

The database becomes:

```text
101
205
310
500
```

But imagine the Bloom Filter update fails:

```text
Database            Bloom Filter

500 exists ✅        500 missing ❌
```

Now:

```text
GET /products/500
        ↓
Bloom Filter
        ↓
NO
        ↓
404 ❌
```

The real product has been rejected before the authoritative database was consulted.

---

# 26. Algorithmic vs System-Level False Negatives

This distinction is important.

A correctly maintained standard Bloom Filter provides:

```text
NO → definitely absent
```

and does not inherently generate false negatives.

But the **system surrounding the Bloom Filter** can violate the assumptions behind that guarantee.

For example:

```text
DB updated
   ↓
Bloom update lost
```

or:

```text
App 1 updated
App 2 updated
App 3 missed update
```

Now an application can behave as if the Bloom Filter produced a false negative.

Therefore:

```text
Bloom algorithm
→ no inherent false negatives

Stale / incorrectly maintained Bloom Filter
→ system-level false negatives possible
```

This is an important production distinction.

---

# 27. Write Ordering

Suppose creating a product requires:

```text
1. Update Database
2. Update Bloom Filter
```

These are separate operations.

A failure can occur between them.

Consider two possible orderings.

---

## Option A — Database First

```text
DB write
   ↓
Bloom update
```

Failure scenario:

```text
DB write ✅
   ↓
CRASH 💥
   ↓
Bloom update never happens
```

Now:

```text
DB:

500 exists
```

but:

```text
Bloom:

500 absent
```

Request:

```text
500
 ↓
Bloom → NO
 ↓
404 ❌
```

This is a correctness failure.

---

# 28. Option B — Bloom First

Reverse the operations:

```text
Bloom update
     ↓
DB write
```

Failure scenario:

```text
Bloom update ✅
      ↓
CRASH 💥
      ↓
DB write never happens
```

Now Bloom may say:

```text
500 → MAYBE
```

but the database says:

```text
500 → NOT FOUND
```

Request:

```text
500
 ↓
Bloom → MAYBE
 ↓
Cache MISS
 ↓
DB → NOT FOUND
 ↓
404
```

The result remains correct.

We simply performed unnecessary work.

---

# 29. Why the Two Failure Directions Are Different

The consequences are asymmetric.

### DB Updated, Bloom Missing

```text
Real object
   ↓
Bloom → NO
   ↓
Reject real object
```

Correctness failure.

### Bloom Updated, DB Missing

```text
Nonexistent object
   ↓
Bloom → MAYBE
   ↓
DB verifies
   ↓
NOT FOUND
```

Performance cost.

Therefore, if forced to choose between these two imperfect orderings:

> Prefer the inconsistency that creates a **false positive** rather than one that can reject real data.

However, this does **not** mean “always update Bloom before DB” is a complete production synchronization strategy.

We should design the Bloom Filter to be recoverable and reconstructable from the authoritative source.

---

# 30. Production Synchronization

A more robust architecture treats the database as authoritative and the Bloom Filter as **derived state**.

Conceptually:

```text
                 ┌──────────────┐
Writes ─────────►│   Database   │
                 │ Source Truth │
                 └──────┬───────┘
                        │
                  changes/events
                        │
                        ▼
                 ┌──────────────┐
                 │ Bloom Filter │
                 └──────────────┘
```

Changes may be propagated through:

```text
Write path
Change stream
Event stream
Background synchronization
```

The exact mechanism depends on the system.

The important design principle is:

> The Bloom Filter should be reconstructable from the authoritative data rather than becoming another independent source of truth.

---

# 31. Update Propagation

If Bloom Filters are distributed across application instances, a database change must reach each copy.

Example:

```text
New Product 500
      ↓
Database updated
      ↓
Change / Event
      ↓
 ┌────┼────┐
 ↓    ↓    ↓
App1 App2 App3
 ↓    ↓    ↓
Bloom Bloom Bloom
```

This process is **update propagation**.

Ideally:

```text
DB update
   ↓
All Bloom copies eventually learn the change
```

### Update Propagation Lag

Propagation is not necessarily instantaneous.

```text
T0: DB updated

T0 + 20 ms:
App1 updated

T0 + 40 ms:
App2 updated

T0 + 2 sec:
App3 updated
```

The delay between the authoritative change and a Bloom Filter receiving it is **update propagation lag**.

For Bloom Filters, this is particularly important because missing a newly inserted element can cause an incorrect rejection.

---

# 32. Local Bloom Filters

Suppose our application runs on multiple instances:

```text
                 Load Balancer
                      ↓
          ┌───────────┼───────────┐
          ↓           ↓           ↓
        App 1       App 2       App 3
```

One approach is a centralized Bloom Filter service:

```text
Apps
 ↓
Bloom Service
 ↓
Cache
 ↓
DB
```

But every membership check now requires:

```text
Application
    ↓
Network
    ↓
Bloom Service
    ↓
Network
    ↓
Application
```

This introduces:

- network latency
- another service dependency
- additional failure modes
- potential centralized bottleneck

That works against one of the major advantages of a Bloom Filter:

```text
very cheap membership checks
```

---

# 33. Local Copy per Application Instance

Instead, each application instance can maintain its own Bloom Filter:

```text
                 Load Balancer
                      ↓
          ┌───────────┼───────────┐
          ↓           ↓           ↓
        App 1       App 2       App 3
          │           │           │
        Bloom       Bloom       Bloom
        Local       Local       Local
```

Lookup:

```text
Request
   ↓
Application
   ↓
Hash functions
   ↓
Local memory
   ↓
NO / MAYBE
```

Advantages:

```text
No Bloom network call
Very low latency
No centralized lookup bottleneck
Cheap local memory access
```

This is often attractive when the filter is small enough to replicate.

---

# 34. The Cost of Local Copies

Replication introduces synchronization problems.

Suppose:

```text
Product 500 created
```

App 1 and App 2 receive the update:

```text
App1 Bloom → knows 500
App2 Bloom → knows 500
```

App 3 misses it:

```text
App3 Bloom → does not know 500
```

Now behavior depends on which instance receives the request:

```text
Request → App1 → MAYBE → product found ✅

Request → App2 → MAYBE → product found ✅

Request → App3 → NO → 404 ❌
```

The system now behaves inconsistently across instances.

Therefore local Bloom Filters require mechanisms for:

```text
Update propagation
Version tracking
Reconciliation
Rebuilding
Monitoring update lag
```

### Principle

> Local Bloom Filters improve lookup performance but convert synchronization into a distributed-systems problem.

---

# 35. Rebuilding a Bloom Filter

Bloom Filters should generally be treated as reconstructable state.

Suppose:

```text
Designed capacity = 100M products
Actual products   = 220M
Observed FPR      = 18%
```

The existing Bloom Filter is becoming saturated.

We do not want to:

```text
Stop API
Delete Bloom
Build new Bloom
Restart API
```

Instead, build a new filter while the old one continues serving traffic.

```text
             Source of Truth
                   ↓
             Build Bloom V2

Bloom V1 ─────────────── serving requests

Bloom V2 ─────────────── building
```

Once V2 is complete:

```text
Validate V2
    ↓
Atomic switch
    ↓
V1 → V2
```

Now:

```text
Bloom V2 → serving
Bloom V1 → retire
```

This enables a **zero-downtime Bloom Filter replacement**.

---

# 36. Capacity Planning During Rebuild

Suppose current data is:

```text
220M products
```

Do not necessarily build V2 for:

```text
220M exactly
```

If growth is expected:

```text
220M
 ↓
260M
 ↓
300M
```

then V2 should account for:

```text
Current n
+
Expected growth
+
Target FPR
+
Available memory
```

Otherwise the newly rebuilt filter may become saturated again shortly after deployment.

---

# 37. Why Rebuilding Is Useful Beyond Capacity

Rebuilding can also recover from:

```text
Missed updates
Stale local copies
Corruption
Deletion accumulation
Incorrect initialization
Filter-version mismatch
```

Because the Bloom Filter is derived from authoritative data:

```text
Database
   ↓
Reconstruct Bloom Filter
```

This is another reason it should not become the source of truth.

---

# 38. Failure Handling — Bloom Filter Unavailable

Consider the normal request path:

```text
Request
   ↓
Bloom Filter
   │
   ├── NO → 404
   │
   └── MAYBE → Cache → DB
```

Now suppose the Bloom Filter itself fails:

```text
Request
   ↓
Bloom Filter
   ↓
TIMEOUT / ERROR
```

We need a failure policy.

Two broad options:

```text
Fail Open
```

or:

```text
Fail Closed
```

---

# 39. Fail Open

Fail open means:

```text
Bloom unavailable
       ↓
Bypass Bloom
       ↓
Cache
       ↓
DB
```

The system continues serving requests.

### Benefits

```text
Availability preserved
Correctness preserved
Bloom failure remains isolated
```

### Cost

The database/cache may suddenly receive much more traffic:

```text
Bloom normally rejects 80%
        ↓
Bloom fails
        ↓
Those requests now continue downstream
        ↓
Cache / DB load ↑
```

Possible consequences:

```text
Higher latency
Higher DB CPU
More connections
Potential downstream overload
```

For our product lookup, fail-open is generally sensible because:

> The Bloom Filter is an optimization, while the database is authoritative.

---

# 40. Fail Closed

Fail closed might mean:

```text
Bloom unavailable
       ↓
Do not execute expensive operation
       ↓
Return temporary failure
```

This can make sense for functionality where temporary unavailability is preferable to overloading a critical dependency.

But there is an important distinction.

Do **not** convert:

```text
Bloom infrastructure failure
```

into:

```text
404 / object does not exist
```

That would turn an infrastructure problem into an incorrect business answer.

Instead, if failing closed:

```text
503
Temporary unavailable
Retry later
```

may be more appropriate.

---

# 41. Stale Data as a Degradation Strategy

Some systems have another option.

Suppose a reporting system can tolerate stale data.

Instead of:

```text
Bloom failure
   ↓
503
```

the system might serve:

```text
Last-known-good report
```

with an indication that the data is stale.

```text
Bloom / dependency failure
        ↓
Can stale data be tolerated?
      /            \
    YES             NO
     ↓               ↓
Serve stale         503 /
report              retry later
```

This is a business decision.

### Principle

> Failure behavior should follow the correctness, freshness, and availability requirements of the feature.

---

# 42. Bloom Filter as an Optimization

This gives us an important architectural rule:

```text
Bloom Filter
      ↓
Optimization layer

Database / authoritative store
      ↓
Source of truth
```

Therefore, when possible:

```text
Bloom failure
      ↓
Performance degradation
```

should be preferred over:

```text
Bloom failure
      ↓
Entire business function unavailable
```

provided downstream systems can safely handle the additional load.

This connects to the broader resilience principle:

> Failure of an optimization should ideally degrade performance rather than correctness.

---

# 43. Bloom Filter and Correctness-Critical Decisions

Bloom Filters should not independently make decisions requiring exact membership.

Consider authorization:

```text
user_id
   ↓
Bloom Filter
   ↓
MAYBE
   ↓
Grant access ❌
```

Because `MAYBE` can be a false positive:

```text
Unauthorized user
       ↓
False positive
       ↓
MAYBE
       ↓
Access granted ❌
```

The correct design is:

```text
Bloom → MAYBE
       ↓
Authoritative authorization check
```

A Bloom Filter can optimize a correctness-critical system, but it cannot replace the authoritative check when a probabilistic result is unsafe.

---

# 44. Payment / Idempotency Example

Suppose we want to prevent duplicate payments.

Someone proposes:

```text
transaction_id
      ↓
Bloom Filter
   /       \
 NO        MAYBE
 ↓           ↓
Charge     Don't charge
```

This is unsafe as the authoritative idempotency mechanism.

### Problem 1 — False Positive

Suppose transaction `TX123` was never processed.

Bloom says:

```text
MAYBE
```

because of a false positive.

The system assumes:

```text
already processed
```

and skips the payment.

```text
Legitimate transaction
       ↓
Not processed ❌
```

---

# 45. System-Level False Negative in Payments

The opposite direction can be even worse.

Suppose:

```text
Payment TX123 succeeds
        ↓
System crashes
        ↓
Bloom update never happens
```

The customer retries:

```text
TX123
 ↓
Bloom → NO
 ↓
Charge again
```

Now the customer could be charged twice.

Therefore:

> A Bloom Filter cannot be the authoritative idempotency store.

Correctness must come from something such as:

```text
Authoritative idempotency store
+
Atomic uniqueness / transactional guarantee
```

The Bloom Filter may still be used as an optimization, but never as the final authority.

---

# 46. Deletion, Updates, and Correctness — Mental Model

The safest way to think about Bloom Filter state is:

```text
                 Source of Truth
                       ↓
                  Database
                       ↓
             Changes / Rebuilds
                       ↓
                 Bloom Filter
                       ↓
                  Optimization
```

Not:

```text
Bloom Filter
     ↓
Business truth
```

The Bloom Filter should always be:

```text
Derived
Rebuildable
Replaceable
Observable
```

---

# 47. Part 2 Interview Summary

A standard Bloom Filter cannot safely delete elements because multiple elements may share the same bits.

```text
Clear shared bit
      ↓
Existing element appears absent
      ↓
False negative
```

A **Counting Bloom Filter** solves this by replacing bits with counters:

```text
Insert → increment
Delete → decrement
```

at the cost of additional memory.

Bloom Filters must also stay synchronized with their authoritative data source.

```text
DB contains object
+
Bloom misses update
      ↓
System-level false negative
```

This makes update propagation and reconciliation important, especially when every application instance maintains a local Bloom Filter.

Local filters provide:

```text
Fast lookup
No network hop
No centralized bottleneck
```

but introduce:

```text
Synchronization
Versioning
Update propagation
Reconciliation
```

Bloom Filters should therefore be treated as **derived and reconstructable state**.

When capacity grows or the filter becomes stale:

```text
Build V2 from source of truth
        ↓
Keep V1 serving
        ↓
Validate V2
        ↓
Atomic switch
        ↓
Retire V1
```

For failure handling, a correctness-sensitive API will often prefer:

```text
Bloom failure
     ↓
Fail open
     ↓
Cache / DB
```

accepting higher latency/load rather than returning incorrect results.

Finally:

> A Bloom Filter is an optimization, not a source of truth. False positives must be verified, synchronization must be maintained, and correctness-critical decisions such as authorization or payment idempotency require an authoritative mechanism.
# Bloom Filter — Interview Cheat Sheet

## 1. What Is It?

A **Bloom Filter** is a space-efficient probabilistic data structure used for membership checks.

```text
NO
→ Definitely not present

MAYBE
→ May or may not be present
→ Verify with authoritative source
```

Standard correctly maintained Bloom Filter:

```text
False positives     → Possible
Intrinsic false negatives → No
```

---

## 2. Internal Structure

Bloom Filter contains:

```text
m = number of bits
n = expected inserted elements
k = number of hash functions
```

Insert:

```text
Element
  ↓
k hashes
  ↓
Set k bit positions = 1
```

Lookup:

```text
Any required bit = 0
→ Definitely absent

All required bits = 1
→ MAYBE present
```

---

## 3. False Positive

Example:

```text
Product 999 does NOT exist

Bloom → MAYBE
Cache → MISS
DB    → NOT FOUND
```

Result is still correct because DB verifies it.

Impact:

```text
False positive
→ Extra downstream work
→ Not normally incorrect result
```

---

## 4. Why False Positives Increase

As more elements are inserted:

```text
More bits become 1
      ↓
Unknown keys more likely
to hit only 1s
      ↓
FPR ↑
```

Relationships:

```text
n ↑ → FPR ↑
m ↑ → FPR ↓
```

Optimal number of hashes:

```text
k ≈ (m/n) × ln(2)
```

More hash functions are **not always better**.

Too many:

```text
More bits set per insertion
→ Faster saturation
→ More CPU
→ Eventually FPR ↑
```

---

## 5. Main System Design Use Case

### Cache Penetration

Without Bloom:

```text
Random nonexistent ID
        ↓
Cache MISS
        ↓
Database
        ↓
NOT FOUND
```

At huge scale:

```text
500K invalid requests/sec
→ 500K unnecessary downstream lookups
```

With Bloom:

```text
Request
   ↓
Bloom
  /   \
NO    MAYBE
↓       ↓
Stop   Cache → DB
```

Bloom protects:

```text
Cache
Database
Network
Connections
CPU / I/O
```

---

## 6. Bloom vs Negative Cache

### Repeated invalid key

```text
999
999
999
999
```

Use:

```text
Negative Cache
```

### Huge random invalid-key space

```text
918273
472819
839201
...
```

Use:

```text
Bloom Filter
```

### Together

```text
Request
   ↓
Bloom
 ├─ NO → Stop
 └─ MAYBE
       ↓
     Cache
       ↓ MISS
       DB
       ↓
    NOT FOUND
       ↓
 Negative Cache
```

Mental model:

```text
Bloom
→ random invalid keys

Negative Cache
→ repeated invalid keys
```

---

## 7. Bloom vs HashSet

### HashSet

```text
Exact membership
Stores actual keys
No false positives
Higher memory
```

### Bloom Filter

```text
Probabilistic membership
Shared bit array
False positives possible
Very memory efficient
```

Use Bloom when:

```text
Large membership set
+
Memory matters
+
False positives acceptable
+
Authoritative verification exists
```

---

## 8. Deletion Problem

Standard Bloom Filter cannot safely delete individual elements.

Example:

```text
A → bits [2, 7, 11]
B → bits [4, 7, 13]
```

Bit `7` is shared.

Deleting A by clearing bit 7:

```text
B lookup
→ bit 7 = 0
→ False negative ❌
```

### Counting Bloom Filter

Replace bits with counters:

```text
Insert → increment
Delete → decrement
```

Trade-off:

```text
Deletion support
↔
More memory
```

---

## 9. Source of Truth

Bloom Filter should normally be:

```text
Derived state
Optimization
Rebuildable
Replaceable
```

Database remains:

```text
Authoritative source of truth
```

Golden relationship:

```text
Bloom MAYBE
      ↓
Authoritative verification
```

---

## 10. System-Level False Negative

Algorithmically:

```text
Standard Bloom
→ no intrinsic false negatives
```

But the system can create one.

Example:

```text
DB:
Product 500 exists

Bloom:
Product 500 missing
```

Then:

```text
GET 500
 ↓
Bloom → NO
 ↓
Incorrect 404 ❌
```

Cause:

```text
Stale filter
Missed update
Synchronization failure
```

Important distinction:

```text
Algorithmic guarantee
≠
Distributed-system correctness
```

---

## 11. Write Ordering

### DB First

```text
Write DB
   ↓
CRASH
   ↓
Bloom never updated
```

Danger:

```text
Real item exists
Bloom → NO
→ Incorrect rejection
```

### Bloom First

```text
Update Bloom
   ↓
CRASH
   ↓
DB write never happens
```

Result:

```text
Bloom → MAYBE
DB → NOT FOUND
```

This creates extra work rather than incorrect rejection.

If forced to choose between these temporary inconsistencies:

```text
False positive
>
System-level false negative
```

But production systems should use proper synchronization/reconciliation rather than relying only on ordering.

---

## 12. Distributed Deployment

Often:

```text
                 DB
                  ↓
             Update/Event
                  ↓
        ┌─────────┼─────────┐
        ↓         ↓         ↓
      App1      App2      App3
      Bloom     Bloom     Bloom
```

Local Bloom advantages:

```text
No network call
Very low latency
No centralized Bloom bottleneck
```

Trade-off:

```text
Synchronization complexity
```

Monitor:

```text
Filter version
Update propagation lag
Last successful update
```

---

## 13. Rebuilding

As `n` grows beyond expected capacity:

```text
Bit occupancy ↑
FPR ↑
Bloom rejection ↓
DB traffic ↑
```

Rebuild:

```text
DB
 ↓
Build larger V2

V1 continues serving
 ↓
Validate V2
 ↓
Atomic switch
 ↓
V2 serves
```

Size V2 for:

```text
Current n
+
Expected growth
+
Target FPR
+
Memory budget
```

---

## 14. Failure Policy

### Bloom unavailable

For many critical read paths:

```text
Fail Open
```

Meaning:

```text
Bloom unavailable
      ↓
Bypass
      ↓
Cache → DB
```

Result:

```text
Correctness preserved
Availability preserved

but

DB load ↑
Latency ↑
```

### Fail Closed

Only where business requirements allow temporary unavailability.

Return something like:

```text
503 / retry later
```

Do **not** return fake:

```text
404 Not Found
```

just because Bloom is unavailable.

---

## 15. Monitoring

Important metrics:

```text
Expected n vs actual n
Bit occupancy
Observed FPR
Bloom rejection rate
Cache / DB fall-through
Filter version
Last rebuild time
Update propagation lag
Missed update/event failures
```

Bloom being:

```text
UP
```

does not mean it is:

```text
EFFECTIVE
```

---

## 16. Debugging Pattern

### One instance bad

```text
App1 → normal
App2 → normal
App3 → DB traffic ↑
```

Check:

```text
Version
Bit occupancy
Update lag
Rebuild age
Observed FPR
Corruption/staleness
```

Think:

```text
Per-instance problem
```

### All instances bad

```text
App1 ↓
App2 ↓
App3 ↓
DB traffic ↑
```

Think:

```text
Global capacity
Saturation
Traffic-pattern change
Configuration
```

Typical saturation chain:

```text
n ↑
 ↓
Bit occupancy ↑
 ↓
FPR ↑
 ↓
MAYBE ↑
 ↓
Bloom rejection ↓
 ↓
DB traffic ↑
 ↓
Latency ↑
```

---

## 17. Complexity

```text
Insert → O(k)
Lookup → O(k)
Memory → O(m)
```

Since `k` is normally small:

```text
Lookup ≈ constant-time in practice
```

Local Bloom lookup:

```text
Hash
 ↓
Memory
```

is much cheaper than:

```text
Network
 ↓
Cache / DB
 ↓
Lookup
 ↓
Network
```

---

## 18. When NOT to Trust Bloom

Never use `MAYBE` as authoritative truth for:

```text
Authorization
Payments
Idempotency
Billing
Security decisions
```

Bad:

```text
Bloom MAYBE
→ Grant access ❌
```

Correct:

```text
Bloom MAYBE
→ Authoritative verification
```

For payment idempotency, use:

```text
Authoritative idempotency store
Atomic uniqueness guarantee
```

Bloom can only be an optimization.

---

## 19. Real-World Storage Use

Bloom Filters are useful with:

```text
LSM Trees
SSTables
```

Example:

```text
             Key ABC
                ↓
          Bloom Filters
       /       |       \
    File1    File2    File3
     NO       NO      MAYBE
                       ↓
                   Read File3
```

`NO` lets the storage engine avoid unnecessary file/disk reads.

---

## 20. Architecture Mental Model

```text
                 Request
                    ↓
               Application
                    ↓
              Bloom Filter
               /        \
             NO         MAYBE
             ↓            ↓
           Stop          Cache
                         /   \
                       HIT   MISS
                        ↓      ↓
                     Return    DB
                               ↓
                         Source of Truth
```

Responsibilities:

```text
Bloom Filter
→ Could this key exist?

Cache
→ Can I avoid fetching it?

Database
→ What is actually true?

Rate Limiter
→ Should this traffic be admitted?

Circuit Breaker
→ Should I call this unhealthy dependency?

Sharding
→ Where is this data stored?
```

---

# 30-Second Interview Answer

A Bloom Filter is a **space-efficient probabilistic membership data structure** using a bit array and multiple hash functions.

```text
NO → definitely absent
MAYBE → verify
```

It allows false positives but has no intrinsic false negatives when correctly maintained.

A common system-design use case is protecting a cache/database from large volumes of random nonexistent keys. I would size it using expected cardinality and target FPR, treat it as derived state rather than the source of truth, monitor saturation and update lag, and periodically rebuild it as the dataset grows.

For distributed local copies, synchronization is critical because a missed update can create a system-level false negative.

---

# Final Recall

```text
Bloom Filter
→ Probabilistic membership

NO
→ Definitely absent

MAYBE
→ Verify

False positive
→ Extra work

False negative
→ Not intrinsic
→ Can occur at system level from stale/missed updates

n ↑
→ FPR ↑

m ↑
→ FPR ↓

k
→ Has an optimum

Deletion
→ Counting Bloom Filter

Random invalid keys
→ Bloom

Repeated invalid keys
→ Negative Cache

High FPR
→ Check saturation

One bad instance
→ Check local state/version/sync

All instances bad
→ Check capacity/saturation

Failure
→ Often fail open

Rebuild
→ V1 serves → Build V2 → Validate → Atomic swap

Bloom
→ Optimization

DB
→ Source of Truth
```

## Golden Rule

> **Bloom Filter answers “definitely not” or “maybe.” Use `NO` to avoid expensive work, verify every `MAYBE` against an authoritative source, and never let stale probabilistic state become the source of truth.**
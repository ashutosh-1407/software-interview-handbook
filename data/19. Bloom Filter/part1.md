# Bloom Filter

## Part 1 — Fundamentals, Membership Checks, False Positives, and Sizing

---

## 1. The Problem Bloom Filters Solve

Suppose we have a product catalog containing:

```text
100 million products
```

A request arrives:

```text
GET /products/999999999
```

and that product does not exist.

Without a Bloom Filter:

```text
Request
   ↓
Application
   ↓
Cache
   ↓ MISS
Database
   ↓
NOT FOUND
```

For one request, this is perfectly reasonable.

The problem appears when the system receives a huge number of requests for nonexistent keys.

```text
500,000 invalid requests/sec
        ↓
500,000 cache misses
        ↓
500,000 DB lookups
        ↓
500,000 NOT FOUND responses
```

Even if `product_id` is indexed and each individual lookup is efficient, the database still has to process enormous amounts of useless work.

Each lookup can consume:

- network capacity
- database connections
- CPU
- memory / buffer resources
- query-processing capacity
- potentially disk I/O

This reduces the resources available for legitimate requests.

### Key Principle

> An operation can be individually cheap but still become expensive when performed unnecessarily at massive scale.

A Bloom Filter helps answer a simpler question **before performing the expensive lookup**:

```text
"Could this product possibly exist?"
```

---

# 2. Cache Penetration

This problem is commonly called **cache penetration**.

```text
Request for nonexistent key
        ↓
Cache MISS
        ↓
Database
        ↓
NOT FOUND
```

Because the object does not exist, it normally isn't present in the positive cache.

Therefore repeated nonexistent requests can continuously reach the database.

There are two important traffic patterns.

### Pattern A — Repeated Nonexistent Key

```text
999
999
999
999
999
```

This can be handled effectively with **negative caching**.

First request:

```text
999
 ↓
Cache MISS
 ↓
DB → NOT FOUND
 ↓
Cache:

999 → NOT_FOUND
```

Subsequent requests:

```text
999
 ↓
Cache
 ↓
NOT_FOUND
```

The database is protected.

---

### Pattern B — Random Nonexistent Keys

Now imagine a bot generating:

```text
918273
472819
839201
192837
728192
...
```

Every request contains a new invalid ID.

Negative caching becomes much less effective:

```text
918273 → Cache MISS → DB
472819 → Cache MISS → DB
839201 → Cache MISS → DB
192837 → Cache MISS → DB
```

If we cache every negative result:

```text
Cache

918273 → NOT_FOUND
472819 → NOT_FOUND
839201 → NOT_FOUND
192837 → NOT_FOUND
...
```

we may fill the cache with millions of useless entries.

This creates **cache pollution**.

Useful product data may eventually be evicted to make room for negative entries that might never be requested again.

Bloom Filters are particularly useful for this second workload.

---

# 3. Adding a Bloom Filter

We can place a Bloom Filter before the expensive lookup path:

```text
Request
   ↓
Application
   ↓
Bloom Filter
   │
   ├── DEFINITELY NOT
   │        ↓
   │      404
   │
   └── MAYBE
            ↓
          Cache
            ↓ MISS
            DB
```

Now most random nonexistent IDs can be rejected before:

- network calls to a remote cache
- cache lookups
- database connections
- database queries

The Bloom Filter therefore acts as a **cheap probabilistic gate** in front of more expensive systems.

---

# 4. What Is a Bloom Filter?

A **Bloom Filter is a space-efficient probabilistic data structure used for membership checks.**

It answers:

```text
"Could X exist in this set?"
```

with two possible results:

```text
NO
→ definitely not present

MAYBE
→ might be present
```

That distinction is fundamental.

A Bloom Filter does **not** answer:

```text
YES, definitely present
```

Instead:

```text
NO    → authoritative rejection

MAYBE → perform authoritative lookup
```

The actual database/storage system remains the source of truth.

---

# 5. Internal Structure

A Bloom Filter mainly contains:

```text
1. Bit array
2. Multiple hash functions
```

Important parameters are:

```text
m = number of bits in the array
n = expected number of inserted elements
k = number of hash functions
```

Suppose:

```text
m = 16 bits
k = 3 hash functions
```

Initially:

```text
Index:

0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15

Bits:

0 0 0 0 0 0 0 0 0 0  0  0  0  0  0  0
```

The Bloom Filter does not store the original product IDs inside this array.

---

# 6. Inserting an Element

Suppose we insert:

```text
product_id = 101
```

Our three hash functions produce:

```text
h1(101) → 2
h2(101) → 7
h3(101) → 11
```

Set those positions to `1`:

```text
Index:

0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15

Bits:

0 0 1 0 0 0 0 1 0 0  0  1  0  0  0  0
    ↑         ↑          ↑
```

Now insert:

```text
product_id = 205
```

Suppose:

```text
h1(205) → 4
h2(205) → 7
h3(205) → 13
```

Notice that both products use bit `7`.

```text
101 → [2, 7, 11]
205 → [4, 7, 13]
          ↑
        shared
```

The resulting array might look like:

```text
0 0 1 0 1 0 0 1 0 0 0 1 0 1 0 0
```

This sharing is what makes Bloom Filters extremely memory efficient.

But it is also what creates false positives and makes deletion difficult.

---

# 7. Checking Membership

Suppose we query:

```text
product_id = 101
```

Run the same hash functions:

```text
h1(101) → 2
h2(101) → 7
h3(101) → 11
```

Now inspect those positions.

### Case 1 — One Required Bit Is 0

Suppose:

```text
bit[2]  = 1
bit[7]  = 0
bit[11] = 1
```

Because one required bit is missing:

```text
Bloom Filter → DEFINITELY NOT PRESENT
```

Why?

If `101` had been inserted, insertion would have set **all three positions**.

Therefore:

> If even one required bit is `0`, the element definitely was not inserted into the correctly maintained Bloom Filter.

---

# 8. Why Does Bloom Filter Say MAYBE?

Now suppose all positions are `1`:

```text
bit[2]  = 1
bit[7]  = 1
bit[11] = 1
```

We cannot conclude:

```text
101 definitely exists
```

because those bits may have been set by other elements.

For example:

```text
Product A → sets bit 2
Product B → sets bit 7
Product C → sets bit 11
```

Then another value might hash to:

```text
[2, 7, 11]
```

even though that value was never inserted.

Therefore:

```text
All bits = 1
      ↓
MAYBE PRESENT
```

---

# 9. False Positives

Suppose product `999` does not exist.

Its hashes happen to be:

```text
h1(999) → 2
h2(999) → 7
h3(999) → 11
```

Those bits were already set by other products.

Therefore:

```text
999
 ↓
Bloom Filter
 ↓
MAYBE
```

even though `999` does not exist.

This is a **false positive**.

Importantly, one other element does not need to collide with all of `999`'s positions.

The bits may have been set collectively:

```text
Product A → bit 2
Product B → bit 7
Product C → bit 11

999 hashes → [2,7,11]

All are 1
    ↓
False positive
```

---

# 10. False Positive Does Not Normally Break Correctness

Consider:

```text
999 does not exist
```

Bloom incorrectly says:

```text
MAYBE
```

The request continues:

```text
999
 ↓
Bloom → MAYBE
 ↓
Cache MISS
 ↓
Database
 ↓
NOT FOUND
 ↓
404
```

The user still receives the correct result.

The false positive merely caused:

```text
unnecessary cache/database work
```

Therefore:

> A Bloom Filter false positive is generally a **performance cost rather than a correctness failure**, provided `MAYBE` is verified against an authoritative source.

---

# 11. The Fundamental Guarantee

For a correctly maintained standard Bloom Filter:

```text
Bloom says NO
      ↓
Definitely absent
```

while:

```text
Bloom says MAYBE
      ↓
Could be present
OR
Could be absent
```

Therefore:

```text
False positives → possible

False negatives → not inherent to the
                  standard Bloom Filter algorithm
```

This is the key guarantee to remember in interviews.

### Important Production Caveat

A system can still effectively create a false negative if the Bloom Filter becomes stale.

Example:

```text
Product 500 inserted into DB
        ↓
Bloom Filter update missed
        ↓
Bloom doesn't know about 500
        ↓
GET /products/500
        ↓
Bloom → NO
        ↓
404 ❌
```

The Bloom Filter algorithm itself did not create the false negative.

The **system failed to maintain the filter correctly**.

We will cover synchronization in Part 2.

---

# 12. Bloom Filter Is Not the Source of Truth

This architecture is correct:

```text
Bloom → MAYBE
       ↓
Cache
       ↓
Database
       ↓
Authoritative answer
```

This architecture is dangerous:

```text
Bloom → MAYBE
       ↓
Assume object exists ❌
```

For example, never use:

```text
User ID
   ↓
Bloom Filter
   ↓
MAYBE
   ↓
Grant authorization ❌
```

An unauthorized user could be a Bloom Filter false positive.

The correct pattern would require authoritative verification.

### Principle

> `NO` allows us to avoid work.  
> `MAYBE` tells us to perform the real check.

---

# 13. Why Not Just Store Every ID in a HashSet?

Instead of using a Bloom Filter, we could maintain:

```text
HashSet

101
205
310
425
...
```

Then:

```text
101 → YES
999 → NO
```

Membership would be exact.

But consider:

```text
100 million product IDs
```

A HashSet stores the actual keys plus data-structure overhead.

That can require substantial memory.

A Bloom Filter does something fundamentally different:

```text
101 ─┐
205 ─┼─→ Hash Functions → Shared Bit Array
310 ─┤
425 ─┘
```

It does not store a compact copy of each individual ID.

All elements contribute to the **same shared bit array**.

### HashSet

```text
Actual keys stored
Exact membership
No false positives
More memory
```

### Bloom Filter

```text
Shared bit array
Probabilistic membership
False positives possible
Extremely memory efficient
```

The trade-off is:

> **Bloom Filter sacrifices exact membership information to dramatically reduce memory usage.**

---

# 14. Understanding `m`, `n`, and `k`

Three values largely determine Bloom Filter behavior:

```text
n = expected number of elements

m = size of bit array

k = number of hash functions
```

Usually:

```text
m > n
```

because we typically allocate multiple bits per expected item.

Example:

```text
n = 100 million products

m = 1 billion bits
```

Therefore:

```text
m / n = 10 bits per product
```

And:

```text
1 billion bits
÷ 8
≈ 125 MB
```

So roughly 125 MB can represent membership information for 100 million items probabilistically.

That demonstrates why Bloom Filters can be attractive at very large scale.

---

# 15. Choosing the Number of Hash Functions

A commonly used approximation for the optimal number of hash functions is:

```text
k ≈ (m / n) × ln(2)
```

For:

```text
m/n = 10
```

we get:

```text
k ≈ 10 × 0.693
  ≈ 6.93
  ≈ 7
```

You generally do **not** need to lead with this formula in a system-design interview.

The important part is understanding the trade-off.

---

# 16. Why More Hash Functions Are Not Always Better

Suppose we use very few hash functions.

```text
k = 1 or 2
```

An unknown element only needs a small number of already-set positions to produce:

```text
MAYBE
```

Increasing `k` initially improves discrimination.

For example:

```text
k = 2
→ unknown key needs 2 matching bits

k = 5
→ unknown key needs 5 matching bits
```

But increasing `k` also means every insertion sets more positions.

```text
k ↑
 ↓
More bits set per inserted element
 ↓
Bit array fills faster
 ↓
More positions become 1
 ↓
False-positive probability eventually increases
```

Therefore:

```text
Too few hashes
→ weak discrimination

Optimal number
→ good balance

Too many hashes
→ faster saturation + extra CPU
```

### Principle

> More hash functions are not always better.

---

# 17. Saturation

Suppose the Bloom Filter was designed for:

```text
n = 100M products
```

But the catalog grows:

```text
100M
 ↓
150M
 ↓
220M
```

while:

```text
m remains unchanged
```

More and more bits become `1`.

```text
Initially:

0 0 1 0 0 1 0 0 1 0 0 1

Later:

1 1 1 0 1 1 1 1 1 0 1 1

Eventually:

1 1 1 1 1 1 1 1 1 1 1 1
```

As saturation increases, a random nonexistent key becomes increasingly likely to find all of its required positions already set.

Therefore:

```text
n ↑
 ↓
Bit occupancy ↑
 ↓
False-positive rate ↑
 ↓
Bloom rejection rate ↓
 ↓
More requests reach Cache / DB
```

---

# 18. What Does a Saturated Bloom Filter Look Like in Production?

Suppose monitoring originally shows:

```text
Bloom rejection rate: 80%
Observed FPR:          1%
DB traffic:            normal
```

Months later:

```text
Bloom rejection rate: 25%
Observed FPR:          18%
DB traffic:            ↑
API latency:           ↑
```

The application is still returning correct results.

But the Bloom Filter is no longer filtering effectively.

The first things to investigate include:

```text
Actual n vs designed n
Bit occupancy / saturation
Observed false-positive rate
Bloom rejection rate
DB fall-through rate
Filter version / age
```

If:

```text
Designed capacity = 100M
Actual elements   = 220M
```

saturation becomes a strong hypothesis.

---

# 19. Capacity Planning

A Bloom Filter should not be sized only for today's dataset.

Suppose:

```text
Current products = 100M
```

but expected growth is:

```text
100M → 150M → 200M
```

Designing exactly for:

```text
100M
```

may cause the false-positive rate to deteriorate quickly.

Instead, capacity planning should consider:

```text
Expected n
+
Expected growth
+
Target false-positive rate
+
Available memory
```

This is similar to many other system-design components:

> Capacity should be designed for expected future load, not merely current load.

---

# 20. Bloom Filter + Negative Cache

Bloom Filters and negative caching are not necessarily competing solutions.

They can complement each other.

```text
Request
   ↓
Bloom Filter
   │
   ├── NO
   │    ↓
   │  Return NOT_FOUND
   │
   └── MAYBE
          ↓
        Cache
       /     \
    HIT       MISS
     ↓          ↓
  Return        DB
                ↓
             NOT FOUND
                ↓
       optionally negative-cache
```

Suppose nonexistent `999` happens to be a Bloom false positive.

First request:

```text
999
 ↓
Bloom → MAYBE
 ↓
Cache MISS
 ↓
DB → NOT FOUND
 ↓
Cache:

999 → NOT_FOUND
```

Second request:

```text
999
 ↓
Bloom → MAYBE
 ↓
Cache → NOT_FOUND
 ↓
404
```

The Bloom Filter failed to eliminate the request, but negative caching prevents repeated DB lookups.

---

# 21. Which Problem Does Each Solve?

### Repeated Invalid Key

```text
999
999
999
999
```

Negative caching works extremely well.

```text
First:
Cache MISS → DB

Later:
Negative Cache HIT
```

---

### Huge Random Invalid-Key Space

```text
918273
472819
839201
192837
...
```

Bloom Filter works particularly well.

```text
Random ID
   ↓
Bloom → NO
   ↓
Reject
```

No need to create millions of negative cache entries.

---

### Combined Defense

```text
Random invalid IDs
        ↓
Bloom Filter
        ↓
Reject most immediately

False positives / repeated invalid IDs
        ↓
Negative Cache
        ↓
Avoid repeated DB work

Remaining requests
        ↓
Database
```

### Mental Model

> **Bloom Filter protects against a huge space of random nonexistent keys.**

> **Negative caching protects against repeated requests for the same nonexistent keys.**

They can be used together when both traffic patterns exist.

---

# 22. Part 1 Interview Summary

A Bloom Filter is a **space-efficient probabilistic membership data structure** built using a bit array and multiple hash functions.

Its fundamental guarantee is:

```text
NO
→ definitely absent

MAYBE
→ possibly present
→ authoritative verification required
```

It allows:

```text
False positives
```

but a correctly maintained standard Bloom Filter does not inherently produce:

```text
False negatives
```

Bloom Filters are valuable when:

```text
Membership checks are frequent
+
Authoritative lookups are comparatively expensive
+
Many queried elements may not exist
+
False positives can safely be verified downstream
```

A common architecture is:

```text
Request
   ↓
Bloom Filter
   │
   ├── NO → Reject immediately
   │
   └── MAYBE
          ↓
        Cache
          ↓
        Database
```

The key sizing parameters are:

```text
m = bit-array size
n = expected number of elements
k = number of hash functions
```

As `n` grows relative to `m`, the bit array becomes increasingly saturated and the false-positive rate rises.

### Core Principle

> Use a Bloom Filter when a cheap probabilistic membership test can eliminate large amounts of unnecessary downstream work while the authoritative system remains responsible for confirming `MAYBE` results.
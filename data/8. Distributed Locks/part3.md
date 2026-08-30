# Distributed Locks — System Design Handbook

## Part 3 — Contention, Timeouts, Deadlocks, and Alternatives to Locks

---

# 55. Lock Granularity

A distributed lock can protect resources at different levels.

Consider inventory.

A coarse-grained lock could be:

```text
lock:inventory
```

Every inventory update must acquire the same lock:

```text
Product 123 ─┐
Product 456 ─┼──→ lock:inventory
Product 789 ─┘
```

This provides simple coordination but unnecessarily serializes unrelated operations.

A finer-grained design could use:

```text
lock:inventory:123
lock:inventory:456
lock:inventory:789
```

Now unrelated products can be updated concurrently.

```text
Product 123 → lock:123 → update

Product 456 → lock:456 → update

Product 789 → lock:789 → update
```

---

# 56. Coarse vs Fine-Grained Locks

## Coarse-Grained Lock

Example:

```text
lock:inventory
```

Advantages:

```text
Simpler coordination
Fewer locks to manage
```

Disadvantages:

```text
More contention
Lower concurrency
Unrelated operations block each other
```

---

## Fine-Grained Lock

Example:

```text
lock:inventory:<product_id>
```

Advantages:

```text
Higher concurrency
Unrelated resources do not block each other
```

Disadvantages:

```text
More locks
More coordination complexity
Potential deadlocks when operations need multiple locks
```

General rule:

> Lock at the smallest business-resource boundary that actually requires mutual exclusion.

---

# 57. Hot Locks

Fine-grained locking does not eliminate contention when many requests target the same resource.

Suppose:

```text
10,000 requests/sec
```

all attempt to purchase:

```text
Product 123
```

All requests require:

```text
lock:inventory:123
```

Therefore:

```text
Server A ─┐
Server B ─┼──→ lock:inventory:123
Server C ─┤
Server D ─┘
```

Only one valid holder can execute the protected critical section at a time.

This lock becomes a:

> Hot lock

---

# 58. Why Adding Servers Does Not Fix a Hot Lock

Suppose updating inventory is serialized:

```text
Acquire lock
     ↓
Update inventory
     ↓
Release lock
```

Adding more application servers gives us:

```text
10 servers
    ↓
100 servers
    ↓
1000 servers
```

but all still contend for:

```text
lock:inventory:123
```

Therefore the protected operation remains serialized.

Adding servers may actually create more contenders without increasing throughput for that particular resource.

> If a resource must be serialized, scaling the callers does not remove the serialization bottleneck.

---

# 59. Critical Section Duration

Suppose the critical section takes:

```text
5 seconds
```

Only one holder can execute at a time.

Then:

```text
Request 1 → executes

Request 2 → waits ~5 sec

Request 3 → waits ~10 sec

Request 4 → waits ~15 sec
```

As contention grows, waiting latency grows.

Therefore:

> Keep the critical section as short as reasonably possible.

Avoid performing unnecessary slow work while holding the lock.

---

# 60. Traffic Can Increase Lock Latency

Lock acquisition latency can increase even if the critical section itself does not become slower.

Suppose:

```text
Critical section = 5 ms
```

With little contention:

```text
R1 → acquire → execute → release

later...

R2 → acquire → execute → release
```

Almost nobody waits.

Now suppose many requests arrive simultaneously:

```text
R1 → execute for 5 ms

R2 → wait ~5 ms

R3 → wait ~10 ms

R4 → wait ~15 ms
```

The operation itself is still 5 ms.

The increased latency comes from:

> Queueing behind other lock contenders.

Therefore increased lock wait time may indicate:

```text
Longer critical section

OR

More contenders for the same lock
```

---

# 61. Handling Hot Locks

Possible approaches depend on the business problem.

Examples include:

```text
Rate limiting

Controlled queueing

Reducing critical-section duration

Atomic database operations

Idempotency

Partitioning the resource when business semantics allow it
```

Adding application servers alone usually does not solve contention around one serialized resource.

---

# 62. Rate Limiting

Suppose thousands of requests are competing for one hot resource.

Rate limiting can reduce the number of requests allowed to reach the protected path.

```text
Incoming requests
       ↓
Rate Limiter
       ↓
Allowed requests
       ↓
Distributed Lock
```

Rate limiting does not make the serialized critical section faster.

Instead, it:

```text
Protects the system
Reduces overload
Prevents excessive contention
```

---

# 63. Queueing

Another option is controlled queueing.

Instead of:

```text
1000 workers
     ↓
all hammer the same lock
```

we could place work into a queue:

```text
Requests
   ↓
 Queue
   ↓
Controlled processing
   ↓
Protected resource
```

Queueing does not inherently increase the throughput of a serialized resource.

If each operation takes 5 seconds:

```text
R1 → 5 sec
R2 → 5 sec
R3 → 5 sec
```

the underlying throughput remains limited.

The benefit is:

> Queueing controls contention and absorbs bursts instead of allowing every contender to hammer the resource simultaneously.

---

# 64. Partitioning Work

Sometimes a business resource can be divided into independent ownership buckets.

Suppose:

```text
Product 123
Inventory = 10,000
```

Instead of one counter:

```text
Product 123 → 10,000
```

the business may allow:

```text
Bucket A → 2,500
Bucket B → 2,500
Bucket C → 2,500
Bucket D → 2,500
```

Then separate locks can protect separate buckets:

```text
lock:123:A
lock:123:B
lock:123:C
lock:123:D
```

This creates more opportunities for parallelism.

However, it also introduces complexity.

For example:

```text
Bucket A → sold out

Bucket B → inventory still available
```

The system may require rebalancing or additional coordination.

Therefore:

> Partition work only when the business semantics allow partitioned or weaker coordination.

It is not a universal solution to lock contention.

---

# 65. Waiting for a Lock

When a contender cannot acquire a lock, several policies are possible:

```text
Fail immediately

Wait

Wait with timeout

Retry
```

Waiting forever is generally dangerous.

Requests can accumulate indefinitely if the lock holder becomes slow or contention becomes extreme.

A common approach is:

> Use bounded lock acquisition time.

---

# 66. Acquisition Timeout

Suppose:

```text
Try acquiring lock
      ↓
Lock busy
      ↓
Wait up to 2 seconds
```

If acquisition succeeds:

```text
execute
```

Otherwise:

```text
timeout
   ↓
fail / retry later
```

This prevents contenders from waiting indefinitely.

User-facing systems may prefer:

```text
Fail fast

OR

Short timeout
```

because a human is waiting for the response.

Background jobs may tolerate longer waits and retries.

---

# 67. Timeout Does Not Remove Contention

A timeout limits:

```text
How long am I willing to wait?
```

It does not necessarily reduce how many contenders are attempting acquisition.

Therefore timeout is often combined with:

```text
Backoff
Jitter
Rate limiting
Queueing
```

depending on the workload.

---

# 68. Retry Backoff

Suppose a worker fails to acquire a lock.

Bad strategy:

```text
retry immediately
retry immediately
retry immediately
retry immediately
```

Many workers doing this can overload the lock store.

Instead:

```text
Attempt 1 → fail

wait

Attempt 2 → fail

wait longer

Attempt 3
```

This is:

> Retry backoff

Backoff reduces how aggressively contenders retry.

---

# 69. Retry Jitter

Backoff alone can still result in synchronized retries.

Suppose 1,000 workers fail simultaneously and all use:

```text
wait 1 second
```

Then:

```text
1 second later
      ↓
1000 workers retry together
```

Again:

```text
1 wins
999 fail
```

Those workers may synchronize repeatedly.

Jitter adds randomness:

```text
Worker A → retry after 900 ms

Worker B → retry after 1.2 sec

Worker C → retry after 1.5 sec
```

Now retries are spread over time.

This helps prevent a:

> Thundering herd

---

# 70. Timeout vs Backoff vs Jitter

A useful mental model:

```text
Timeout
→ How long am I willing to wait?

Backoff
→ How aggressively should I retry?

Jitter
→ How do I prevent contenders from retrying together?
```

These solve related but different problems.

---

# 71. Deadlocks with Multiple Distributed Locks

Sometimes one business operation needs multiple locks.

Consider:

```text
Transfer A → B
```

which needs:

```text
lock:account:A
lock:account:B
```

At the same time:

```text
Transfer B → A
```

needs the same two resources.

If each process locks the source account first:

```text
Process 1                    Process 2

Transfer A → B               Transfer B → A

Acquire A ✅                 Acquire B ✅

Acquire B                    Acquire A
    ↓                            ↓
WAIT                         WAIT
```

Neither process can continue.

This is a distributed deadlock.

---

# 72. Deterministic Lock Ordering

A common prevention technique is:

> Always acquire multiple locks in the same deterministic order.

Suppose:

```text
Account A = 17
Account B = 91
```

System rule:

```text
Always acquire account locks
in ascending account-ID order.
```

For:

```text
Transfer 17 → 91
```

acquire:

```text
17
↓
91
```

For:

```text
Transfer 91 → 17
```

we still acquire:

```text
17
↓
91
```

The direction of the business operation does not determine lock acquisition order.

---

# 73. Business Order vs Lock Order

This distinction is important.

Business operation:

```text
Transfer money

91 → 17
```

Lock acquisition:

```text
lock 17
lock 91
```

Then:

```text
perform transfer 91 → 17
```

Therefore:

```text
Business operation order
!=
Lock acquisition order
```

Lock order exists to prevent circular waiting.

---

# 74. Multiple Resource Example

Suppose an operation needs:

```text
account 91
account 17
account 42
```

With ascending ordering:

```text
17
↓
42
↓
91
```

Every process needing any combination of these resources follows the same ordering rule.

This prevents processes from forming circular dependencies by acquiring the same resources in opposite orders.

---

# 75. Partial Lock Acquisition

Suppose a process needs:

```text
Lock A
Lock B
Lock C
```

It successfully acquires:

```text
A ✅
B ✅
```

but cannot acquire:

```text
C ❌
```

The process should not indefinitely retain A and B while waiting for C.

Depending on the design, it may:

```text
release acquired locks
      ↓
back off
      ↓
retry later
```

Acquisition timeouts help prevent indefinite waits.

---

# 76. Starvation

Deadlock is not the only waiting problem.

Suppose:

```text
A acquires

B waits
C waits

A releases

C happens to acquire

B continues waiting
```

Later another contender may beat B again.

The system continues making progress, but B may wait excessively.

This is:

> Starvation

---

# 77. Deadlock vs Starvation

```text
Deadlock
→ involved contenders cannot make progress

Starvation
→ system makes progress,
  but one contender repeatedly fails to get access
```

Distributed locks do not automatically guarantee fairness.

Strict fairness may require additional coordination mechanisms.

For many systems, bounded timeouts and appropriate retry behavior are sufficient.

---

# 78. Do We Need a Distributed Lock?

Distributed locks introduce significant complexity:

```text
Atomic acquisition

Leases

Renewal

Ownership checking

Stale owners

Fencing

Timeouts

Contention

Lock-store failures
```

Therefore:

> Do not automatically introduce a distributed lock whenever concurrency exists.

First ask whether the business invariant can be enforced more directly.

---

# 79. Alternative — Idempotency

Suppose two requests attempt:

```text
POST /orders/123/payment
```

One solution is:

```text
lock:order:123
      ↓
process payment
```

But if both requests represent the same logical business operation, idempotency may be simpler.

```text
Request A ─┐
           ├──→ same idempotency key
Request B ─┘
                 ↓
          one business effect
```

Now duplicate execution attempts do not produce duplicate business effects.

Therefore:

> If duplicate attempts are acceptable but duplicate effects are not, idempotency may remove the need for a distributed lock.

---

# 80. Distributed Lock Does Not Guarantee Exactly-Once

Suppose:

```text
Acquire lock

Generate invoice

Save invoice

Send email

Release lock
```

The process crashes after:

```text
Save invoice
```

The lease eventually expires.

Another worker retries from the beginning.

The distributed lock prevented overlapping execution while ownership was valid.

It did NOT guarantee:

```text
The entire workflow executes exactly once.
```

The retry may repeat earlier effects.

---

# 81. Transactions and Idempotency

If all operations belong to the same transactional system, we may be able to use:

```text
BEGIN TRANSACTION

operations...

COMMIT
```

Then:

```text
everything succeeds

OR

everything rolls back
```

When effects cross systems and cannot share one transaction, idempotent processing becomes important.

Therefore:

> Distributed locks handle exclusive coordination; transactions and idempotency handle safe business effects and retries.

These are different responsibilities.

---

# 82. Alternative — Atomic Database Operation

Suppose:

```text
Product 123
stock = 1
```

Two servers try to purchase the final unit.

We could use:

```text
Distributed lock
      ↓
Read stock
      ↓
Update stock
      ↓
Release
```

But the database may directly enforce the invariant:

```sql
UPDATE inventory
SET stock = stock - 1
WHERE product_id = 123
  AND stock > 0;
```

The database concurrency mechanism ensures the condition is evaluated safely.

Once stock becomes:

```text
0
```

another update no longer matches:

```text
stock > 0
```

No application-level distributed lock may be necessary.

---

# 83. Alternative — Database Constraints

Suppose usernames must be unique.

Two servers simultaneously attempt:

```text
username = "ashutosh"
```

We could build:

```text
lock:username:ashutosh
```

But the database already has a simpler mechanism:

```text
UNIQUE(username)
```

Both requests may attempt insertion.

The database accepts one and rejects the conflicting insert.

Therefore:

> If the database can directly enforce the invariant, prefer that over introducing a distributed lock.

---

# 84. Alternative — Optimistic Concurrency

Suppose:

```text
order_id = 123
status = PENDING
version = 5
```

A and B both read:

```text
version = 5
```

A performs:

```sql
UPDATE orders
SET status = 'PAID',
    version = 6
WHERE order_id = 123
  AND version = 5;
```

A succeeds.

Now:

```text
version = 6
```

B attempts an update based on its old version:

```sql
UPDATE orders
SET status = 'CANCELLED',
    version = 6
WHERE order_id = 123
  AND version = 5;
```

The condition no longer matches.

B updates:

```text
0 rows
```

B now knows:

```text
Someone modified the record
since I read it.
```

---

# 85. Why Is It Called Optimistic Concurrency?

With locking, we effectively say:

```text
Conflict may happen
      ↓
prevent others from entering
```

With optimistic concurrency:

```text
Assume conflict probably won't happen
      ↓
perform work without holding a lock
      ↓
verify state hasn't changed when writing
```

If the version changed:

```text
conflict detected
```

The operation can then:

```text
retry
fail
re-read latest state
```

Optimistic concurrency is attractive when conflicts are relatively uncommon.

---

# 86. Prefer the Simplest Correct Primitive

Before introducing a distributed lock, consider:

```text
Can a unique constraint enforce this?

Can an atomic DB update enforce this?

Can optimistic concurrency detect conflicts?

Can idempotency make retries harmless?

Can a transaction protect the operation?
```

If yes, those mechanisms may be simpler and safer.

Use a distributed lock when the problem genuinely requires:

> Exclusive coordination across independent processes or systems around a shared resource or operation.

---

# Part 3 Summary

Lock granularity determines how much work becomes serialized.

```text
Coarse lock
→ simpler
→ more contention

Fine-grained lock
→ more concurrency
→ more coordination complexity
```

Hot resources can create hot locks.

Adding application servers does not increase the throughput of an operation that must remain serialized.

High contention increases:

```text
lock wait time
latency
timeouts
load on coordination infrastructure
```

Useful controls include:

```text
Acquisition timeout
Backoff
Jitter
Rate limiting
Controlled queueing
Short critical sections
```

When multiple locks are required:

```text
Acquire them in deterministic order
```

to prevent circular waiting and deadlocks.

Most importantly, a distributed lock should not be the default solution to every concurrency problem.

Prefer simpler mechanisms when they directly enforce the business invariant:

```text
Atomic DB operation
Database constraint
Optimistic concurrency
Transaction
Idempotency
```

A distributed lock is most appropriate when the system genuinely requires:

```text
Multiple independent contenders
        +
Shared resource/operation
        +
Exclusive coordination
```
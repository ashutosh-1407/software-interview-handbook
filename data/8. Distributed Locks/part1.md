# Distributed Locks — System Design Handbook

## Part 1 — Fundamentals, Lock Model, Leases, and Ownership

---

# 1. Why Do We Need Distributed Locks?

Consider an application running on multiple servers:

```text
                 Load Balancer
                /      |      \
               ↓       ↓       ↓
          Server A  Server B  Server C
```

Suppose every server runs the same scheduled job:

```text
generateDailyReport()
```

At midnight:

```text
Server A → generateDailyReport()
Server B → generateDailyReport()
Server C → generateDailyReport()
```

But the business requirement is:

```text
Only one instance should generate the report.
```

Inside a single process, we could protect the operation using a normal mutex.

But these servers:

- are separate processes
- may run on separate machines
- have separate memory

Therefore:

```text
Server A's local mutex
```

cannot prevent:

```text
Server B
```

from executing the same operation.

We need coordination through a system visible to all contenders.

That is the purpose of a:

> **Distributed Lock**

---

# 2. Quick Concurrency Refresher

Before understanding distributed locks, remember the basic concurrency concepts.

---

## 2.1 Race Condition

Suppose:

```text
balance = 100
```

Two threads execute:

```text
balance = balance + 50
```

Possible execution:

```text
Thread A                    Thread B

Read 100
                            Read 100

Calculate 150
                            Calculate 150

Write 150
                            Write 150
```

Final value:

```text
150
```

Expected value:

```text
200
```

The result depended on the timing/interleaving of concurrent operations.

This is a:

> **Race condition**

---

# 3. Critical Section

A critical section is code accessing shared state that must not be executed concurrently when doing so would violate correctness.

Example:

```text
LOCK

balance = balance + 50

UNLOCK
```

Only one execution context enters the protected section at a time.

---

# 4. Lock and Mutex

A lock is a general synchronization mechanism controlling access to shared resources.

A mutex provides:

> **Mutual exclusion**

Meaning:

```text
At most one owner at a time.
```

Example:

```text
Thread A → acquire mutex → succeeds

Thread B → acquire mutex → waits

Thread A → release

Thread B → acquire → succeeds
```

For distributed systems, we want similar exclusive ownership across independent processes or application instances.

---

# 5. Semaphore

A semaphore allows a limited number of concurrent users.

Example:

```text
Database connection pool
Maximum connections = 3
```

Then:

```text
A → acquire permit ✅
B → acquire permit ✅
C → acquire permit ✅
D → wait
```

Quick distinction:

```text
Mutex
→ one owner

Semaphore
→ up to N concurrent users
```

Distributed locks usually deal with the mutex-like case:

```text
Only one valid lock holder at a time.
```

---

# 6. Atomic Operations

Atomicity is fundamental to distributed locking.

Suppose two servers perform:

```text
1. Check whether lock exists
2. If not, create lock
```

This is unsafe if the operations are separate.

Example:

```text
Server A                    Server B

Check lock
→ missing

                            Check lock
                            → missing

Create lock                 Create lock
```

Both servers may believe they acquired the lock.

Therefore acquisition must conceptually be:

```text
IF lock is available
THEN acquire it
```

as one indivisible operation.

> **Lock acquisition must be atomic.**

---

# 7. Basic Distributed Lock Model

A simple database-backed lock could contain:

```text
lock_name
owner
expires_at
```

Example:

```text
lock_name       owner       expires_at
-----------------------------------------
daily_report    server-A    12:00:30
```

The shared lock store could be:

- a database
- Redis
- a coordination system

All application instances consult the same coordination system.

---

# 8. Acquiring the Lock

A contender can acquire the lock when:

```text
Lock does not exist

OR

Existing lock has expired
```

Conceptually:

```text
Server A ─┐
Server B ─┼──→ Shared Lock Store
Server C ─┘
```

Only one contender should successfully transition:

```text
AVAILABLE → OWNED
```

The availability check and ownership update must happen atomically.

---

# 9. Why Do We Store the Owner?

Suppose:

```text
lock_name       owner
------------------------
daily_report    server-A
```

The owner tells us which contender currently holds the lock.

This becomes important for:

```text
Renewal
Release
```

Server B must not be allowed to:

```text
renew A's lock
```

or:

```text
release A's lock
```

Therefore these operations must verify ownership.

---

# 10. Safe Release

Suppose:

```text
A acquires lock
```

Then A's lease expires.

B acquires:

```text
owner = server-B
```

Later A finishes its old work.

If A blindly executes:

```text
DELETE lock
```

A could delete B's valid lock.

Therefore release must conceptually perform:

```text
IF owner == A
THEN release
```

atomically.

For a database-backed implementation:

```sql
DELETE FROM locks
WHERE lock_name = 'daily_report'
  AND owner = 'server-A';
```

The ownership check prevents A from releasing another owner's lock.

---

# 11. Deadlock Refresher

Suppose an operation needs two locks.

```text
Process 1                    Process 2

Acquire A                    Acquire B
    ↓                            ↓
Acquire B                    Acquire A
    ↓                            ↓
WAIT                         WAIT
```

Process 1 waits for Process 2.

Process 2 waits for Process 1.

Neither progresses.

This is:

> **Deadlock**

We will later prevent this using deterministic lock ordering.

---

# 12. The Crash Problem

Suppose A acquires a distributed lock:

```text
A → acquire
     ↓
Critical section
```

Then A crashes before releasing it.

Without expiration:

```text
Lock remains owned forever
        ↓
B cannot acquire
C cannot acquire
        ↓
Protected operation stops
```

This is why distributed locks commonly use:

> **Leases / TTLs**

---

# 13. Lease / Lock Timeout

Instead of saying:

```text
A owns this lock until A releases it.
```

we say:

```text
A owns this lock until:

A releases it

OR

the lease expires.
```

Example:

```text
owner = server-A
TTL = 30 seconds
```

Normal case:

```text
A acquires
    ↓
does work
    ↓
releases
```

Crash case:

```text
A acquires
    ↓
A crashes
    ↓
cannot release
    ↓
TTL expires
    ↓
B can acquire
```

Therefore:

> **A lease prevents a crashed owner from holding the lock forever.**

---

# 14. Choosing a Lease Duration

The lease should be long enough for normal work but should not remain stuck excessively long after failure.

Suppose:

```text
Normal work = 2 minutes
Occasional work = 8 minutes
TTL = 5 minutes
```

The 5-minute lease is unsafe without renewal.

At minute 5:

```text
A still working
    ↓
lease expires
    ↓
B acquires
    ↓
A and B may execute concurrently
```

Therefore long-running operations commonly require:

> **Lease renewal**

---

# 15. Lease Renewal

A healthy owner can periodically extend its lease.

Example:

```text
TTL = 30 seconds

A acquires
    ↓
20 seconds
    ↓
renew lease
    ↓
20 seconds
    ↓
renew again
```

But renewal must verify ownership.

Conceptually:

```text
IF current_owner == A
THEN extend expires_at
```

For example:

```sql
UPDATE locks
SET expires_at = new_expiry
WHERE lock_name = 'daily_report'
  AND owner = 'server-A';
```

If zero rows are updated:

```text
A should assume:

"I no longer own the lock."
```

---

# 16. Renewal Must Be Atomic

We must not perform:

```text
1. Read owner
2. Verify owner == A
3. Extend expiration
```

as independent operations.

Ownership could change between steps.

Instead:

```text
Check ownership + renew
```

must be atomic.

The same principle applies throughout the lock lifecycle.

---

# 17. Atomic Lock Lifecycle

The three important operations are:

## Acquire

Atomically:

```text
IF lock missing/expired
THEN become owner
```

## Renew

Atomically:

```text
IF I am still owner
THEN extend lease
```

## Release

Atomically:

```text
IF I am still owner
THEN release
```

This is one of the most important Distributed Locks V1 rules.

---

# 18. Network Delay During Renewal

Suppose:

```text
A owns lock
TTL = 30 sec
```

A sends a renewal request.

But the network delays it.

Timeline:

```text
A sends renewal
      ↓
network delay
      ↓
lease expires
      ↓
B acquires lock
      ↓
A's renewal arrives
```

A's renewal must fail because:

```text
current owner = B
```

A can no longer safely assume ownership.

---

# 19. The Stale Owner Problem

The more dangerous situation is that A may still be executing.

Example:

```text
A acquires lock
      ↓
A starts work
      ↓
A pauses / loses connectivity
      ↓
lease expires
      ↓
B acquires lock
      ↓
A resumes
```

Now:

```text
A → old/stale owner
B → current legitimate owner
```

Both may attempt to interact with the protected resource.

This is called the:

> **Stale owner problem**

Lease expiration alone does not completely solve distributed lock correctness.

---

# 20. GC Stall Example

A process does not necessarily need to crash to become stale.

For example, a runtime may experience a long Garbage Collection pause.

```text
A acquires lock
TTL = 30 sec

A starts work

      ↓

GC pause for 40 sec

      ↓

lease expires

      ↓

B acquires

      ↓

A resumes execution
```

A resumes from where it stopped.

Unless additional protection exists, A may continue acting as though it still owns the resource.

Long network pauses or process scheduling stalls can create similar situations.

---

# 21. Fail-Closed Behavior Under Uncertainty

Suppose A cannot communicate with the lock store.

A cannot determine whether:

```text
its lease is still valid
```

or:

```text
its lease expired and another owner acquired the lock.
```

A must choose between availability and correctness.

Fail open:

```text
"I cannot verify ownership,
but I'll continue."
```

This risks concurrent execution.

Fail closed:

```text
"I cannot prove ownership,
therefore I will stop protected work."
```

For distributed locks, correctness usually takes priority.

Rule:

> **If ownership cannot be verified, behave as though you do not own the lock.**

---

# 22. Correctness Over Availability

Distributed locks exist specifically to protect an exclusivity invariant:

```text
At most one valid owner should execute
the protected critical section at a time.
```

Therefore:

```text
Cannot establish ownership
        ↓
Do not enter critical section
```

is generally safer than:

```text
Cannot establish ownership
        ↓
Execute anyway
```

The latter defeats the purpose of having the lock.

This trade-off will connect naturally to:

```text
CAP
Consensus
Leader Election
```

in later chapters.

---

# 23. Part 1 Mental Model

The basic distributed lock can be remembered as:

```text
                 Shared Lock Store
                        │
        ┌───────────────┼───────────────┐
        ↓               ↓               ↓
     Server A        Server B        Server C

                  lock_name
                  owner
                  expires_at
```

Lifecycle:

```text
Acquire
   ↓
Execute critical section
   ↓
Renew if necessary
   ↓
Release
```

Correctness requirements:

```text
Acquire
→ atomic availability check + ownership

Renew
→ atomic ownership check + extension

Release
→ atomic ownership check + release

Lease
→ recover from dead/crashed owner

Uncertain ownership
→ fail closed
```

But one major problem remains:

```text
What if an old owner continues operating
after its lease expires?
```

That requires:

> **Fencing tokens**

which we cover next.

---

# Part 1 Summary

A distributed lock coordinates exclusive access across independent processes or application instances.

The basic model is:

```text
lock_name
owner
expires_at
```

A correct basic implementation requires:

```text
Atomic acquisition
Owner-aware renewal
Owner-aware release
Lease / TTL
Safe behavior when ownership is uncertain
```

Leases solve the problem of crashed owners holding locks forever, but introduce another problem:

```text
Lease expires
      ↓
new owner acquires
      ↓
old owner may still be executing
```

That stale-owner problem leads directly to fencing tokens and the more advanced correctness mechanisms covered in Part 2.
# Distributed Locks — System Design Handbook

## Part 4 — Production Failures, Monitoring, Design Decisions, and Final Review

---

# 87. Distributed Lock Failure Model

A distributed lock should be designed around failures.

The main lifecycle is:

```text
Acquire
   ↓
Execute Critical Section
   ↓
Renew if needed
   ↓
Release
```

At every stage, ask:

```text
What happens if the process crashes?

What happens if the network is delayed?

What happens if the lease expires?

What happens if the lock store fails?

What happens if another contender acquires?

What happens if the old owner continues working?
```

Distributed-lock correctness comes from handling these failure cases deliberately.

---

# 88. Owner Crashes After Acquiring

Suppose:

```text
A acquires lock
      ↓
starts work
      ↓
CRASHES
```

Without a lease:

```text
lock remains forever
      ↓
other contenders blocked forever
```

With a lease:

```text
A crashes
    ↓
TTL expires
    ↓
B can acquire
```

Therefore:

> **Leases provide recovery from dead owners.**

---

# 89. Owner Crashes After Partial Business Work

Suppose the protected operation is:

```text
Generate Invoice
      ↓
Save Invoice
      ↓
Send Invoice
```

A executes:

```text
Generate ✅
Save     ✅
Send     ❌
Crash
```

After the lease expires:

```text
B acquires
    ↓
starts operation again
```

The distributed lock does NOT guarantee:

```text
exactly-once execution
```

Possible duplicate effects include:

```text
duplicate invoice
duplicate email
duplicate external operation
```

Therefore:

> **Distributed locks prevent overlapping execution; they do not make partially completed workflows exactly once.**

Use:

```text
Transactions
Idempotency
```

where appropriate.

---

# 90. Owner Loses Connectivity to Lock Store

Suppose A owns the lock but loses connectivity to the coordination store.

A cannot determine whether:

```text
its lease is still valid
```

or:

```text
its lease expired and B acquired
```

The safe behavior is:

```text
Cannot verify ownership
        ↓
Stop protected work
```

This is:

> **Fail-closed behavior.**

For lock correctness:

```text
Uncertainty
→ do not assume ownership
```

---

# 91. Lease Expires While Owner Is Still Running

Suppose:

```text
TTL = 30 sec
```

but A pauses for 40 seconds.

```text
A acquires
   ↓
pause
   ↓
TTL expires
   ↓
B acquires
   ↓
A resumes
```

Now:

```text
A = stale owner
B = current owner
```

Lease renewal helps reduce this risk.

Fencing protects the downstream resource if A still acts after losing ownership.

---

# 92. Stale Owner Protection

Suppose:

```text
A token = 41
B token = 42
```

B's operation reaches the resource:

```text
highest token = 42
```

Then A's delayed operation arrives:

```text
token = 41
```

Resource rejects:

```text
41 < 42
```

Therefore:

> **Fencing prevents an old owner from corrupting state after ownership has moved on.**

---

# 93. Lock Store Failure

Suppose:

```text
Server A ─┐
Server B ─┼──→ Lock Store ❌
Server C ─┘
```

If a contender cannot establish ownership, it should not simply execute anyway.

Unsafe:

```text
Lock store unavailable
        ↓
"Let's continue anyway"
```

This risks:

```text
multiple owners
```

Safer:

```text
Lock store unavailable
        ↓
cannot prove ownership
        ↓
fail / wait / retry
```

For distributed locks:

> **Correctness often takes priority over availability.**

---

# 94. Replication / Failover Failure

Consider:

```text
Redis Primary
     ↓
Replica
```

A acquires on the primary:

```text
lock = A
```

Before replication completes:

```text
Primary crashes
```

Replica is promoted but never saw A's lock.

Then:

```text
B acquires
```

Potential result:

```text
A believes it owns lock

B believes it owns lock
```

This violates mutual exclusion.

Therefore:

> **Lock-store replication and failover semantics are part of the lock's correctness model.**

---

# 95. Lock Contention

Suppose:

```text
lock:product:123
```

normally has:

```text
5 ms acquisition wait
```

but suddenly wait time becomes:

```text
3 seconds
```

Possible causes include:

```text
More contenders

Longer critical section

Slow downstream dependency

Hot resource

Deployment regression
```

The lock store itself may still be healthy.

---

# 96. Healthy Lock Store vs Contended Lock

A lock store can be healthy while application-level lock latency is bad.

Healthy lock store means:

```text
Acquire operations respond normally

Renew operations respond normally

Release operations respond normally

No unusual infrastructure errors
```

But contention can still cause:

```text
long waiting queues
```

Example:

```text
Critical section = 5 ms

1000 contenders arrive
```

Only one can execute at a time.

The remaining requests wait behind it.

---

# 97. Important Production Metrics

Useful lock metrics include:

```text
Acquisition success rate

Acquisition failure rate

Acquisition wait time

Lock timeout count

Lock hold duration

Lease renewal failures

Release failures

Retry count

Hot lock names

Fencing-token rejections
```

These help answer:

```text
Is the lock functioning correctly?

Is contention increasing?

Are holders keeping locks too long?

Are owners losing leases?

Is one resource becoming hot?
```

---

# 98. Lock Hold Duration

Lock hold duration measures:

```text
Acquire
   ↓
Critical Section
   ↓
Release
```

If hold duration suddenly increases:

```text
5 ms
   ↓
2 sec
```

investigate work performed inside the critical section.

Possible causes:

```text
Slow database query

New downstream API call

Deployment change

Large data processing

External dependency latency
```

Longer hold duration directly increases waiting time for contenders.

---

# 99. Acquisition Wait Time

Acquisition wait time tells us:

> **How long contenders wait before getting the lock.**

Increasing wait time may mean:

```text
More contention
```

or:

```text
Longer lock hold duration
```

Therefore these metrics should be examined together:

```text
Request rate

Lock wait time

Lock hold duration
```

---

# 100. Lock Timeouts

A growing number of acquisition timeouts may indicate:

```text
hot lock

slow critical section

too many contenders

downstream bottleneck

incorrect lease/acquisition configuration
```

Timeouts protect callers from waiting forever, but high timeout rates are still a symptom worth investigating.

---

# 101. Renewal Failures

Suppose A attempts:

```text
renew lock
```

but the owner check fails.

A should assume:

```text
"I lost ownership."
```

A should not continue protected work merely because:

```text
"I owned it earlier."
```

Renewal failures therefore deserve monitoring.

They may indicate:

```text
lease too short

network delays

process pauses

lock contention

lock-store problems
```

---

# 102. Hot Lock Investigation

If one lock shows unusually high contention:

```text
lock:product:123
```

investigate:

```text
Why is this resource hot?

Can the critical section be shortened?

Can an atomic DB operation replace the lock?

Can idempotency remove the need for locking?

Can traffic be rate limited?

Can requests be queued?

Can the resource safely be partitioned?
```

Do not immediately:

```text
add more application servers
```

because the shared resource may still require serialization.

---

# 103. Critical vs Optional Lock Features

Not every distributed-lock implementation needs every advanced mechanism.

## Core Requirements

A basic correct design should think about:

```text
Atomic acquisition

Ownership

Lease / TTL

Owner-aware renewal

Owner-aware release

Acquisition timeout

Failure behavior
```

---

## Requirement-Dependent Features

Depending on the system, we may also need:

```text
Fencing tokens

Automatic lease renewal

Backoff + jitter

Fairness

Multiple-lock ordering

Dedicated coordination systems
```

For highly critical resources, fencing and stronger coordination guarantees become especially important.

---

# 104. When Fencing Is Especially Important

Fencing matters when:

```text
an old owner may continue operating
```

and the protected resource can enforce:

```text
reject stale token
```

Examples include:

```text
Database updates

File/storage writes

Job ownership

Resource mutation
```

If stale operations could cause serious corruption, lease expiration alone may not be enough.

---

# 105. Business Impact of Distributed Locks

Distributed locks can protect important business invariants.

Examples:

```text
Only one reconciliation job runs

Only one worker processes a critical resource

Prevent conflicting resource updates

Coordinate access to shared external systems
```

But they also introduce costs:

```text
Reduced concurrency

Additional infrastructure

Lock contention

Failure modes

Operational complexity

Potential availability loss
```

Therefore:

> **Distributed locks should protect a real business invariant, not be added casually.**

---

# 106. When NOT to Use a Distributed Lock

Before using a distributed lock, ask whether the invariant can be enforced with something simpler.

Prefer:

```text
Atomic database operation
```

when the DB can directly enforce the transition.

Prefer:

```text
UNIQUE constraint
```

when uniqueness is the requirement.

Prefer:

```text
Optimistic concurrency
```

when conflicts are relatively uncommon.

Prefer:

```text
Idempotency
```

when duplicate execution attempts are acceptable but duplicate effects are not.

Prefer:

```text
Transaction
```

when all operations fit inside one transactional boundary.

---

# 107. Distributed Lock vs Idempotency

Distributed lock:

```text
Prevent multiple contenders
from executing concurrently
```

Idempotency:

```text
Allow repeated attempts
but ensure one business effect
```

These solve different problems.

Example:

```text
Duplicate payment request
```

may be better handled using:

```text
idempotency key
```

than:

```text
distributed lock
```

if the business operation can safely be designed that way.

---

# 108. Distributed Lock vs Optimistic Concurrency

Distributed lock:

```text
Prevent conflict before work happens
```

Optimistic concurrency:

```text
Allow concurrent work
      ↓
detect conflict during update
```

Example:

```text
version = 5
```

Update succeeds only if:

```text
version still = 5
```

If another writer already changed it:

```text
update affects 0 rows
```

Conflict detected.

Optimistic concurrency is often attractive when contention is low.

---

# 109. Distributed Lock vs Atomic DB Operation

Suppose inventory must never become negative.

Instead of:

```text
Acquire distributed lock
      ↓
Read stock
      ↓
Update stock
      ↓
Release
```

the database may directly execute:

```sql
UPDATE inventory
SET stock = stock - 1
WHERE product_id = 123
  AND stock > 0;
```

This directly enforces the business invariant.

Rule:

> **Prefer the simplest mechanism that directly enforces correctness.**

---

# 110. Distributed Lock vs Queue

A queue can serialize or control work:

```text
Requests
   ↓
Queue
   ↓
Worker
```

This can reduce contention.

But queueing does not automatically increase throughput.

If the protected operation takes:

```text
5 seconds
```

the serialized throughput remains limited.

Queueing helps with:

```text
burst absorption

controlled processing

reduced contention
```

not magical parallelism.

---

# 111. Design Checklist

When considering a distributed lock, ask:

### Business Requirement

```text
What exactly must not happen concurrently?
```

### Resource

```text
What resource does the lock protect?
```

### Granularity

```text
Global lock?

Per user?

Per account?

Per product?
```

### Acquisition

```text
Is acquisition atomic?
```

### Ownership

```text
How do we identify the current owner?
```

### Lease

```text
What happens if the owner crashes?
```

### Renewal

```text
Can long-running work extend the lease safely?
```

### Stale Owner

```text
What happens if the old owner continues working?
```

### Fencing

```text
Can the protected resource reject stale owners?
```

### Release

```text
Is owner-check + release atomic?
```

### Contention

```text
What happens when thousands of contenders want the same lock?
```

### Waiting

```text
Fail fast?

Timeout?

Retry?
```

### Retry

```text
Do we need backoff and jitter?
```

### Multiple Locks

```text
Can deadlocks occur?

Is deterministic lock ordering used?
```

### Lock Store

```text
What consistency and failover guarantees does it provide?
```

### Alternatives

```text
Can DB constraints, atomic updates,
optimistic concurrency, transactions,
or idempotency solve this more simply?
```

---

# 112. Interview Failure Checklist

If asked to design a distributed lock, walk through:

```text
1. Two contenders acquire simultaneously

2. Owner crashes

3. Owner becomes slow or paused

4. Lease expires during work

5. Old owner resumes

6. Renewal fails

7. Release is delayed

8. Lock store becomes unavailable

9. Lock-store primary fails over

10. Thousands of contenders retry together

11. One resource becomes a hot lock

12. Operation requires multiple locks

13. Critical section partially completes before crash
```

A strong design should have an answer for each relevant failure mode.

---

# 113. Reconciliation Job Example

Requirement:

```text
Exactly one cluster instance
should generate the reconciliation report.
```

Suppose:

```text
20 application instances

Normal report time = 2 min

Worst case = 8 min
```

Naive design:

```text
Acquire lock
TTL = 5 min

Generate report

Release
```

Problems:

```text
Report may legitimately exceed TTL

No lease renewal

Old owner may continue after expiry

No fencing

Safe release unspecified

Retry behavior unspecified
```

Improved design:

```text
Atomic acquire

Lease with safe renewal

Owner-checked atomic release

Fencing token when protected resource supports it

Bounded acquisition timeout

Backoff / jitter under contention

Idempotent business processing where retries are possible
```

---

# 114. Distributed Lock Does Not Mean Exactly Once

This deserves repeating.

Distributed lock:

```text
prevents overlapping valid ownership
```

It does not guarantee:

```text
critical section completes exactly once
```

Example:

```text
A acquires

A performs half the workflow

A crashes

lease expires

B retries
```

Earlier effects from A may already exist.

Therefore:

```text
Distributed Lock
        +
Transaction / Idempotency
```

may be necessary depending on the business operation.

---

# 115. Core Engineering Principles

## Principle 1

> **Acquire atomically.**

Never use separate:

```text
check
then
acquire
```

operations without atomic protection.

---

## Principle 2

> **Use leases so dead owners cannot hold locks forever.**

---

## Principle 3

> **Renew only if you are still the owner.**

---

## Principle 4

> **Release only if you are still the owner.**

---

## Principle 5

> **Ownership check + state change must be atomic.**

---

## Principle 6

> **If you cannot prove ownership, fail closed.**

---

## Principle 7

> **Use fencing when stale owners can still affect the protected resource.**

---

## Principle 8

> **Keep critical sections short.**

Long critical sections increase contention and latency.

---

## Principle 9

> **Use bounded waiting, backoff, and jitter when contention is high.**

---

## Principle 10

> **Use deterministic lock ordering when multiple locks are required.**

---

## Principle 11

> **Do not confuse mutual exclusion with exactly-once business execution.**

---

## Principle 12

> **Prefer simpler correctness primitives when available.**

Consider:

```text
Atomic DB operations
Constraints
Optimistic concurrency
Transactions
Idempotency
```

before introducing a distributed lock.

---

# 116. 30-Second Interview Mental Model

Distributed Lock:

> Coordinate exclusive ownership across independent processes.

Basic record:

```text
lock_name
owner
expires_at
```

Acquire:

> Atomic check + ownership assignment.

Renew:

> Verify owner + extend lease atomically.

Release:

> Verify owner + release atomically.

Lease:

> Prevent dead owner from holding forever.

Stale Owner:

> Old holder continues after lease expires.

Fencing Token:

> Monotonically increasing ownership number used to reject stale operations.

Fail Closed:

> Cannot prove ownership → do not execute protected work.

Hot Lock:

> Many contenders serialize on one resource.

Backoff:

> Reduce aggressive retries.

Jitter:

> Prevent synchronized retries.

Deadlock:

> Multiple contenders wait on each other's locks.

Deterministic Ordering:

> Acquire multiple locks in the same global order.

Idempotency:

> Duplicate attempts → one business effect.

Optimistic Concurrency:

> Detect conflicting updates using a version check.

---

# 117. Final Mental Model

```text
              DISTRIBUTED CONTENDERS

        Server A
        Server B
        Server C
            │
            ▼
       SHARED LOCK STORE
            │
     ┌──────┴───────┐
     │              │
 lock_name        owner
 expires_at       fencing_token
     │
     ▼
CURRENT OWNER
     │
     ▼
CRITICAL SECTION
     │
     ▼
PROTECTED RESOURCE
```

Correctness requires:

```text
Atomic Acquire
      ↓
Exclusive Ownership
      ↓
Lease
      ↓
Safe Renewal
      ↓
Fencing if needed
      ↓
Safe Release
```

Under contention:

```text
Timeout
Backoff
Jitter
```

With multiple locks:

```text
Deterministic Ordering
```

Before using the lock:

```text
Can the invariant be enforced more simply?
```

---

# Distributed Locks — V1 Final Summary

Distributed locks solve:

```text
Multiple independent processes
        +
Shared resource
        +
Need for exclusive coordination
```

They are harder than local mutexes because distributed systems introduce:

```text
crashes
network delays
partitions
lease expiry
stale owners
replication/failover
contention
```

A robust mental model is:

```text
Acquire atomically

Use ownership

Use leases

Renew safely

Release safely

Fail closed when ownership is uncertain

Fence stale owners when necessary

Control contention

Prevent deadlocks

Monitor lock behavior

Prefer simpler primitives when possible
```

And the most important final rule is:

> **A distributed lock is a coordination mechanism, not a guarantee of exactly-once business execution. Use it only when exclusive coordination is truly required, and combine it with transactions, idempotency, fencing, or database guarantees when those solve additional correctness problems.**
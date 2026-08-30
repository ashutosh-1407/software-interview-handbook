# Distributed Locks — System Design Handbook

## Part 2 — Fencing Tokens, Database Locks, Redis Locks, and Failover

---

# 24. Why Leases Are Not Enough

In Part 1, we introduced leases:

```text
A acquires lock
TTL = 30 seconds
```

If A crashes:

```text
A crashes
    ↓
lease expires
    ↓
B can acquire
```

This prevents a dead process from holding the lock forever.

But leases introduce an important problem.

Suppose A does not crash.

Instead:

```text
A acquires lock
      ↓
starts work
      ↓
long pause / network delay
      ↓
lease expires
      ↓
B acquires lock
      ↓
A resumes
```

Now:

```text
A → stale owner
B → current owner
```

A may still continue interacting with the protected resource.

This is where:

> **Fencing tokens**

become useful.

---

# 25. Fencing Tokens

Every successful lock acquisition receives a monotonically increasing token.

Example:

```text
A acquires lock
→ fencing token = 41

A's lease expires

B acquires lock
→ fencing token = 42
```

The tokens establish ordering:

```text
41 < 42
```

Therefore:

```text
41 → older ownership
42 → newer ownership
```

When accessing the protected resource, the lock holder includes its fencing token.

```text
A → protected resource, token=41

B → protected resource, token=42
```

The protected resource remembers the newest token it has accepted.

---

# 26. How Fencing Protects the Resource

Consider:

```text
A acquires
token = 41

A pauses

lease expires

B acquires
token = 42
```

B performs its operation:

```text
B → Database
     token = 42
```

The database records:

```text
highest_token_seen = 42
```

Later stale A resumes:

```text
A → Database
     token = 41
```

The database checks:

```text
41 < 42
```

Therefore:

```text
REJECT A'S OPERATION
```

A is recognized as a stale owner.

---

# 27. Example — Stale Owner Overwrites New Data

Imagine the lock protects report generation.

```text
A acquires lock
token = 41

A starts calculating report

        ↓

A pauses
lease expires

        ↓

B acquires
token = 42

        ↓

B generates newer report
```

B writes:

```text
B → Report DB
token = 42

WRITE ACCEPTED
```

Then A wakes up and finishes its old calculation:

```text
A → Report DB
token = 41
```

Without fencing:

```text
B's newer report
      ↓
overwritten by A
      ↓
STALE DATA ❌
```

With fencing:

```text
highest token = 42

incoming token = 41

41 < 42

REJECT ❌
```

This prevents the stale owner from damaging the protected resource.

---

# 28. Lease vs Fencing Token

These solve different problems.

## Lease

Answers:

```text
How long may this owner hold the lock?
```

Useful when:

```text
owner crashes
      ↓
cannot release
      ↓
lease eventually expires
```

---

## Fencing Token

Answers:

```text
Is this operation coming from
an older or newer lock owner?
```

Useful when:

```text
old owner resumes
      ↓
tries to modify protected resource
      ↓
resource rejects stale token
```

Mental model:

```text
Lease
→ prevents permanent ownership

Fencing token
→ prevents stale ownership effects
```

Both can be used together.

---

# 29. Why a UUID Is Not Enough for Fencing

We could assign every acquisition a unique UUID:

```text
A → a8f1...
B → f31c...
```

This tells us:

```text
A's acquisition != B's acquisition
```

But it does not tell us:

```text
Which acquisition is newer?
```

Fencing requires ordering.

Therefore we want:

```text
41
42
43
44
...
```

Now the protected resource can easily determine:

```text
incoming token < highest accepted token
        ↓
stale request
        ↓
reject
```

Therefore:

> **A unique token identifies an acquisition. A monotonically increasing fencing token also establishes acquisition order.**

---

# 30. Unique Ownership Tokens vs Server Identity

A simple lock might initially store:

```text
owner = server-A
```

But server identity alone identifies only:

```text
WHO owns the lock?
```

It does not necessarily identify:

```text
WHICH acquisition does this operation belong to?
```

A server may acquire the same lock many times during its lifetime.

Conceptually:

```text
Server A

Acquisition 1 → token 41

later...

Acquisition 2 → token 57
```

The acquisition token distinguishes these ownership periods.

For fencing, monotonically increasing tokens additionally allow stale acquisitions to be ordered and rejected.

---

# 31. The Protected Resource Must Enforce Fencing

Generating fencing tokens at the lock store is not enough.

Suppose:

```text
A → token 41
B → token 42
```

If the protected database blindly accepts:

```text
UPDATE report ...
```

from both owners, fencing has achieved nothing.

The protected resource must enforce something conceptually equivalent to:

```text
IF incoming_token >= last_accepted_token
    accept operation
ELSE
    reject operation
```

Therefore:

> **Fencing only works when the protected resource participates in enforcing the fencing token.**

---

# 32. Database-Backed Distributed Locks

One way to implement a distributed lock is using a shared database.

Example table:

```text
locks

lock_name       owner       expires_at       fencing_token
-----------------------------------------------------------
daily_report    server-A    12:00:30         42
```

Application instances coordinate through the database:

```text
Server A ─┐
Server B ─┼──→ Database Lock Table
Server C ─┘
```

The database provides mechanisms such as:

```text
transactions
conditional updates
unique constraints
atomic writes
```

which can be used to implement lock operations safely.

---

# 33. Database Lock Acquisition

Conceptually:

```text
IF lock does not exist
OR lock has expired
THEN acquire
```

The check and state change must happen atomically.

After successful acquisition:

```text
lock_name = daily_report
owner = server-A
expires_at = now + lease
```

If fencing is used:

```text
fencing_token = previous_token + 1
```

Only one contender should successfully acquire the lock.

---

# 34. Database Lock Renewal

Renewal must verify ownership.

Conceptually:

```text
UPDATE locks
SET expires_at = new_expiry
WHERE lock_name = 'daily_report'
AND owner = 'server-A';
```

If the update affects:

```text
1 row
```

renewal succeeded.

If it affects:

```text
0 rows
```

A should assume:

```text
"I no longer own this lock."
```

---

# 35. Database Lock Release

Release also verifies ownership.

Conceptually:

```text
DELETE FROM locks
WHERE lock_name = 'daily_report'
AND owner = 'server-A';
```

This prevents a stale owner from deleting another owner's lock.

The ownership check and deletion must occur atomically.

---

# 36. Why Use a Database for Distributed Locks?

A database-backed lock can be attractive when:

```text
lock traffic is moderate
```

and:

```text
the application already depends on the database
```

Advantages include:

```text
Strong transactional primitives

Atomic conditional updates

No additional coordination infrastructure

Easy integration with existing data
```

For many simple system designs, a database-backed lock can be perfectly reasonable.

---

# 37. Database Lock Trade-Off

The database is usually already responsible for application data.

Adding lock operations introduces additional traffic:

```text
Application reads/writes
        +
Lock acquisition
Lock renewal
Lock release
```

At very high lock volumes, the database may become a coordination bottleneck.

This is one reason systems sometimes use a faster dedicated coordination mechanism.

---

# 38. Lock Store Consistency

Suppose the lock store has replicas.

Imagine:

```text
Replica 1 → says lock is FREE

Replica 2 → says lock is OWNED
```

If different contenders can independently act on these conflicting states:

```text
A → thinks it acquired

B → thinks it acquired
```

the lock's fundamental invariant is violated.

Therefore distributed lock ownership generally requires:

> **A strongly consistent view of ownership.**

Simply adding eventually consistent replicas is not sufficient.

---

# 39. Correctness vs Availability of the Lock Store

Suppose the lock store becomes unavailable.

Server B wants to acquire:

```text
lock:daily_report
```

but cannot determine whether A currently owns it.

Unsafe behavior:

```text
"I can't check the lock,
so I'll execute anyway."
```

This could produce:

```text
A executing
+
B executing
```

Safer behavior:

```text
Cannot establish ownership
        ↓
Do not acquire
        ↓
fail / wait / retry
```

For distributed locks:

> **Correctness generally takes priority over availability when exclusive ownership is required.**

---

# 40. Replication Does Not Automatically Make Locks Safe

Suppose we have:

```text
Primary
   ↓
Replica
```

A lock write occurs on the primary:

```text
A acquires lock
```

If replication is asynchronous, there may briefly be:

```text
Primary:
owner = A

Replica:
lock missing
```

Normally the primary remains authoritative.

But failures make this interesting.

---

# 41. Redis-Backed Distributed Locks

Redis is primarily an in-memory key-value store.

Conceptually:

```text
Key                         Value

user:123                    {...}

product:456                 {...}

lock:daily_report           server-A
```

Redis supports atomic operations and key expiration, making it useful for distributed locking.

A simplified Redis lock might be:

```text
SET lock:daily_report server-A NX EX 30
```

---

# 42. Understanding NX

`NX` means:

```text
Set the key only if
the key does not already exist.
```

Suppose:

```text
A ─┐
   ├──→ Redis
B ─┘
```

Both attempt:

```text
SET lock:report <owner> NX
```

Redis processes the operation atomically.

One succeeds:

```text
A → SUCCESS
```

The other fails:

```text
B → LOCK EXISTS
```

Therefore:

```text
NX
→ atomic exclusive acquisition
```

---

# 43. Understanding EX / TTL

`EX 30` means:

```text
Expire this key after 30 seconds.
```

Example:

```text
A acquires lock
      ↓
A crashes
      ↓
cannot release
      ↓
30 seconds
      ↓
Redis expires key
      ↓
B can acquire
```

Therefore:

```text
EX / TTL
→ prevents crashed owner
  from holding lock forever
```

Combined:

```text
SET lock:report server-A NX EX 30
```

provides:

```text
NX
→ acquire only if missing

EX
→ automatic lease expiration
```

---

# 44. Why Acquisition and TTL Must Be Atomic

This is unsafe:

```text
SET lock:report server-A NX

EXPIRE lock:report 30
```

because these are two operations.

Failure scenario:

```text
SET succeeds
      ↓
lock exists
      ↓
Server A crashes
      ↓
EXPIRE never executes
```

Now:

```text
lock exists
TTL = none
```

The lock may remain forever.

Therefore:

> **Lock creation and lease creation must happen atomically.**

This is why Redis can combine them:

```text
SET lock:report server-A NX EX 30
```

---

# 45. Safe Redis Release

Suppose:

```text
A acquires
TTL = 30 sec
```

A pauses.

Then:

```text
A's lease expires

B acquires

owner = B
```

A eventually resumes.

If A blindly executes:

```text
DEL lock:report
```

it deletes B's valid lock.

Therefore A must only delete the lock if it still owns it.

Conceptually:

```text
IF lock.owner == A
THEN delete
```

But this check and deletion must also be atomic.

---

# 46. Why GET + DEL Is Unsafe

This implementation is unsafe:

```text
1. GET lock
2. Check owner == A
3. DEL lock
```

Consider:

```text
A: GET
owner = A

      ↓

A pauses

      ↓

A's lease expires

      ↓

B acquires
owner = B

      ↓

A resumes

      ↓

A: DEL
```

A deletes B's lock.

Therefore:

```text
Check ownership
+
Delete
```

must happen as one atomic operation.

Redis implementations commonly use an atomic script or equivalent primitive for this.

---

# 47. Safe Redis Renewal

The same rule applies to renewal.

Unsafe:

```text
GET lock
      ↓
owner == A
      ↓
extend TTL
```

Ownership could change between operations.

Instead:

```text
IF owner == A
THEN extend TTL
```

must happen atomically.

Therefore the same lifecycle rule applies regardless of whether we use a database or Redis:

```text
Acquire → atomic

Renew → owner check + atomic update

Release → owner check + atomic delete
```

---

# 48. Database vs Redis — Mental Model

Both implement the same logical distributed-lock abstraction.

The difference is primarily the coordination store.

## Database-backed

```text
Application
     ↓
Database
     ↓
locks table
```

Uses:

```text
rows
transactions
conditional updates
```

---

## Redis-backed

```text
Application
     ↓
Redis
     ↓
lock key + TTL
```

Uses:

```text
keys
atomic commands
expiration
```

So:

> **Same distributed-lock idea, different coordination mechanism.**

---

# 49. When Redis Can Be Attractive

Redis can be useful when:

```text
lock operations are frequent

locks are short-lived

low lock-operation latency is desirable
```

Redis provides:

```text
fast in-memory operations

atomic commands

built-in TTL
```

But using Redis does not remove the distributed-systems correctness problems.

Its replication and failover behavior still matter.

---

# 50. Redis Primary/Replica Failure Scenario

Suppose:

```text
Application
     ↓
Redis Primary
     ↓
Redis Replica
```

A acquires:

```text
A → Primary

lock:report = A
```

But before this write reaches the replica:

```text
Primary crashes
```

The replica is promoted:

```text
Replica
   ↓
New Primary
```

But the new primary never received:

```text
lock:report = A
```

Therefore it believes:

```text
lock does not exist
```

B now attempts acquisition:

```text
B → New Primary

SET lock:report B NX
```

and succeeds.

---

# 51. Two Owners After Failover

Now:

```text
Server A

believes:
"I acquired the lock."
```

Meanwhile:

```text
Server B

new Redis primary says:
"You acquired the lock."
```

Potentially:

```text
A → critical section

B → critical section
```

The fundamental exclusivity guarantee has been violated.

This demonstrates an important lesson:

> **Replication alone does not guarantee distributed-lock correctness.**

The consistency and failover semantics of the coordination store matter.

---

# 52. Why Cache Consistency and Lock Consistency Differ

With ordinary cached application data, temporarily stale data may sometimes be acceptable.

For example:

```text
Product description slightly stale
```

might not break the business.

But stale lock ownership can produce:

```text
A believes it owns lock

B believes it owns lock
```

which directly violates the reason the lock exists.

Therefore lock ownership usually requires stronger consistency guarantees than ordinary cache data.

---

# 53. Strong Coordination Systems

When lock correctness is extremely important, systems designed specifically for strongly consistent coordination may be used.

Examples include:

```text
ZooKeeper
etcd
```

These systems are designed around stronger coordination guarantees.

Their deeper behavior connects to:

```text
Leader Election
Consensus
Raft
```

which are separate handbook topics.

For Distributed Locks V1, the important lesson is:

> **Choose a lock store whose consistency and failover guarantees match the correctness requirements of the lock.**

---

# 54. Part 2 Mental Model

We started Part 2 with the stale-owner problem:

```text
A owns lock
    ↓
A pauses
    ↓
lease expires
    ↓
B acquires
    ↓
A resumes
```

Lease alone cannot stop A from touching the protected resource.

Fencing adds:

```text
A → token 41

B → token 42
```

Protected resource:

```text
highest accepted = 42

incoming = 41

REJECT
```

Then we examined two coordination stores:

```text
Database
→ rows + transactions + conditional updates

Redis
→ keys + atomic commands + TTL
```

Regardless of implementation:

```text
Acquire
→ atomic

Renew
→ verify owner + atomic

Release
→ verify owner + atomic
```

And regardless of the store:

```text
Replication/failover must not allow
multiple valid owners.
```

---

# Part 2 Summary

A lease solves:

```text
Owner crashes
      ↓
lock eventually expires
```

but does not fully solve:

```text
Old owner continues executing
after losing ownership
```

Fencing tokens address this by assigning monotonically increasing ownership numbers:

```text
41 → old owner
42 → newer owner
```

The protected resource rejects stale operations.

Database-backed and Redis-backed locks implement the same conceptual abstraction using different primitives.

Database:

```text
locks table
transactions
conditional updates
```

Redis:

```text
key
NX
TTL
atomic operations
```

In both cases:

```text
Acquire must be atomic

Renew must verify ownership atomically

Release must verify ownership atomically
```

Finally, the coordination store itself is part of the correctness model.

A replication/failover strategy that loses lock state can result in:

```text
A thinks it owns lock
+
B thinks it owns lock
```

Therefore:

> **Distributed-lock correctness depends not only on the lock algorithm, but also on the consistency and failover guarantees of the system storing the lock.**

Part 3 moves from lock mechanics into design decisions:

```text
Lock granularity
Contention and hot locks
Acquisition timeout
Backoff and jitter
Deadlocks and deterministic ordering
Idempotency and atomic DB operations
When NOT to use a distributed lock
```
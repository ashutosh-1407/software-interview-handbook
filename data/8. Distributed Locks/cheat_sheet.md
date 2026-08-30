# Distributed Locks — Interview Cheat Sheet

## 1. Why Distributed Locks?

Use when **multiple independent processes/servers need exclusive access to a shared resource or operation**.

```text
Server A ─┐
Server B ─┼──→ Shared Lock Store ─→ Critical Section
Server C ─┘
```

Goal:

> **Only one valid lock holder should execute the protected critical section at a time.**

A local mutex is insufficient because different servers/processes do not share memory.

---

## 2. Basic Lock Model

```text
lock_name
owner
expires_at
fencing_token   // when needed
```

Lifecycle:

```text
Acquire → Execute → Renew if needed → Release
```

---

## 3. Atomicity — VERY IMPORTANT

### Acquire

Must atomically:

```text
IF lock missing/expired
THEN acquire
```

Never:

```text
CHECK lock
↓
SET lock
```

as separate operations → race condition.

### Renew

Atomically:

```text
IF owner == me
THEN extend lease
```

### Release

Atomically:

```text
IF owner == me
THEN release
```

> **Acquire, renew, and release must perform their required checks + state changes atomically.**

---

## 4. Lease / TTL

Problem:

```text
A acquires
↓
A crashes
↓
never releases
```

Solution:

```text
Lock expires automatically after TTL
```

Example:

```text
TTL = 30 sec
```

> **Lease prevents a crashed owner from holding the lock forever.**

For long-running work:

```text
periodically renew lease
```

but renew **only if still owner**.

---

## 5. Stale Owner

Important failure:

```text
A acquires
↓
A pauses / network delay / GC stall
↓
A's lease expires
↓
B acquires
↓
A resumes ❌
```

Now:

```text
A = stale owner
B = current owner
```

A may still try to modify the protected resource.

---

## 6. Fencing Tokens

Each successful acquisition gets a **monotonically increasing token**:

```text
A → token 41
B → token 42
C → token 43
```

Protected resource remembers newest accepted token.

```text
B writes token 42 → ACCEPT

Later A writes token 41

41 < 42 → REJECT
```

> **Lease handles dead owners; fencing protects against stale owners.**

Why not UUID?

```text
UUID → unique, but no ordering
Fencing token → unique acquisition + ordering
```

Fencing works only if the **protected resource enforces the token**.

---

## 7. Fail Closed

If A cannot reach the lock store:

```text
"Do I still own the lock?"
→ UNKNOWN
```

Do NOT:

```text
"I'll execute anyway."
```

Instead:

```text
Cannot prove ownership
→ stop protected work
```

> **For exclusive ownership, uncertainty should favor correctness over availability.**

---

## 8. Database-Backed Lock

Example:

```text
lock_name | owner | expires_at | fencing_token
```

Uses:

```text
transactions
conditional updates
atomic operations
```

Good when:

```text
moderate lock traffic
existing DB can handle coordination
```

Trade-off:

```text
lock traffic adds load to DB
```

---

## 9. Redis-Backed Lock

Redis = in-memory key-value store.

Typical acquisition:

```text
SET lock:report <owner> NX EX 30
```

Meaning:

```text
NX → only set if lock doesn't exist
EX → TTL / lease
```

Both must happen atomically.

Bad:

```text
SET lock NX
↓
process crashes
↓
EXPIRE never executes
↓
lock lives forever ❌
```

---

## 10. Safe Redis Release

Never blindly:

```text
DEL lock
```

Old owner could delete a new owner's lock.

Also unsafe:

```text
GET owner
↓
owner == me
↓
DEL
```

Ownership could change between GET and DEL.

Correct concept:

```text
IF owner == me
THEN delete
```

**atomically**.

Same principle for renewal.

---

## 11. Replication / Failover Risk

```text
A acquires on Primary
↓
Primary crashes before replication
↓
Replica promoted
↓
Replica doesn't know A owns lock
↓
B acquires
```

Now potentially:

```text
A executing
+
B executing ❌
```

> **Replication alone does not make a distributed lock safe. Lock-store consistency/failover semantics matter.**

Lock ownership generally requires a strongly consistent view.

---

## 12. Lock Granularity

Coarse:

```text
lock:inventory
```

Simple, but all products serialize.

Fine:

```text
lock:inventory:123
lock:inventory:456
```

Better concurrency, more coordination complexity.

> **Lock the smallest business-resource boundary that actually requires mutual exclusion.**

---

## 13. Hot Locks / Contention

```text
10,000 requests
       ↓
lock:product:123
       ↓
ONE critical section
```

Adding servers does NOT solve it:

```text
More servers
→ more contenders
→ same serialization point
```

Possible mitigations:

```text
shorten critical section
rate limiting
controlled queueing
atomic DB operation
idempotency
partitioning when business semantics allow
```

Queueing controls contention/bursts; it **does not inherently increase serialized throughput**.

---

## 14. Timeout, Backoff, Jitter

### Timeout

```text
How long am I willing to wait?
```

Prevents indefinite waiting.

### Backoff

```text
How aggressively should I retry?
```

Prevents hammering lock store.

### Jitter

```text
Randomize retry timing
```

Prevents all contenders retrying simultaneously.

```text
1000 fail
↓
all retry together
↓
thundering herd ❌
```

---

## 15. Multiple Locks & Deadlock

Danger:

```text
P1: lock A → waits for B

P2: lock B → waits for A

DEADLOCK
```

Solution:

> **Deterministic lock ordering**

Example:

```text
Transfer 17 → 91
Transfer 91 → 17
```

Both acquire:

```text
lock 17
↓
lock 91
```

Business direction does NOT determine lock order.

```text
Transfer 91 → 17

Lock order: 17 → 91
Business operation: 91 → 17
```

---

## 16. Distributed Lock ≠ Exactly Once

```text
A acquires
↓
does 70% of work
↓
crashes
↓
lease expires
↓
B retries
```

Some of A's effects may already exist.

> **Lock prevents overlapping execution; it does NOT guarantee exactly-once business execution.**

Use where appropriate:

```text
Transactions
Idempotency
```

---

## 17. Before Using a Distributed Lock

Always ask whether something simpler works.

### Unique constraint

```text
UNIQUE(username)
```

Better than:

```text
lock:username:<username>
```

### Atomic DB operation

```sql
UPDATE inventory
SET stock = stock - 1
WHERE product_id = 123
AND stock > 0;
```

May eliminate application-level lock.

### Optimistic concurrency

```text
Read version = 5

UPDATE ...
WHERE version = 5
```

If 0 rows updated:

```text
someone changed it → conflict
```

Good when conflicts are relatively rare.

### Idempotency

```text
Duplicate attempts
→ one business effect
```

---

## 18. Production Metrics

Watch:

```text
Acquisition wait time
Lock hold duration
Acquisition timeout rate
Renewal failures
Acquisition failures
Hot lock names
Fencing rejections
```

If wait time jumps:

```text
Critical section became slower?

OR

More contenders for same lock?
```

Check:

```text
request rate
+
lock wait time
+
lock hold duration
```

---

# Failure Scenarios to Remember

```text
Owner crashes
→ lease expires

Owner pauses beyond TTL
→ stale owner risk

Old owner resumes
→ fencing protects resource

Cannot verify ownership
→ fail closed

Delayed release
→ owner-check + atomic release

Delayed renewal
→ owner-check + atomic renewal

Lock store unavailable
→ don't assume ownership

Primary fails before replication
→ possible double ownership

Huge contention
→ timeout + backoff + jitter

Multiple locks
→ deterministic ordering

Crash after partial business work
→ transaction / idempotency
```

---

# 60-Second Interview Answer

If asked **"How would you design a distributed lock?"**:

> I would use a strongly consistent shared coordination store and make acquisition atomic. Each acquisition has an owner and a lease so crashed owners don't hold the lock forever. Renewal and release must verify ownership and perform the check and update atomically. For operations where stale owners could still affect the protected resource, I'd use monotonically increasing fencing tokens and have the resource reject older tokens. I'd use bounded acquisition time with backoff and jitter under contention, deterministic ordering when multiple locks are needed, and monitor lock wait/hold times and renewal failures. Before introducing the lock, I'd check whether an atomic DB operation, constraint, optimistic concurrency, transaction, or idempotency can enforce the invariant more simply.

---

# Final Memory Map

```text
DISTRIBUTED LOCK

Atomic Acquire
      ↓
Owner
      ↓
Lease / TTL
      ↓
Safe Renewal
      ↓
Critical Section
      ↓
Fencing if stale-owner risk
      ↓
Safe Release

Contention
→ Timeout + Backoff + Jitter

Multiple Locks
→ Deterministic Ordering

Uncertain Ownership
→ Fail Closed

Partial Business Execution
→ Transaction / Idempotency

Before Locking
→ DB Atomicity / Constraint / OCC / Idempotency?
```

> **Golden rule:** Use a distributed lock only when you genuinely need exclusive coordination across independent processes. Prefer a simpler primitive when it can directly enforce the business invariant.
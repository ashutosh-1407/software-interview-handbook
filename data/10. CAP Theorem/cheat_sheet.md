# CAP Theorem — Interview Cheat Sheet

## 1. Core Rule

```text
CAP:

C → Consistency
A → Availability
P → Partition Tolerance
```

During a **network partition**:

```text
Cannot guarantee both:

Strong Consistency + Availability
```

Since partitions cannot realistically be prevented:

```text
During P → choose C or A
```

---

## 2. CP vs AP

```text
CP
→ Preserve strong consistency
→ Reject/defer requests if safe coordination is impossible
→ Sacrifice availability

AP
→ Preserve availability
→ Continue serving locally
→ Allow temporary stale/divergent data
→ Reconcile later
```

Memory:

```text
Reject during partition → CP
Continue despite divergence → AP
```

---

## 3. CAP Consistency

CAP C means clients observe a single, up-to-date logical view.

```text
WRITE x = 200
→ success

READ x
→ 200
```

Not:

```text
READ x
→ 100   ❌ stale
```

---

## 4. CAP Availability

Availability means a non-failing node continues responding to requests.

```text
Business rejection
!=
CAP unavailability
```

Example:

```text
400 Insufficient Funds
```

is still a valid response.

But:

```text
Cannot serve because quorum unavailable
```

means availability is being sacrificed.

---

## 5. Classic Examples

```text
Bank balance
→ consistency critical
→ CP

Last-item inventory
→ consistency critical
→ CP

Likes / views
→ temporary staleness acceptable
→ AP

Analytics
→ temporary divergence acceptable
→ AP
```

Do not classify the whole application.

```text
Choose guarantees per operation/data domain.
```

---

## 6. Quorums

```text
N = total replicas
W = write quorum
R = read quorum
```

Example:

```text
N=5
W=3
R=3
```

If:

```text
W + R > N
```

read and write quorums overlap.

But:

```text
Quorum overlap
!=
automatic linearizability
```

You still need:

```text
Version/order semantics
Leader authority
Consensus
etc.
```

---

## 7. Quorum During Partition

```text
N=5, W=3

A,B       X       C,D,E
```

Then:

```text
C,D,E → can write
A,B   → cannot obtain quorum
```

If A,B reject:

```text
Consistency preserved
Availability sacrificed
→ CP
```

---

## 8. PACELC

CAP:

```text
Partition
→ Availability vs Consistency
```

PACELC:

```text
If Partition:
    A vs C

Else:
    Latency vs C
```

Examples:

```text
Bank balance
→ C > Latency

Video views
→ Latency > immediate C
```

Memory:

```text
CAP    → failure-time trade-off
PACELC → also normal-operation trade-off
```

---

## 9. Eventual Consistency

Replicas may temporarily differ:

```text
US = 101
EU = 100
```

but eventually converge:

```text
US = 101
EU = 101
```

AP does **not** mean:

```text
Always inconsistent
```

It means strong consistency may be sacrificed during a partition.

---

## 10. AP Conflict Resolution

If both partitions accept writes:

```text
US → 200
EU → 300
```

after recovery the system must reconcile.

Possible approaches:

```text
Last-Write-Wins
Version numbers
Vector clocks
CRDTs
Application-specific merge
```

Be careful with timestamps:

```text
Distributed clocks may not be perfectly synchronized.
```

And LWW may lose valid updates.

---

## 11. Read-Your-Own-Writes

User writes:

```text
version 42
```

Next read should not hit a replica at:

```text
version 40
```

Solutions:

```text
Temporarily read from leader

or

Store:
last_seen_version = 42

Require:
replica_version >= 42
```

---

## 12. Monotonic Reads

Once a user sees:

```text
version 42
```

they should never later see:

```text
version 40
```

Memory:

```text
Read-your-own-writes
→ see your latest write

Monotonic reads
→ don't go backward
```

---

## 13. CAP C vs ACID C

```text
CAP Consistency
→ consistent client view across distributed replicas

ACID Consistency
→ transaction preserves DB constraints/invariants
```

Memory:

```text
CAP C  → distributed copies
ACID C → database invariants
```

---

## 14. Last-Item Inventory Trap

```text
US inventory = 1
EU inventory = 1

        X
   partition
```

Two different customers buy simultaneously.

You cannot guarantee both:

```text
Both regions always writable
+
Never oversell globally
```

### Idempotency does NOT solve this

```text
Customer A request
!=
Customer B request
```

Idempotency solves:

```text
same logical request retried
```

not independent conflicting writes.

---

## 15. Inventory Solutions

### Favor Consistency

```text
Single authority / quorum
→ one side sells
→ other rejects/defer
```

### Favor Availability

```text
Both accept
→ reconcile later
→ possible refund/cancellation
```

### Pre-Allocate

```text
Total = 10

US = 6
EU = 4
```

Each region independently sells its allocation.

Trade-off:

```text
Local availability ↑
Global flexibility ↓
```

---

## 16. Stranded Inventory

```text
US owns 6
EU owns 4

Demand:
US = 8
EU = 2
```

After sales:

```text
US → 0 inventory + 2 unmet customers
EU → 2 unused inventory
```

Those EU units are **stranded** because US cannot safely claim them during the partition.

---

## 17. Local ACK / Queue Writes

```text
Partition

US → accept + ACK
EU → accept + ACK
```

Then reconcile later.

This is:

```text
AP-style
```

Risk:

```text
Conflict discovered after user was told SUCCESS
```

May require:

```text
Cancellation
Refund
Compensation
```

Sometimes use:

```text
PENDING
```

instead of prematurely returning:

```text
CONFIRMED
```

---

## 18. Safety vs Liveness

```text
Safety
→ nothing incorrect happens

Liveness
→ system continues making progress
```

Rough intuition:

```text
CP → safety bias
AP → liveness bias
```

---

## 19. Graceful Degradation

During inventory failure:

```text
Catalog ✅
Reviews ✅
Recommendations ✅
Exact Inventory ⚠️
Checkout ⚠️
```

Do not take down unrelated functionality.

Principle:

```text
Strong consistency only where the invariant requires it.
```

---

## 20. Replicas

Even if critical reads go to the leader:

```text
WRITE → Leader

Latest READ → Leader

Stale-tolerant READ → Replicas
```

replicas still provide:

```text
Failover
Fault tolerance
Read scaling
Analytics/reporting
DR support
```

Strong consistency does **not** require waiting for every replica.

---

## 21. Fault Tolerance vs DR

```text
Fault Tolerance
→ continue operating through component failures

Disaster Recovery
→ recover from major environment/region failure
```

DR may involve:

```text
Cross-region copies
Backups
RPO / RTO
Failover procedures
```

---

## 22. Monitoring

Watch:

```text
Replication lag
Quorum failures
Leader changes
Request timeouts
Cross-region latency
Conflict rate
Reconciliation backlog
```

CP-specific:

```text
Write rejection rate
Time without quorum
```

AP-specific:

```text
Conflict rate
Merge failures
Compensation rate
Repair backlog
```

---

# 23. Interview Traps

```text
❌ CAP = pick any 2 of 3

✅ During a partition → C vs A
```

```text
❌ AP = always inconsistent

✅ AP accepts possible divergence during partition
```

```text
❌ CP = always unavailable

✅ CP sacrifices availability when safe coordination is impossible
```

```text
❌ W + R > N = automatic linearizability

✅ It guarantees overlap; ordering/version semantics still matter
```

```text
❌ Idempotency solves conflicting regional writes

✅ It solves duplicate processing of the same logical request
```

```text
❌ CAP C = ACID C

✅ They describe different guarantees
```

---

# 24. 30-Second Interview Answer

> CAP says that during a network partition, a distributed system cannot guarantee both strong consistency and availability. Since partitions cannot be ruled out, the practical choice is C vs A. For correctness-critical operations like money movement or last-item inventory, I would usually require quorum or authority and reject unsafe requests, giving CP behavior. For likes, views, or analytics, I would keep serving, tolerate temporary divergence, and reconcile later, giving AP behavior. I would make this choice per operation rather than labeling the entire application CP or AP.

---

# 25. Final Memory Map

```text
                 PARTITION
                     |
              ---------------
              |             |
              C             A
              |             |
             CP            AP
              |             |
         Reject/defer   Keep serving
                            |
                       Divergence
                            |
                       Reconcile
```

For every design:

```text
1. What invariant must never break?

2. Can stale data be tolerated?

3. Can both sides accept writes?

4. Do we need quorum/authority?

5. Can conflicts be reconciled?

6. Can the business compensate?

7. What remains available?

8. What happens after recovery?
```

## One-Line Memory

```text
CAP:
During a partition, choose between
strong consistency and availability;
make the choice based on the invariant of each operation.
```
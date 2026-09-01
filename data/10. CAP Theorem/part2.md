# CAP Theorem — Part 2
## Quorums, PACELC, Session Guarantees, and Practical Design

---

## 1. Quorum Basics

Suppose a distributed database has:

```text
N = total replicas
W = replicas required for a successful write
R = replicas consulted for a read
```

Example:

```text
N = 5
W = 3
R = 3
```

The important relationship is:

```text
W + R > N
```

Here:

```text
3 + 3 > 5
```

This guarantees that the read quorum and write quorum overlap on at least one replica.

---

# 2. Why Quorum Overlap Helps

Suppose:

```text
Replicas = A, B, C, D, E
```

A successful write reaches:

```text
A, C, E
```

A read of three replicas must overlap with that set.

Example:

```text
Read A, B, D
→ overlaps at A

Read B, C, D
→ overlaps at C

Read B, D, E
→ overlaps at E
```

So:

> **If `W + R > N`, every read quorum overlaps the successful write quorum.**

This increases the chance that the latest committed value is observed.

---

# 3. Quorum Overlap Is Not Enough by Itself

A common mistake is:

```text
W + R > N
=
automatic strong consistency
```

Not necessarily.

Suppose a read gets:

```text
A → version 42
B → version 40
C → version 41
```

The system still needs to know:

```text
Which version is authoritative/latest?
```

That may require:

- version numbers,
- sequence numbers,
- leader ordering,
- timestamps,
- consensus semantics.

So:

> **Quorum overlap is an important ingredient, but not the complete consistency mechanism.**

---

# 4. Read vs Write Quorum Trade-Off

Consider:

```text
N = 5
```

### Design A

```text
W = 3
R = 3
```

Writes can succeed even if two replicas are unavailable.

```text
2 nodes fail
→ 3 remain
→ write can still succeed
```

This gives relatively good **write availability**.

But reads require coordination across three replicas.

---

### Design B

```text
W = 5
R = 1
```

Reads can be very fast because only one replica is contacted.

But every write must reach all five replicas.

Therefore:

```text
1 replica unavailable
→ write may fail
```

So:

```text
Higher W
→ more expensive / less available writes

Higher R
→ more expensive reads
```

---

# 5. Quorum During a Partition

Suppose:

```text
N = 5
W = 3
```

Partition:

```text
A, B       X       C, D, E
```

Left side:

```text
2 nodes
```

Right side:

```text
3 nodes
```

Therefore:

```text
C,D,E → can accept writes
A,B   → cannot satisfy W=3
```

The A,B side must reject the write.

That means:

```text
Consistency preserved
Availability sacrificed
→ CP-style behavior
```

Easy rule:

> **Reject because safe coordination is unavailable → CP**

---

# 6. AP Alternative

If both sides accept writes independently:

```text
A,B                 C,D,E

100        X        100
```

Left:

```text
WRITE 200
```

Right:

```text
WRITE 300
```

Now:

```text
A,B = 200      X      C,D,E = 300
```

The system preserved availability but allowed divergence.

When connectivity returns:

```text
200 <--------> 300
```

the system must reconcile the conflict.

That is **AP-style behavior**.

---

# 7. CAP vs PACELC

CAP focuses on:

```text
Network partition
→ Consistency vs Availability
```

But most of the time there is no partition.

Even then, distributed systems still choose between:

```text
Wait for replicas
→ stronger consistency
→ higher latency

Respond quickly
→ lower latency
→ possible temporary staleness
```

This is where **PACELC** helps.

---

# 8. PACELC

Memory model:

```text
If Partition:
    Availability vs Consistency

Else:
    Latency vs Consistency
```

Or simply:

```text
P → A or C
Else → L or C
```

So:

> **CAP explains the partition-time trade-off. PACELC also explains the normal-operation latency vs consistency trade-off.**

---

# 9. PACELC Example — Banking

Suppose:

```text
System A
→ waits for replication
→ 100 ms
→ stronger consistency
```

System B:

```text
→ responds locally
→ 10 ms
→ replicas catch up asynchronously
```

For:

```text
Bank balance after a transfer
```

we may prefer:

```text
Consistency > Latency
```

because showing stale financial state can be problematic.

---

# 10. PACELC Example — Video Views

For a video:

```text
Actual views = 1,000,004
Displayed    = 1,000,000
```

A few seconds of staleness may be acceptable.

So during normal operation:

```text
Lower Latency
>
Immediate Strong Consistency
```

This is:

```text
Latency vs Consistency
```

not:

```text
Availability vs Consistency
```

because no network partition is involved.

---

# 11. Different Operations Can Make Different Choices

Consider an e-commerce system:

```text
Product Catalog
Reviews
Inventory
Checkout
```

During a partition:

```text
Catalog
→ remain available
→ stale data usually acceptable

Reviews
→ remain available
→ eventual consistency acceptable

Exact Inventory
→ correctness more important

Last Item Checkout
→ strict consistency required
```

Therefore:

> **CAP decisions can often be made at the operation or data-domain level.**

Do not unnecessarily make the whole application unavailable.

---

# 12. Graceful Degradation

Suppose exact inventory cannot be verified.

Instead of:

```text
Product page unavailable
```

show:

```text
Product ✅
Price ✅
Reviews ✅
Images ✅

Inventory:
"Availability temporarily unknown"
```

Only the correctness-sensitive feature is degraded.

Principle:

> **Failure of one strong guarantee should not automatically disable unrelated functionality.**

---

# 13. Stale Data After the Partition Heals

Suppose:

```text
Primary A = 500
Replica B = 450
```

The network is healthy again, but B is still catching up.

A user reads from B:

```text
450
```

This is no longer primarily a CAP issue.

It is now:

```text
Replication lag
+
Consistency model
```

The stale value exists because asynchronous replication has not caught up yet.

---

# 14. Eventual Consistency vs Staleness

These are related but different.

### Eventual consistency

A system guarantee:

> If writes stop and communication remains healthy, replicas eventually converge.

### Staleness

What the user may observe:

```text
Actual = 101
Read   = 100
```

So:

```text
Eventual consistency
→ consistency model

Stale read
→ possible observable effect
```

---

# 15. Read-Your-Own-Writes

Suppose a user changes:

```text
Ashutosh → Ash
```

The write succeeds on the leader.

Immediately afterward:

```text
READ → lagging replica
```

returns:

```text
Ashutosh
```

This feels incorrect to the user.

We can provide **read-your-own-writes consistency** without requiring every read in the entire system to be strongly consistent.

---

# 16. Implementing Read-Your-Own-Writes

One approach:

```text
WRITE → Leader A
```

After success:

```text
same user's next reads
→ Leader A
```

until replicas catch up.

Another approach uses versions.

```text
Write commits version 42
```

Session stores:

```text
last_seen_version = 42
```

A replica may serve the next request only if:

```text
replica_version >= 42
```

Otherwise:

```text
wait
or
route to leader
```

---

# 17. Monotonic Reads

Another session guarantee:

> Once a user has observed a newer version, they should not later observe an older one.

Bad example:

```text
10:00 → 500
10:01 → 550
10:02 → 500   ❌
```

This can happen when reads move between replicas with different lag.

Tracking:

```text
last_seen_version
```

can prevent this.

If the user has seen:

```text
version 42
```

a replica at:

```text
version 40
```

should not serve that request.

This is **monotonic reads**.

---

# 18. CAP Consistency vs ACID Consistency

These are not the same.

### CAP Consistency

Concerns what clients observe across distributed copies.

```text
WRITE x = 10
→ success

Later READ
→ 10
```

### ACID Consistency

Concerns database invariants and valid states.

For example:

```text
balance >= 0
```

or:

```text
order.user_id must reference a valid user
```

Memory trick:

```text
CAP C
→ consistent distributed view

ACID C
→ valid database state / invariants
```

---

# 19. The Last Inventory Item Problem

Suppose:

```text
US                    EU

Inventory = 1    X    Inventory = 1
```

Two different customers simultaneously buy the item.

Business asks for:

```text
1. Both regions must remain writable.

2. Never sell the last item twice.
```

During the partition:

```text
US cannot ask EU.
EU cannot ask US.
```

Both can independently execute:

```text
if quantity > 0:
    quantity -= 1
    create_order()
```

and both may succeed.

So the two requirements conflict unless we change the design.

---

# 20. Why Idempotency Does Not Solve This

Idempotency protects against:

```text
same request
processed multiple times
```

For example:

```text
Order ABC
retry
retry

→ still create one order
```

But:

```text
Customer A request
!=
Customer B request
```

These are two independent legitimate operations.

So idempotency does not prevent both regions from selling the same global unit.

---

# 21. Option 1 — Favor Consistency

Use:

```text
single authority
or
quorum
```

Only the side with valid authority can sell the item.

Other side:

```text
reject
defer
or queue
```

This chooses:

```text
Consistency > Availability
```

---

# 22. Option 2 — Favor Availability

Both regions accept orders:

```text
US → accepted
EU → accepted
```

After reconciliation, the system discovers the oversell.

One customer may require:

- cancellation,
- refund,
- compensation.

This chooses:

```text
Availability > Strong Consistency
```

The business must accept reconciliation risk.

---

# 23. Option 3 — Pre-Allocate Inventory

Suppose:

```text
Global inventory = 10

US = 6
EU = 4
```

Each region can sell only from its own allocation.

```text
US sales <= 6
EU sales <= 4
```

This allows each region to operate independently during a partition.

---

# 24. Stranded Inventory

Suppose demand becomes:

```text
US demand = 8
EU demand = 2
```

US sells all 6.

EU sells only 2 of its 4.

Now:

```text
US:
0 available
2 customers still waiting

EU:
2 unused units
```

Globally inventory still exists, but US cannot safely use EU's allocation while disconnected.

Those units are temporarily **stranded**.

Trade-off:

```text
Pre-allocation
→ better local independence
→ less global flexibility
```

---

# 25. Local Acknowledgement in AP Systems

Suppose during a partition:

```text
US                     EU

Write A ✅      X      Write B ✅
ACK user               ACK user
```

Both sides acknowledge success and reconcile later.

This is AP-style behavior:

```text
Availability preserved
Strong consistency sacrificed
```

The danger is that reconciliation may later determine the two operations conflict.

---

# 26. Business Compensation

Once the user has received:

```text
SUCCESS
```

the system has created a business expectation.

If later reconciliation invalidates the operation, the system may need:

```text
refund
cancellation
compensation
manual resolution
```

So:

> **AP reconciliation can turn a technical consistency conflict into a business workflow problem.**

This matters especially for:

- payments,
- reservations,
- inventory,
- seat booking,
- uniqueness constraints.

---

# 27. Avoid Oversimplifying Databases as CP or AP

Statements like:

```text
"Database X is AP."
```

can be misleading.

The same database may offer:

- strong reads,
- eventual reads,
- configurable quorums,
- leader-based operations,
- different regional modes.

For example:

```text
N=5, W=5, R=1
```

behaves very differently from:

```text
N=5, W=1, R=1
```

Better question:

> **What guarantee does this operation and configuration provide, especially during a partition?**

---

# 28. Common Interview Traps

### Trap 1

```text
CAP = pick any 2 of 3
```

Better:

> Once a partition occurs, the meaningful choice is C vs A.

### Trap 2

```text
AP = always inconsistent
```

Wrong.

AP describes partition behavior.

### Trap 3

```text
CP = normally unavailable
```

Wrong.

The system may provide both C and A when healthy.

### Trap 4

```text
W + R > N
= automatic linearizability
```

Too simplistic.

Correct version/order semantics are still needed.

### Trap 5

```text
CAP C = ACID C
```

Wrong.

They describe different guarantees.

### Trap 6

```text
Idempotency solves conflicting regional writes
```

Not when the writes come from different legitimate requests.

---

# 29. Practical Decision Framework

For each important operation, ask:

```text
1. What invariant must never be violated?

2. What happens if the value is stale?

3. Can both partitions safely accept writes?

4. Can conflicts be reconciled later?

5. Can the business compensate for a conflict?

6. Is temporary unavailability acceptable?

7. Is lower latency worth weaker consistency?

8. Can session-level consistency be enough?

9. Can ownership or pre-allocation reduce coordination?
```

These questions are more useful than simply asking:

```text
CP or AP?
```

---

# 30. CAP + PACELC Mental Model

```text
                 DISTRIBUTED SYSTEM
                        |
            ------------------------
            |                      |
            v                      v
        Partition?             No Partition
            |                      |
            v                      v
         CAP trade-off          PACELC
            |                      |
       C <------> A           C <------> L
            |
      ----------------
      |              |
      v              v
 Coordinate       Continue locally
      |              |
      v              v
Safer state       Divergence
                     |
                     v
               Reconciliation
```

And when global strong consistency is unnecessary:

```text
Use session guarantees:

Read-your-own-writes
Monotonic reads
```

---

# 31. Interview Questions — Part 2

### Q1. Why does `W + R > N` matter?

It guarantees read/write quorum overlap.

### Q2. Does overlap alone guarantee linearizability?

No. Correct version/order semantics are also required.

### Q3. What does PACELC add?

It adds the normal-operation **latency vs consistency** trade-off.

### Q4. Can different features make different CAP choices?

Yes. The choice can be operation-specific.

### Q5. What is read-your-own-writes?

After a successful write, the same user/session sees that write in subsequent reads.

### Q6. What are monotonic reads?

Once a newer version is observed, the user should not later see an older version.

### Q7. Why doesn't idempotency solve the last-item problem?

Because the competing purchases are different valid requests, not duplicate retries.

### Q8. Why use pre-allocation?

It converts a global invariant into smaller local ownership limits.

### Q9. What is stranded inventory?

Inventory exists globally but cannot be used by another region because ownership cannot be safely transferred during a partition.

### Q10. What is the risk of locally acknowledging AP writes?

Later reconciliation may require cancellation or compensation.

---

# 32. Key Takeaways

1. Quorum systems commonly use:

```text
N = total replicas
W = write quorum
R = read quorum
```

2. `W + R > N` guarantees **read/write overlap**.

3. Overlap alone does not automatically guarantee full strong consistency.

4. Quorum sizes trade read cost, write cost, and failure tolerance.

5. **CAP** focuses on partitions:

```text
C vs A
```

6. **PACELC** adds normal-operation:

```text
C vs Latency
```

7. Different operations may require different consistency guarantees.

8. Use **graceful degradation** rather than disabling unrelated functionality.

9. Replication lag after recovery is not necessarily a CAP problem.

10. **Read-your-own-writes** and **monotonic reads** provide useful session-level guarantees.

11. **CAP Consistency != ACID Consistency.**

12. Idempotency does not solve conflicts between independent distributed writes.

13. Strict global invariants generally require coordination, authority, or partitioned ownership.

14. Pre-allocation improves independence but can strand resources.

15. AP systems may require later **business compensation**.

16. Avoid labeling an entire database CP or AP without considering its configuration and operation.

17. The senior-level design question is:

```text
What must this operation guarantee,
what happens when coordination fails,
and which trade-off can the business tolerate?
```

---

## End of CAP Theorem — Part 2
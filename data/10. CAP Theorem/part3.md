# CAP Theorem — Part 3
## Failure Behavior, Recovery, and Senior-Level Design

---

## 1. Start With the Invariant

Do not start with:

```text
CP or AP?
```

Start with:

```text
What must never become incorrect?
```

Examples:

```text
Bank balance
→ cannot overspend

Last-item inventory
→ cannot oversell

Seat booking
→ cannot double-book

Likes / views
→ temporary staleness is acceptable
```

The invariant determines how much coordination is needed.

---

# 2. Critical vs Optional Features

A partition should not automatically take down the entire application.

Example:

```text
E-commerce system

Catalog         → keep available
Reviews         → keep available
Recommendations → keep available
Inventory       → may degrade
Checkout        → may reject/defer
```

Principle:

> **Only restrict the functionality whose correctness depends on unavailable coordination.**

---

# 3. Graceful Degradation

Instead of:

```text
Entire product page unavailable
```

show:

```text
Product ✅
Price ✅
Reviews ✅
Images ✅

Inventory:
"Temporarily unavailable"

Checkout:
"Please try again shortly"
```

This keeps most of the application usable.

---

# 4. CP Failure Behavior

Suppose:

```text
N = 5
W = 3

A,B       X       C,D,E
```

Only:

```text
C,D,E
```

can satisfy the write quorum.

So:

```text
C,D,E → accept writes
A,B   → reject/defer writes
```

This is:

```text
Safety > Availability
```

Typical CP behavior:

```text
Reject request
Defer operation
Switch to read-only
Return retryable error
```

---

# 5. AP Failure Behavior

An AP system may let both partitions continue.

```text
A,B       X       C,D,E

WRITE 200         WRITE 300
```

Now both sides are available, but state diverges.

```text
200       X       300
```

After recovery, the system must reconcile the conflict.

So:

```text
Availability now
→ reconciliation later
```

---

# 6. Fail Closed vs Fail Open

Useful mental model:

### Fail Closed

```text
Cannot prove operation is safe
→ reject it
```

Examples:

```text
Payments
Inventory
Leader authority
Distributed lock ownership
```

This aligns with CP-style behavior.

### Fail Open

```text
Cannot coordinate
→ continue anyway
```

Examples:

```text
Likes
Views
Analytics counters
Non-critical metadata
```

This aligns more with AP-style behavior.

---

# 7. Why Partitions Are Hard

Suppose:

```text
A      X      B
```

A cannot know for sure whether B:

```text
crashed,
is slow,
is overloaded,
or is simply unreachable.
```

This uncertainty is fundamental in distributed systems.

That is why we use:

```text
timeouts
quorums
leader election
leases
consensus
```

---

# 8. Recovery After a Partition

Suppose during a partition:

```text
US = 200
EU = 300
```

When communication returns:

```text
US <-------> EU
```

the system may need to:

```text
detect conflicting versions
resolve conflicts
replay missing updates
repair stale replicas
```

Important:

```text
Network recovered
!=
Data immediately consistent
```

Replicas may still have replication lag or reconciliation backlog.

---

# 9. Read Repair

Suppose a read gets:

```text
A → version 42
B → version 40
C → version 42
```

The system can:

```text
return version 42
```

and update B:

```text
B: 40 → 42
```

This is **read repair**.

Another approach is background synchronization, sometimes called **anti-entropy**.

---

# 10. Recovery Can Be Expensive

If a partition lasts a long time:

```text
Region A → many writes
Region B → many writes
```

when it heals, the system may face:

```text
large replication backlog
conflict resolution
high network traffic
high disk I/O
CPU spikes
```

So:

> **AP can move complexity from failure-time into recovery-time.**

Recovery traffic may need to be throttled so normal user traffic is not overwhelmed.

---

# 11. Business Impact of CP

CP can cause:

```text
Rejected writes
Temporary feature outage
More retries
Lower throughput during failure
```

But protects:

```text
Money correctness
Inventory correctness
Uniqueness
Critical business invariants
```

Typical reasoning:

> Temporary unavailability is cheaper than incorrect state.

---

# 12. Business Impact of AP

AP provides:

```text
Higher availability
Regional independence
Better continuity during failures
```

But may create:

```text
Stale data
Conflicting writes
Overselling
Duplicate reservations
Reconciliation work
```

The key question is:

> **Can the business safely repair the conflict later?**

---

# 13. Compensation

Suppose two regions both sell the last item.

```text
Order A ✅
Order B ✅
```

After reconciliation:

```text
only one order can actually be fulfilled
```

One order may require:

```text
Cancellation
Refund
Notification
Store credit
```

So:

> **A distributed consistency conflict can become a business compensation workflow.**

---

# 14. Technical Success vs Final Business Success

An AP system may return:

```text
200 OK
Order accepted
```

and later discover a conflict.

Therefore:

```text
Technical acknowledgement
!=
Final business guarantee
```

For uncertain operations, a safer workflow may use:

```text
PENDING
```

instead of immediately returning:

```text
CONFIRMED
```

Example:

```text
Request
   |
   v
Pending
   |
Validate
   |
 ------
 |    |
Confirm Reject
```

---

# 15. Minimize Strong Consistency Scope

Suppose a product contains:

```text
Name
Description
Images
Reviews
Price
Inventory
```

Maybe only:

```text
Inventory
```

requires strict coordination.

The rest can use weaker consistency.

Principle:

> **Use strong consistency only where the business invariant requires it.**

This reduces:

```text
latency
coordination
failure blast radius
```

---

# 16. Reduce Global Coordination

Global coordination is expensive.

If every request needs:

```text
US ↔ EU ↔ Asia
```

you increase:

```text
Latency
Failure probability
Dependency surface
```

Instead, make operations local where possible.

Examples:

```text
Assign users to home regions
Pre-allocate inventory
Partition ownership by key
Use local counters
```

Then coordinate globally only when necessary.

---

# 17. Connection to Leader Election

Suppose:

```text
A,B       X       C,D,E
```

Only the majority side should retain/elect a valid leader.

```text
C,D,E → leader allowed
A,B   → no leader-only writes
```

Otherwise both partitions could perform authoritative writes.

This follows the same rule:

> **If authority cannot be proven, fail closed.**

---

# 18. Connection to Distributed Locks

A process may believe:

```text
"I still own the lock."
```

But after a partition or lease expiry, another process may have acquired it.

The stale owner must not continue writing.

This is why we use mechanisms such as:

```text
leases
ownership tokens
fencing tokens
```

Again:

```text
Uncertain authority
→ reject stale work
```

---

# 19. Connection to Replication

Replication alone does not determine CP vs AP.

Ask:

```text
When is a write considered successful?

Where are reads served?

Can both sides accept writes?

What happens when replicas disconnect?

How are conflicts resolved?
```

Those decisions determine the actual consistency behavior.

---

# 20. Monitoring

Useful metrics include:

```text
Replication lag
Quorum failures
Request timeouts
Cross-region latency
Replica availability
Conflict count
Repair backlog
```

For CP systems:

```text
Rejected writes
Time without quorum
Leader availability
Read-only duration
```

For AP systems:

```text
Conflict rate
Merge failures
Stale reads
Reconciliation backlog
Compensation rate
```

---

# 21. Debugging CP Failures

If writes suddenly fail, check:

```text
Do we still have quorum?

Which replicas are reachable?

Did the leader step down?

Is network latency high?

Are nodes overloaded?

Are election timeouts firing?
```

A spike in failures may mean the system is **correctly protecting consistency**, not necessarily malfunctioning.

---

# 22. Debugging AP Inconsistency

If users in different regions see different values, check:

```text
Replication lag
Recent network partition
Regional write activity
Conflict count
Repair backlog
Version metadata
```

Ask:

> **Is this expected temporary divergence, or has convergence stopped?**

Temporary divergence may be acceptable.

Permanent divergence is a problem.

---

# 23. Monitor Recovery Too

Do not stop monitoring when:

```text
network restored
```

Also check:

```text
Replication caught up?
Conflicts resolved?
Backlog cleared?
Latency normal?
Compensation complete?
```

A system is not fully recovered until it returns to steady state.

---

# 24. Latency Can Look Like a Partition

Suppose cross-region latency changes from:

```text
50 ms
```

to:

```text
5 seconds
```

Messages may technically still arrive.

But if application timeout is:

```text
1 second
```

the system behaves as if the remote node is unreachable.

So timeout tuning matters.

```text
Too short
→ false failures

Too long
→ slow failover
```

---

# 25. CAP vs Performance

Do not say:

```text
"We choose AP because it is faster."
```

CAP is about:

```text
Consistency vs Availability
during a partition
```

Performance under normal conditions is better described by PACELC:

```text
Consistency vs Latency
```

A better explanation:

```text
During partition:
choose availability.

During normal operation:
use asynchronous replication
to reduce latency.
```

---

# 26. Common Design Mistakes

### Strong consistency everywhere

Can cause:

```text
higher latency
lower availability
more coordination
larger blast radius
```

Use it only where necessary.

---

### Availability everywhere

Can create:

```text
Overselling
Double booking
Money errors
Broken uniqueness constraints
```

Some operations should reject requests.

---

### No recovery plan

Saying:

```text
"Accept writes everywhere and reconcile later"
```

is incomplete unless you explain:

```text
How conflicts are detected
How they are resolved
What happens if resolution fails
```

---

### Treating all data the same

A service may contain:

```text
Profile text
Follower count
Payment state
User identity
```

These do not require the same consistency guarantees.

---

# 27. Example Operation Matrix

| Operation | Staleness Tolerance | Conflict Cost | Likely Bias |
|---|---:|---:|---|
| Bank transfer | Very low | Very high | CP |
| Last-item checkout | Very low | High | CP |
| Unique username | Low | High | Coordinated |
| Likes | High | Low | AP |
| Views | High | Low | AP |
| Analytics | High | Low | AP |
| Shopping cart | Moderate | Often mergeable | AP-like |

These are not universal rules.

Business semantics decide.

---

# 28. Senior-Level Interview Framing

Instead of:

```text
"The system should be CP."
```

say:

> For inventory checkout, I would prioritize consistency because overselling violates a business invariant. The side without valid quorum or ownership should reject or defer checkout. Catalog and reviews can remain available with weaker consistency, so I would degrade only the inventory-dependent functionality.

That demonstrates:

```text
Business reasoning
Failure isolation
Consistency trade-offs
User experience awareness
```

---

# 29. CAP Design Checklist

For an important operation, ask:

```text
1. What must never become incorrect?

2. What happens during a partition?

3. Can both sides safely accept writes?

4. Do we need authority or quorum?

5. Can stale reads be tolerated?

6. Can conflicts be merged?

7. What happens after recovery?

8. Can we compensate if necessary?

9. What remains available?

10. What should we monitor?
```

---

# 30. 45-Second Interview Answer

> CAP says that during a network partition, a distributed system cannot guarantee both strong consistency and availability. Since partitions cannot be ruled out, the practical decision is whether an operation should fail closed for correctness or continue serving and reconcile later. For money movement or last-item inventory, I would usually prefer consistency and require valid authority or quorum. For likes, views, or analytics, temporary divergence is acceptable, so availability may be preferred. I would make the choice at the operation level, keep unrelated features available, and define how recovery and conflict reconciliation work.

---

# 31. Key Takeaways

1. Start with the **business invariant**, not CP/AP terminology.

2. Only restrict functionality that actually requires strong coordination.

3. **CP usually fails closed** when correctness cannot be proven.

4. **AP continues serving** and handles divergence later.

5. Network recovery does not mean replicas are immediately synchronized.

6. AP systems need a clear reconciliation and recovery strategy.

7. AP can shift complexity into **recovery and compensation**.

8. Technical acknowledgement may not equal final business success.

9. Strong consistency should be scoped to the smallest necessary operation/data.

10. Ownership and partitioning can reduce global coordination.

11. CAP connects closely with quorum, leader election, replication, and distributed locks.

12. Monitor both failure **and recovery**.

13. High latency can effectively behave like a partition when timeouts expire.

14. CAP is about partition behavior; PACELC covers normal-operation latency trade-offs.

15. Senior-level reasoning should explain:

```text
Invariant
→ failure behavior
→ what remains available
→ recovery
→ business impact
```

---

## End of CAP Theorem — Part 3
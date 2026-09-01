# CAP Theorem — Part 1
## Foundations, Network Partitions, Consistency vs Availability

---

## 1. Why CAP Matters

Distributed systems consist of multiple machines communicating over a network.

```text
Replica A  <---------->  Replica B
value = 100              value = 100
```

If communication fails:

```text
Replica A       X       Replica B
value = 100             value = 100
```

both nodes may still be alive, but they can no longer coordinate.

This is a **network partition**.

CAP helps answer:

> What should the system do when nodes cannot communicate?

---

# 2. CAP Theorem

CAP stands for:

```text
C → Consistency
A → Availability
P → Partition Tolerance
```

The core rule is:

> During a network partition, a distributed system cannot guarantee both strong consistency and availability.

So once a partition happens:

```text
             Partition
                 |
          ----------------
          |              |
          v              v
     Consistency     Availability
          |              |
          v              v
         CP             AP
```

---

# 3. What Is a Network Partition?

Suppose:

```text
A ---- B ---- C ---- D
```

A network failure splits the system:

```text
A ---- B     X     C ---- D
```

Now:

```text
Partition 1 → A, B
Partition 2 → C, D
```

Nodes inside each side can still communicate.

The problem is that the two sides cannot communicate with each other.

Partitions can happen because of:

- network outages,
- packet loss,
- routing failures,
- overloaded infrastructure,
- region connectivity failures,
- severe network delays.

The key principle is:

> A distributed system cannot guarantee that network partitions will never happen.

---

# 4. The Fundamental CAP Scenario

Suppose both replicas contain:

```text
A = 100
B = 100
```

A partition occurs:

```text
A = 100      X      B = 100
```

Now A receives:

```text
WRITE value = 200
```

So:

```text
A = 200      X      B = 100
```

A client now reads from B.

B cannot know whether its local value is current.

It has two choices.

---

# 5. Choice 1 — Continue Serving

B returns:

```text
100
```

The system remains available, but the client gets stale data.

Therefore:

```text
Preserve Availability
Sacrifice Strong Consistency

→ AP
```

Mental model:

> **AP:** Continue serving requests even if replicas may temporarily disagree.

---

# 6. Choice 2 — Refuse the Request

B decides:

```text
"I cannot verify whether my data is current,
so I will not serve this operation."
```

Now stale data is avoided, but the request cannot be served.

Therefore:

```text
Preserve Strong Consistency
Sacrifice Availability

→ CP
```

Mental model:

> **CP:** If correctness cannot be guaranteed, reject or defer the operation.

---

# 7. What Does Consistency Mean in CAP?

CAP consistency refers to **strong consistency**, commonly associated with linearizability.

A useful interview intuition:

> After a successful write, subsequent reads should observe that write rather than an older value.

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

From the client's perspective, the distributed system behaves like one up-to-date logical copy.

---

# 8. Eventual Consistency Is Different

An AP system may still provide **eventual consistency**.

For example:

```text
US = 101 likes
EU = 100 likes
```

Later:

```text
US = 101
EU = 101
```

So:

> AP does not mean the system never becomes consistent.

It means strong consistency is not guaranteed during the partition.

---

# 9. What Does Availability Mean in CAP?

CAP availability does not mean:

```text
Every business operation must succeed.
```

Suppose:

```text
POST /withdraw $500
```

returns:

```text
400 Insufficient funds
```

The business operation failed, but the system successfully responded.

The important distinction is:

```text
Business-rule rejection
!=
Unable to serve because safe coordination is impossible
```

CAP availability concerns whether a non-failing node can continue serving requests during the partition.

---

# 10. Why P Is Not Really Optional

CAP is often described as:

> “Pick two out of three.”

That is misleading for distributed systems.

You cannot choose:

```text
C + A
```

and simply decide:

```text
"No network partitions."
```

The application does not control the network.

Therefore the more useful model is:

```text
Partition happens
       |
   ----------
   |        |
   C        A
   |        |
  CP       AP
```

> **When P happens, choose which guarantee matters more: C or A.**

---

# 11. AP Does Not Mean Always Inconsistent

If the network is healthy:

```text
A <--------> B
```

both replicas may contain the same current value.

An AP-designed system can behave consistently during normal operation.

AP only describes what it chooses when a partition forces the trade-off.

```text
AP
!=
Always inconsistent
```

---

# 12. CP Does Not Mean Always Unavailable

Likewise:

```text
CP
!=
Normally unavailable
```

Without a partition, a CP system can provide both:

```text
Consistency + Availability
```

Availability is sacrificed only when coordination becomes impossible and consistency must be preserved.

---

# 13. Banking Example — CP

Suppose:

```text
A balance = $1000
B balance = $1000
```

Partition:

```text
A      X      B
```

A processes:

```text
Withdraw $800
```

Now:

```text
A = $200
B = $1000
```

B receives:

```text
Withdraw $500
```

If B processes it using stale data, the account could spend more money than it owns.

For balance-changing operations:

```text
Consistency > Availability
```

So B should reject/defer the operation if it cannot safely verify the balance.

This is **CP-style behavior**.

---

# 14. Social Media Likes — AP

Suppose:

```text
US Likes = 100
EU Likes = 100
```

Partition occurs.

A US user likes the post:

```text
US = 101
EU = 100
```

Should EU stop showing the post because its count may be slightly stale?

Usually no.

A user seeing:

```text
100
```

instead of:

```text
101
```

for a short period is acceptable.

So:

```text
Availability > Strong Consistency
```

This is **AP-style behavior**.

---

# 15. CAP Decisions Can Be Operation-Specific

Avoid broad statements like:

```text
"Banking systems are CP."
```

Different operations may require different guarantees.

```text
Money transfer
→ strong consistency

Withdraw money
→ strong consistency

Old transaction history
→ some staleness may be acceptable

Marketing content
→ eventual consistency is fine
```

The better question is:

> **What does this specific operation require?**

---

# 16. Concurrent Writes in an AP System

Suppose:

```text
Initial value = 100
```

During a partition:

```text
A, B             C, D, E
100       X      100
```

Both sides accept writes:

```text
A, B → 200
C,D,E → 300
```

Now the system remained available, but the data diverged.

When the partition heals:

```text
200  <------->  300
```

the system must reconcile the conflict.

---

# 17. Conflict Reconciliation

Possible strategies include:

```text
Last-Write-Wins
Version numbers
Timestamps
Vector clocks
Application-specific merging
CRDTs
```

The correct strategy depends on the data.

For example:

```text
Profile photo
→ Last-Write-Wins may work

Like counter
→ merge increments

Shopping cart
→ merge according to business semantics

Bank balance
→ blind reconciliation is dangerous
```

---

# 18. Why Last-Write-Wins Can Be Dangerous

Suppose before partition:

```text
likes = 100
```

During partition:

```text
US adds 5 likes → 105
EU adds 3 likes → 103
```

If LWW simply selects `105`, the 3 EU likes are lost.

The correct semantic result may be:

```text
108
```

Important principle:

> **Conflict resolution should follow the meaning of the data, not just choose one stored value.**

---

# 19. Timestamps Are Not Perfect

Physical clocks on distributed machines may differ.

```text
Server A = 10:02:03
Server B = 10:02:07
```

So:

```text
largest timestamp
```

does not always perfectly represent real event ordering.

Systems may use:

- logical versions,
- sequence numbers,
- logical clocks,
- consensus ordering,
- application-specific rules.

---

# 20. Safety vs Liveness

CAP connects naturally to:

```text
Safety
vs
Liveness
```

### Safety

> Nothing incorrect happens.

Examples:

```text
Do not overspend an account.
Do not oversell unique inventory.
Do not commit unsafe conflicting state.
```

### Liveness

> The system continues making progress.

Examples:

```text
Continue serving requests.
Continue accepting writes.
Continue responding during failures.
```

---

# 21. CP vs AP Through Safety and Liveness

During uncertainty:

```text
CP
→ prioritize safety
→ may reject/defer operations

AP
→ prioritize liveness
→ continue processing
→ reconcile later
```

This is similar to other distributed-system concepts:

```text
Leader authority uncertain
→ fail closed

Distributed lock owner stale
→ reject stale operation

CAP consistency uncertain
→ reject correctness-sensitive operation
```

The common principle:

> **When correctness matters, uncertainty often fails closed.**

---

# 22. CP vs AP — Quick Comparison

| Property | CP | AP |
|---|---|---|
| Priority during partition | Strong consistency | Availability |
| Typical behavior | Reject/defer unsafe requests | Continue serving |
| Stale data | Avoid | May be allowed |
| Conflicting writes | Usually prevented | May occur |
| Reconciliation | Usually minimized | Often required |
| Bias | Safety | Liveness |

---

# 23. How to Decide Between CP and AP

Do not start with:

```text
"Should my system be CP or AP?"
```

Start with:

```text
What must never become incorrect?

Can temporary stale data be tolerated?

Can conflicting writes be reconciled safely?

Is temporary unavailability acceptable?

What happens to the business if the wrong choice is made?
```

Examples:

```text
Account balance
→ correctness critical

Last inventory item
→ correctness critical

Likes
→ temporary staleness acceptable

Reviews
→ temporary staleness acceptable
```

---

# 24. Part 1 Mental Model

```text
                DISTRIBUTED SYSTEM
                       |
                       v
               Network Partition
                       |
            Nodes cannot coordinate
                       |
              -----------------
              |               |
              v               v
         Preserve C       Preserve A
              |               |
              v               v
             CP              AP
              |               |
              v               v
        Fail closed      Continue serving
                         + reconcile later
```

Remember:

```text
P cannot simply be avoided.

When P happens:

C vs A
```

---

# 25. Interview Questions

### Q1. What is CAP?

During a network partition, a distributed system cannot simultaneously guarantee both strong consistency and availability.

### Q2. Why isn't P optional?

Because the application cannot guarantee that network communication will never fail.

### Q3. What is CP?

The system preserves strong consistency and may reject or defer operations during a partition.

### Q4. What is AP?

The system continues serving requests during a partition while accepting possible stale or divergent data.

### Q5. Does AP mean always inconsistent?

No. AP describes behavior during partitions, not necessarily normal operation.

### Q6. Can AP systems be eventually consistent?

Yes. Replicas may diverge temporarily and converge after communication is restored.

### Q7. Why do AP systems need reconciliation?

Because different partitions may accept conflicting writes independently.

### Q8. How should CP vs AP be chosen?

Based on business invariants and whether inconsistency or temporary unavailability is more harmful.

---

# 26. Key Takeaways

1. **CAP is specifically about network partitions.**

2. **C means strong consistency.**

3. **A means continuing to serve requests during the partition.**

4. **P is not realistically optional** in a distributed system.

5. During a partition:

```text
CP → sacrifice availability
AP → sacrifice strong consistency
```

6. **AP does not mean always inconsistent.**

7. **CP does not mean always unavailable.**

8. AP systems may require **conflict reconciliation**.

9. Reconciliation should follow **data/business semantics**.

10. CAP decisions can be made at the **operation or data-domain level**.

11. **CP tends toward safety.**

12. **AP tends toward liveness.**

13. The key design question is:

```text
What must remain correct
when nodes cannot communicate?
```

---

## End of CAP Theorem — Part 1
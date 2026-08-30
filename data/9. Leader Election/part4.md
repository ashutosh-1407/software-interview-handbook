# Leader Election
## Part 4 — Failure Modes, Design Decisions & Final Review

---

# 1. Leader Crash

Normal state:

```text
A = Leader
B C D E = Followers
```

A crashes:

```text
A ❌
  ↓
Heartbeats Stop
  ↓
Election Timeout
  ↓
Candidate
  ↓
Quorum
  ↓
New Leader
```

Leader election provides automatic recovery.

But:

```text
Automatic Failover
        ≠
Zero Downtime
```

There is still time required for:

```text
Failure Detection
+
Election
+
Leader Recovery
```

---

# 2. Dead vs Slow Leader

Followers usually cannot know whether the leader:

```text
Crashed
```

or is simply:

```text
Slow
Overloaded
Paused
Network Delayed
```

Both may appear as:

```text
No Heartbeat
```

Therefore failure detection is based on:

> **Timeout-based suspicion, not certainty.**

Example:

```text
Leader CPU = 100%
      ↓
Heartbeat Delayed
      ↓
Follower Timeout
      ↓
Election
```

The leader never actually crashed.

---

# 3. Election Timeout Trade-Off

Short timeout:

```text
+ Faster failure detection
+ Faster failover

- More false elections
- More leadership churn
```

Long timeout:

```text
+ More tolerant of temporary delays
+ More stable leadership

- Slower failure detection
- Longer failover
```

Choose the timeout based on realistic:

```text
Network Latency

Network Jitter

System Load

Process / GC Pauses
```

> **Timeout selection balances failover speed against false-election instability.**

---

# 4. Network Partition

Suppose:

```text
5 Nodes

A B | C D E
```

A was the leader before the partition.

Side 1:

```text
A + B = 2/5
```

Side 2:

```text
C + D + E = 3/5
```

Only:

```text
C D E
```

has quorum.

Therefore:

```text
Minority Side
→ Cannot establish authoritative leadership

Majority Side
→ Can elect leader
```

Even though A and B can communicate with each other:

```text
2/5
```

is still not majority.

---

# 5. Fail Closed Under Uncertainty

Suppose A was the old leader and becomes isolated with B.

A cannot know whether:

```text
C D E
```

have already elected a newer leader.

Unsafe:

```text
"I haven't heard about another leader,
so I'll continue."
```

Safer:

```text
"I cannot establish that
I still have valid authority."
        ↓
Stop leader-only work
```

This is:

> **Fail-closed behavior under uncertainty.**

Why?

Otherwise:

```text
A → Old Leader Operations

while

C → New Leader Operations
```

could produce:

- Conflicting writes
- Duplicate processing
- Conflicting partition assignments
- Inconsistent metadata

Therefore correctness-critical systems may sacrifice:

```text
Availability
```

to preserve:

```text
Safety
```

---

# 6. Split Vote

Suppose:

```text
B = Candidate

C = Candidate
```

Votes:

```text
B → 2 votes

C → 2 votes
```

Required quorum:

```text
3/5
```

Nobody wins.

Therefore:

```text
No Quorum
   ↓
No Leader
```

After another randomized timeout:

```text
New Term
   ↓
New Election
```

A split vote hurts:

```text
Liveness / Election Time
```

but preserves:

```text
Safety
```

because nobody becomes leader without quorum.

---

# 7. Why Randomized Timeouts?

Without randomization:

```text
B → 2 sec
C → 2 sec
D → 2 sec
E → 2 sec
```

multiple followers may become candidates simultaneously.

Instead:

```text
B → 170 ms
C → 240 ms
D → 310 ms
E → 390 ms
```

makes it more likely that one candidate starts first and gathers votes.

Important distinction:

```text
Randomized Timeout
→ Improves Liveness / Convergence
```

while:

```text
Quorum + One Vote Per Term
→ Protect Safety
```

---

# 8. Stale Leader

Suppose:

```text
Term 7

A = Leader
```

A becomes isolated.

The majority elects:

```text
Term 8

B = Leader
```

Later A reconnects.

A may still believe:

```text
"I am leader."
```

But:

```text
A → Term 7

B → Term 8
```

Therefore A has:

```text
Stale Authority
```

If A sends:

```text
heartbeat(term=7)
```

a node already in term 8 can compare:

```text
7 < 8
```

and reject the stale leadership.

When A discovers:

```text
term = 8
```

it must:

```text
Stop Acting as Leader
        ↓
Become Follower
```

---

# 9. Terms and Fencing Tokens

This resembles the fencing-token idea from distributed locks.

Distributed Lock:

```text
Owner A → Token 41

Owner B → Token 42
```

Leader Election:

```text
Leader A → Term 7

Leader B → Term 8
```

Both use increasing generations to distinguish:

```text
Old Authority

vs

New Authority
```

They are different mechanisms, but the core intuition is similar:

> **Monotonically increasing generations help identify stale authority.**

---

# 10. Quorum Loss

Suppose:

```text
5 Nodes
```

but only:

```text
A B
```

remain mutually reachable.

Both may be completely healthy.

But:

```text
2/5
```

is not quorum.

Therefore:

```text
Cannot Establish Leader
        ↓
Leader-Owned Functionality
May Become Unavailable
```

until quorum returns.

This is intentional.

---

# 11. Why Odd-Sized Voting Groups?

Majority:

```text
floor(N / 2) + 1
```

Examples:

```text
3 nodes → quorum 2 → tolerate 1 failure

4 nodes → quorum 3 → tolerate 1 failure

5 nodes → quorum 3 → tolerate 2 failures
```

Notice:

```text
3 → 4 nodes
```

does not improve quorum fault tolerance.

But:

```text
4 → 5 nodes
```

does.

Therefore odd-sized voting groups are generally more efficient.

---

# 12. Leader Election ≠ Exactly Once

Suppose:

```text
A = Leader
   ↓
Processes Job 123
   ↓
Business Effect Happens
   ↓
A Crashes
   ↓
B Becomes Leader
```

B may not know whether A completed the operation.

B retries:

```text
Job 123
```

Potential result:

```text
Duplicate Business Effect
```

Leader election guarantees:

```text
Who has authority now?
```

It does **not** guarantee:

```text
Exactly one business effect
```

---

# 13. Safe Business Recovery

Depending on the operation, combine leader election with:

```text
Transactions
```

when the work can be performed atomically.

Use:

```text
Idempotency
```

when retrying the same logical operation must produce one business effect.

For long-running workflows, persist progress:

```text
Job 123

Step 1 = DONE
Step 2 = DONE
Step 3 = PENDING
```

Then the next leader can determine:

```text
Where did the previous leader stop?
```

Mental model:

```text
Leader Election
→ Who owns the work now?

Idempotency / Transaction
→ How do we avoid duplicate effects?

Workflow State
→ Where should recovery continue?
```

---

# 14. Global vs Partitioned Leadership

Global leadership:

```text
One Leader
   ↓
All Coordination
```

Advantages:

- Simple
- Easy ownership
- Easy coordination

Costs:

- Potential bottleneck
- Larger failure blast radius

Partitioned leadership:

```text
Leader A → P1–100

Leader B → P101–200

Leader C → P201–300
```

Advantages:

- More parallelism
- Higher potential throughput
- Better fault isolation

Costs:

- Ownership management
- Rebalancing
- Hot partitions
- More complexity

> **Partition leadership only when the underlying work can actually execute independently.**

---

# 15. When Leader Election Is Useful

Leader election makes sense when:

```text
Multiple Eligible Nodes
        +
Only One Should Coordinate
```

Examples:

```text
Job Scheduler

Cluster Coordinator

Partition Assignment

Metadata Manager

Primary Selection
```

But do not introduce leader election automatically.

If work can safely be:

```text
Partitioned

or

Processed Idempotently
```

without one global coordinator, a leader may be unnecessary.

> **Centralize only the work that actually requires centralized authority.**

---

# 16. Critical vs Optional Functionality

When leadership is unavailable, identify what actually needs to stop.

Leader-dependent:

```text
Partition Reassignment

Critical Scheduling

Metadata Changes

Leader-Only Writes
```

may need to stop.

Independent functionality:

```text
Cached Reads

Read-Only APIs

Analytics

Existing Worker Processing
```

may continue.

This provides:

```text
Graceful Degradation
```

instead of:

```text
No Leader
   ↓
Entire Application Down
```

---

# 17. Production Monitoring

Monitor:

```text
Current Leader

Leader Change Rate

Election Count

Election Duration

Heartbeat Latency

Heartbeat Failures

Time Without Leader

Quorum Availability

Leader CPU / Memory
```

For partitioned leadership:

```text
Traffic Per Leader

Partitions Per Leader

Hot Partitions

Leadership Movement
```

---

# 18. Production Debugging

Suppose leader elections suddenly increase.

Check:

```text
1. Election timeout

2. Heartbeat latency

3. Network latency / packet loss

4. Leader CPU / memory

5. Process / GC pauses

6. Node restarts

7. Recent deployment

8. Traffic changes

9. Quorum health
```

Example:

```text
Leader CPU = 98%
      ↓
Heartbeat Delayed
      ↓
Election Timeout
      ↓
False Election
      ↓
Leadership Churn
```

Frequent elections do not automatically mean:

```text
Leader is crashing
```

The leader may simply be:

```text
Slow

Overloaded

or

Experiencing network problems
```

---

# 19. Business Impact

Business impact depends on the leader's responsibility.

Scheduler leader fails:

```text
Scheduled Jobs
      ↓
Delayed
```

Partition coordinator fails:

```text
New Partition Assignment
      ↓
Delayed
```

Write leader fails:

```text
Writes
      ↓
Temporarily Unavailable
```

Other independent functionality may continue.

> **Always ask what business functionality actually depends on leadership.**

---

# 20. Design Checklist

When designing leader election, ask:

```text
Why do we need a leader?

What exactly does the leader own?

Global or partitioned leadership?

How are failures detected?

What is the election timeout?

What quorum is required?

How are simultaneous candidates handled?

How are split votes retried?

How are stale leaders detected?

What happens if quorum is lost?

What functionality stops without a leader?

What can continue safely?

How is unfinished work recovered?

How are duplicate effects prevented?

What metrics detect instability?
```

---

# Engineering Principles

## Principle 1

> **No quorum means no authoritative leader.**

## Principle 2

> **Being alive does not prove that a node still has valid leadership.**

## Principle 3

> **When authority is uncertain, fail closed for correctness-critical work.**

## Principle 4

> **Randomized timeouts improve convergence; quorum and voting rules protect safety.**

## Principle 5

> **Terms help identify stale leadership.**

## Principle 6

> **Leader election determines authority, not exactly-once business execution.**

## Principle 7

> **Only functionality that requires leadership should stop when leadership is unavailable.**

## Principle 8

> **Use the simplest leadership scope that satisfies correctness, scale, and availability requirements.**

---

# Interview Questions

### Q1

Why can't the minority side of a network partition elect a valid leader?

### Q2

What does fail closed mean for an isolated leader?

### Q3

Why can a slow but healthy leader trigger an election?

### Q4

Why are randomized election timeouts useful?

### Q5

What happens after a split vote?

### Q6

How do terms help detect stale leaders?

### Q7

Why doesn't leader election guarantee exactly-once processing?

### Q8

When would you choose partitioned leadership?

### Q9

Why are odd-sized voting groups generally preferred?

### Q10

What would you investigate if leader elections suddenly became frequent?

---

# Key Takeaways

1. Leader election automatically transfers authority when a leader becomes unavailable.
2. Failure detection uses heartbeats and timeouts, so slow and dead leaders can look similar.
3. Quorum prevents minority partitions from independently establishing valid leadership.
4. When authority is uncertain, correctness-critical operations should fail closed.
5. Randomized timeouts reduce simultaneous candidates and improve election convergence.
6. Terms identify newer leadership and help reject stale authority.
7. Odd-sized voting groups generally provide better quorum fault-tolerance efficiency.
8. Leader election determines **who has authority now**, not whether business work happened exactly once.
9. Transactions, idempotency, and persisted workflow state may be needed for safe recovery.
10. Global leadership is simpler; partitioned leadership improves parallelism and fault isolation at additional complexity.
11. Leader failure should stop only functionality that actually requires leadership.
12. Monitor heartbeats, elections, quorum health, and leader resources to detect instability.
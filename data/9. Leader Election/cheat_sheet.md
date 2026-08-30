# Leader Election — Interview Cheat Sheet

## 1. Why Leader Election?

Use when:

```text
Multiple nodes can perform a role
        +
Only one should be active at a time
```

Examples:

```text
Scheduler
Cluster Coordinator
Partition Leader
Metadata Manager
Primary Selection
```

Goal:

> **Exactly one authoritative leader should coordinate a responsibility at a time.**

---

## 2. Basic Roles

```text
Follower
   ↓
Election Timeout
   ↓
Candidate
   ↓
Quorum
   ↓
Leader
```

Leader:

```text
Performs leader-only work
+
Sends heartbeats
```

Followers:

```text
Monitor leader heartbeats
```

Candidate:

```text
Requests votes to become leader
```

---

## 3. Heartbeats & Election Timeout

Leader sends:

```text
Periodic Heartbeats
```

Followers reset their:

```text
Election Timeout
```

If heartbeats stop:

```text
Timeout Expires
      ↓
Follower becomes Candidate
      ↓
Election Starts
```

Important:

```text
Leader Dead
```

and:

```text
Leader Slow / Paused
```

can both look like:

```text
No Heartbeat
```

---

## 4. Timeout Trade-Off

Short timeout:

```text
+ Faster failover
- More false elections
```

Long timeout:

```text
+ More stable
- Slower failover
```

Choose based on:

```text
Network latency
Jitter
System load
Process / GC pauses
```

---

## 5. Randomized Election Timeout

If all followers timeout together:

```text
B C D E
↓
All become candidates
```

Votes may split.

Instead:

```text
B → 170 ms
C → 240 ms
D → 310 ms
E → 390 ms
```

One candidate is more likely to start first.

> **Randomization reduces simultaneous candidates and improves election convergence.**

---

## 6. Quorum / Majority

For:

```text
N voters
```

quorum:

```text
floor(N / 2) + 1
```

Examples:

```text
3 nodes → 2
5 nodes → 3
7 nodes → 4
```

Candidate becomes leader only after receiving quorum.

---

## 7. Network Partition

Five nodes:

```text
A B | C D E
```

```text
A B     = 2/5 → No quorum ❌
C D E   = 3/5 → Quorum ✅
```

Only the majority side can establish valid leadership.

> **No quorum → no authoritative leader.**

---

## 8. Why Odd Number of Voters?

```text
3 nodes → quorum 2 → tolerate 1 failure
4 nodes → quorum 3 → tolerate 1 failure
5 nodes → quorum 3 → tolerate 2 failures
```

Adding the fourth node did not improve fault tolerance.

Odd-sized voting groups generally use voters more efficiently.

---

## 9. One Vote Per Term

A voter should vote:

> **At most once per term.**

Otherwise:

```text
Candidate B → B,C,D = 3 votes

Candidate D → C,D,E = 3 votes
```

Both could claim majority.

Therefore:

```text
One Voter
→ One Vote
→ Per Term
```

protects election safety.

---

## 10. Term / Epoch

Each election belongs to an increasing generation:

```text
Term 7 → A Leader

Term 8 → B Leader

Term 9 → C Leader
```

Higher term:

```text
Newer Authority
```

---

## 11. Stale Leader

Suppose:

```text
Term 7
A = Leader
```

A becomes isolated.

Majority elects:

```text
Term 8
B = Leader
```

A reconnects:

```text
A → heartbeat(term=7)
```

Nodes already know:

```text
term=8
```

Therefore:

```text
7 < 8
→ A is stale
```

A should:

```text
Step Down
   ↓
Become Follower
```

---

## 12. Terms vs Fencing Tokens

Similar intuition:

```text
Distributed Lock:
Token 41 → Token 42

Leader Election:
Term 7 → Term 8
```

Both help identify:

```text
Old Authority
vs
New Authority
```

---

## 13. Fail Closed

Suppose old leader A loses access to quorum.

A cannot know whether another leader was elected.

Unsafe:

```text
"I might still be leader,
so I'll continue."
```

Correct:

```text
Cannot establish valid authority
        ↓
Stop leader-only work
```

> **When authority is uncertain, fail closed for correctness-critical operations.**

---

## 14. Safety vs Liveness

Safety:

```text
Prevent conflicting authoritative leaders
```

Liveness:

```text
Eventually elect a leader
```

Examples:

```text
Quorum
One Vote Per Term
Terms
→ Safety
```

```text
Randomized Timeouts
Election Retry
→ Liveness
```

---

## 15. Split Vote

Example:

```text
B → 2 votes

C → 2 votes
```

Required:

```text
3/5
```

Result:

```text
No Leader
```

Then:

```text
Randomized Timeout
      ↓
New Term
      ↓
Retry Election
```

Split votes hurt liveness but preserve safety.

---

## 16. Global vs Partitioned Leadership

Global:

```text
One Leader
   ↓
All Coordination
```

Pros:

```text
Simple
Easy ownership
```

Cons:

```text
Bottleneck
Large failure blast radius
```

Partitioned:

```text
Leader A → P1–100
Leader B → P101–200
Leader C → P201–300
```

Pros:

```text
More parallelism
Higher potential throughput
Better fault isolation
```

Cons:

```text
Ownership complexity
Rebalancing
Hot partitions
```

> **Partition leadership only if the underlying work can execute independently.**

---

## 17. Leader Bottleneck

Adding followers does not necessarily increase throughput.

```text
Many Followers
      ↓
One Leader
      ↓
One Coordination Path
```

If the leader remains the serialization point:

```text
More Nodes
≠
More Throughput
```

---

## 18. Failover Latency

```text
Leader Failure
     ↓
Failure Detection
     ↓
Election
     ↓
Leader Initialization
     ↓
Ready
```

Mental model:

```text
Failover Latency
≈ Detection + Election + Initialization
```

Therefore:

```text
Automatic Failover
≠
Zero Downtime
```

---

## 19. Leader Election ≠ Exactly Once

Suppose:

```text
A performs Job 123
      ↓
A crashes
      ↓
B becomes leader
      ↓
B retries Job 123
```

Leader election only guarantees:

```text
Who has authority now?
```

It does NOT guarantee:

```text
Exactly one business effect
```

Use where appropriate:

```text
Transactions
Idempotency
Persisted Workflow State
```

---

## 20. Production Monitoring

Watch:

```text
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
Partitions Per Leader
Traffic Per Leader
Hot Partitions
```

---

## 21. Debugging Frequent Elections

Check:

```text
Election Timeout
      ↓
Heartbeat Latency
      ↓
Network Latency / Packet Loss
      ↓
Leader CPU / Memory
      ↓
GC / Process Pauses
      ↓
Recent Deployment
      ↓
Quorum Health
```

Example:

```text
Leader CPU = 100%
      ↓
Heartbeat delayed
      ↓
Follower timeout
      ↓
False election
```

---

# Failure Scenarios to Remember

```text
Leader crashes
→ timeout → election

Leader slow
→ may trigger false election

Network partition
→ only majority side gets authority

No quorum
→ no leader

Split vote
→ retry in newer term

Old leader reconnects
→ higher term makes it step down

Leader loses quorum
→ fail closed

Leader partially completes work
→ idempotency / transaction / workflow state
```

---

# 60-Second Interview Answer

> Leader election is used when multiple distributed nodes can perform a role but only one should have authority at a time. The leader sends heartbeats, and followers start an election when their randomized election timeout expires. A candidate must obtain quorum, and each voter votes at most once per term. Terms provide monotonically increasing leadership generations so stale leaders can be detected and forced to step down. During partitions, only the majority side should maintain authority; a leader that cannot establish valid authority should fail closed. I would choose global leadership for simplicity unless it becomes a bottleneck or creates too large a failure blast radius, in which case leadership can be partitioned. I would also remember that leader election determines authority, not exactly-once business execution, so idempotency, transactions, or persisted workflow state may still be required.

---

# Final Memory Map

```text
Heartbeat
   ↓
Election Timeout
   ↓
Candidate
   ↓
Votes
   ↓
Quorum
   ↓
Leader
```

```text
Safety
→ Quorum
→ One Vote / Term
→ Terms
→ Reject Stale Leader
```

```text
Liveness
→ Randomized Timeout
→ Retry Election
```

```text
No Quorum
→ No Authority
→ Fail Closed
```

```text
Scale Problem
→ Global vs Partitioned Leadership
```

```text
Business Retry
→ Idempotency / Transaction / Workflow State
```

> **Golden rule:** Leader election answers **“who has authority now?”** Protecting the business effects performed under that authority is a separate correctness problem.
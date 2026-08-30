# Leader Election — System Design Handbook

## Part 1 — Fundamentals, Leader Role, Quorum, and Failure Detection

---

# 1. What Is Leader Election?

In a distributed system, multiple nodes may be capable of performing the same responsibility.

Example:

```text
        Server A
        Server B
        Server C
        Server D
        Server E
```

But some responsibilities should be performed by only one node at a time.

Examples:

```text
Running a scheduler

Coordinating a cluster

Managing a partition

Acting as a database primary

Assigning work to workers
```

Instead of permanently assigning one server, the nodes elect one of themselves:

```text
              Server A
                 ↑
               LEADER

Server B    Server C    Server D    Server E
   ↑           ↑           ↑           ↑
                Followers
```

The process of choosing this node is:

> **Leader Election**

---

# 2. Why Do We Need a Leader?

Suppose 20 application instances all contain the same scheduler.

Without coordination:

```text
Server 1  → trigger Job 123
Server 2  → trigger Job 123
Server 3  → trigger Job 123
...
Server 20 → trigger Job 123
```

This could cause:

```text
Duplicate processing

Contention

Unnecessary network traffic

Repeated downstream requests
```

Distributed locks or idempotency can help with some of these problems.

Another design is:

```text
20 scheduler-capable instances
           ↓
      Elect ONE leader
           ↓
      Leader schedules jobs
```

Followers remain available for failover but do not perform the leader-only responsibility.

---

# 3. Why Not Permanently Assign One Leader?

We could configure:

```text
Server A = Scheduler

B, C, D, E = Normal Servers
```

This is simple.

But if A fails:

```text
Server A ❌
    ↓
Scheduler unavailable
```

The leader-owned functionality becomes unavailable until A recovers or someone manually replaces it.

Server A becomes a:

> **Single Point of Failure (SPOF)**

Leader election allows:

```text
A fails
   ↓
remaining nodes detect failure
   ↓
elect new leader
   ↓
B becomes leader
```

Therefore:

> **Leader election provides automatic failover for leader-owned responsibilities.**

---

# 4. Basic Leader Election Lifecycle

A simplified lifecycle is:

```text
Nodes start
    ↓
Leader elected
    ↓
Leader performs special responsibility
    ↓
Followers monitor leader
    ↓
Leader fails
    ↓
Failure detected
    ↓
New election
    ↓
New leader elected
```

The system therefore needs mechanisms for:

```text
Leader selection

Failure detection

Voting

Quorum

Leadership generations

Failover
```

---

# 5. The Split-Brain Problem

Suppose:

```text
A = Leader

B, C, D, E = Followers
```

A network partition occurs:

```text
Side 1                Side 2

A                      B C D E
```

A is still alive.

It may think:

```text
"I am still leader."
```

Meanwhile the other nodes may think:

```text
"We cannot reach A.
We need another leader."
```

If they elect B:

```text
Side 1                Side 2

A = Leader            B = Leader
```

Now two nodes may perform leader-only work.

This situation is commonly called:

> **Split brain**

Possible consequences:

```text
Duplicate processing

Conflicting writes

Inconsistent state

Multiple coordinators issuing commands
```

Leader election must therefore be about more than simply detecting that another node is unreachable.

---

# 6. Majority / Quorum

A common solution is to require a candidate to receive support from a majority of voting nodes.

For:

```text
N nodes
```

majority is:

```text
floor(N / 2) + 1
```

For five nodes:

```text
5 / 2
↓
majority = 3
```

Therefore a leader needs:

```text
3 out of 5 votes
```

to win an election.

This majority is commonly called a:

> **Quorum**

---

# 7. Network Partition Example

Suppose we have:

```text
A B C D E
```

The network splits:

```text
Side 1:

A B


Side 2:

C D E
```

Side 1 has:

```text
2 / 5 = 40%
```

It cannot form a majority.

Side 2 has:

```text
3 / 5 = 60%
```

It can form a majority.

Therefore:

```text
A B
→ cannot elect leader

C D E
→ can elect leader
```

This prevents both partitions from independently establishing valid leadership.

---

# 8. Why Majority Helps Prevent Split Brain

Consider two groups trying to elect different leaders.

For both candidates to become valid leaders, both would need a majority.

But two independent majorities cannot be formed from completely disjoint groups of the same voting membership.

For five nodes:

```text
majority = 3
```

A partition of:

```text
2 + 3
```

allows only the group of three to form quorum.

Therefore:

> **Only the partition capable of forming quorum should establish valid leadership.**

---

# 9. Safety vs Availability

Suppose:

```text
5-node cluster
```

Only:

```text
A and B
```

can communicate.

The other three nodes are unavailable to them.

A and B could theoretically say:

```text
"We both agree A should be leader."
```

But:

```text
2 / 5
```

is not a majority.

Therefore they should not elect A.

This means leader-owned functionality may temporarily stop.

We are sacrificing:

> **Availability**

to preserve:

> **Safety / Correctness**

Why?

Because somewhere else there could potentially be:

```text
C D E
```

forming the actual majority.

Allowing A/B to elect independently could create conflicting leadership.

---

# 10. Safety and Liveness

Two useful distributed-systems properties are:

## Safety

Informally:

```text
Something bad should not happen.
```

For leader election:

```text
We should not allow conflicting
authoritative leadership.
```

---

## Liveness

Informally:

```text
Something good should eventually happen.
```

For leader election:

```text
When a leader fails,
the cluster should eventually
elect another leader.
```

Leader election mechanisms need to balance both.

---

# 11. Why Odd Numbers of Voting Nodes Are Common

Distributed systems commonly use voting groups such as:

```text
3 nodes

5 nodes

7 nodes
```

rather than:

```text
4 nodes

6 nodes
```

One reason is that an even-numbered voter often does not increase failure tolerance.

Compare:

```text
3 nodes
majority = 2
```

The cluster can lose:

```text
1 node
```

and still have:

```text
2 / 3
```

for quorum.

Now consider:

```text
4 nodes
majority = 3
```

The cluster can still lose only:

```text
1 node
```

because:

```text
2 / 4
```

is not a majority.

Therefore:

```text
3 nodes → tolerate 1 unavailable voter
4 nodes → tolerate 1 unavailable voter
```

The fourth voting node did not increase failure tolerance.

Now:

```text
5 nodes
majority = 3
```

The system can lose:

```text
2 nodes
```

and still retain quorum.

Mental model:

```text
Voting Nodes     Majority     Failures Tolerated

     3               2                1
     4               3                1
     5               3                2
     6               4                2
     7               4                3
```

Therefore odd-sized voting groups generally use voting capacity more efficiently.

They also avoid symmetric splits such as:

```text
2 vs 2

3 vs 3
```

where neither partition has a majority.

---

# 12. Leader Failure Detection

Once a leader exists, followers need some way to determine whether it is still available.

A common mechanism is:

> **Heartbeats**

The leader periodically communicates with followers:

```text
Leader A
   │
   ├── heartbeat → B
   │
   ├── heartbeat → C
   │
   ├── heartbeat → D
   │
   └── heartbeat → E
```

These messages indicate:

```text
"I am alive and currently acting as leader."
```

---

# 13. Election Timeout

Followers maintain an:

> **Election timeout**

Conceptually:

```text
Receive heartbeat
       ↓
Reset election timeout
```

As long as heartbeats continue arriving:

```text
Heartbeat
   ↓
reset timer

Heartbeat
   ↓
reset timer

Heartbeat
   ↓
reset timer
```

followers do not start an election.

If heartbeats stop:

```text
No heartbeat
     ↓
Election timeout expires
     ↓
Follower suspects leader unavailable
     ↓
Election can begin
```

The important distinction is:

```text
Leader
→ sends heartbeats

Followers
→ use election timeout
```

---

# 14. Dead vs Slow Leader

A follower usually cannot know with certainty whether a leader:

```text
crashed
```

or is simply:

```text
slow
```

From the follower's perspective, both can look like:

```text
No heartbeat received
```

Example:

```text
Leader A alive

Network becomes slow
       ↓
heartbeat delayed
       ↓
Follower sees no heartbeat
```

This creates an important timeout trade-off.

---

# 15. Short vs Long Election Timeout

Suppose we choose:

```text
Election timeout = 500 ms
```

A real leader failure can be detected quickly.

Advantage:

```text
Fast failure detection
      ↓
Fast election
      ↓
Fast recovery
```

But temporary network latency may exceed 500 ms:

```text
Leader healthy
      ↓
network spike = 700 ms
      ↓
heartbeat arrives late
      ↓
follower times out
      ↓
unnecessary election
```

---

Now consider:

```text
Election timeout = 10 seconds
```

Temporary network delays are less likely to trigger elections.

But if the leader really dies:

```text
Leader dies
     ↓
wait up to timeout
     ↓
start election
```

leader-owned functionality may remain unavailable longer.

Therefore:

```text
Short timeout
→ faster failover
→ more false-election risk

Long timeout
→ slower failover
→ fewer false elections
```

---

# 16. False Elections

A false election happens when:

```text
Leader is actually healthy
```

but followers incorrectly suspect it is unavailable.

Example:

```text
Election timeout = 1 sec

Leader heartbeat delayed = 1.5 sec
```

Followers observe:

```text
No heartbeat for 1 sec
      ↓
timeout
      ↓
start election
```

even though the leader never crashed.

Repeated false elections can cause:

```text
Leadership churn

Temporary unavailability

Interrupted leader-owned work

Extra coordination traffic

Higher failover overhead
```

Therefore election timeouts should account for realistic:

```text
Network latency

Network jitter

Process pauses

Expected system load
```

---

# 17. Leader Process Pauses

A leader can be alive but temporarily stop making progress.

Example:

```text
Election timeout = 2 sec

Leader A
   ↓
Long process pause = 3 sec
   ↓
heartbeat not sent on time
   ↓
followers timeout
```

Possible causes include:

```text
Long garbage-collection pause

Severe CPU pressure

Process scheduling delays

Machine overload
```

From the followers' perspective:

```text
Leader crashed

vs

Leader paused
```

may look identical:

```text
No heartbeat
```

---

# 18. Debugging Frequent Leader Elections

Suppose production shows:

```text
Leader A
   ↓
Leader B
   ↓
Leader C
   ↓
Leader D
```

every few minutes even though machines are not actually crashing.

Investigate:

```text
Election timeout configuration

Network latency

Packet loss

Leader CPU utilization

Leader memory/resource pressure

Long process/runtime pauses
```

A timeout that is too aggressive relative to real system conditions can create unnecessary leadership churn.

---

# 19. Randomized Election Timeouts

Suppose the leader dies and every follower has exactly:

```text
Election timeout = 2 seconds
```

Then:

```text
B timeout
C timeout
D timeout
E timeout
```

may all expire at almost exactly the same moment.

All followers could become candidates simultaneously:

```text
B → "Vote for me"

C → "Vote for me"

D → "Vote for me"

E → "Vote for me"
```

Votes may become split.

---

# 20. Randomization Reduces Split Votes

Instead of identical timeouts:

```text
B → 2000 ms
C → 2000 ms
D → 2000 ms
E → 2000 ms
```

use randomized election timeouts:

```text
B → 1700 ms
C → 2100 ms
D → 2400 ms
E → 1900 ms
```

B times out first:

```text
B becomes candidate
      ↓
asks others for votes
```

before most followers begin their own elections.

This makes it more likely that one candidate quickly collects a majority.

Therefore:

> **Randomized election timeouts reduce simultaneous candidacies and split votes, helping elections converge faster.**

---

# 21. Reasonable Timeout vs Randomized Timeout

These solve two related but different problems.

## Reasonable Timeout Duration

Protects against:

```text
Temporary network latency

Slow leader

Process pauses
```

Goal:

```text
Avoid falsely declaring
a healthy leader dead.
```

---

## Randomized Timeout

Protects against:

```text
Many followers becoming
candidates simultaneously.
```

Goal:

```text
Reduce split votes
and election convergence time.
```

Mental model:

```text
Timeout duration
→ How long before I suspect the leader?

Timeout randomization
→ Which follower suspects it first?
```

---

# 22. Part 1 Mental Model

Leader election begins with a simple requirement:

```text
Multiple capable nodes
        ↓
One leader-only responsibility
        ↓
Elect one authoritative leader
```

Leader failure:

```text
Leader
   ↓
heartbeats stop
   ↓
followers' election timeout expires
   ↓
new election
```

Network partition:

```text
Cluster splits
      ↓
Only majority partition
can establish valid leadership
```

Election stability:

```text
Reasonable timeout
→ avoid excessive false elections

Randomized timeout
→ reduce simultaneous candidates
```

The key concepts so far are:

```text
Leader
Follower
Quorum / Majority
Split Brain
Safety
Liveness
Heartbeat
Election Timeout
Randomized Election Timeout
```

The next question is:

```text
Once an election starts,
how do nodes actually choose a leader
without accidentally electing
multiple leaders?
```

That introduces:

```text
Candidate

Voting

One vote per term

Term / Epoch

Stale leaders
```

which are covered in Part 2.

---

# Part 1 Summary

Leader election allows a distributed cluster to dynamically choose one node for a special responsibility.

It avoids permanently assigning a leader that would become a single point of failure.

The basic model is:

```text
Followers
   ↓
monitor leader heartbeats
   ↓
leader becomes unavailable
   ↓
election timeout
   ↓
new election
```

Majority/quorum protects leadership during network partitions:

```text
5 nodes
↓
3 required for quorum
```

Only a partition capable of forming quorum should establish authoritative leadership.

This deliberately favors:

```text
Safety / Correctness
```

over:

```text
Availability
```

when the cluster cannot establish valid leadership.

Finally:

```text
Short election timeout
→ faster recovery
→ more false-election risk

Long election timeout
→ slower recovery
→ greater stability

Randomized election timeout
→ fewer simultaneous candidates
→ fewer split votes
```

Part 2 builds on this foundation with the actual election process:

```text
Follower
   ↓
Candidate
   ↓
Votes
   ↓
Quorum
   ↓
Leader

+

Terms / Epochs
Stale Leader Detection
One Vote Per Term
```
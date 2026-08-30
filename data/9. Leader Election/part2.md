# Leader Election — System Design Handbook

## Part 2 — Candidates, Voting, Terms, and Stale Leaders

---

# 23. From Follower to Candidate

Normally, a node operates as either:

```text
Leader

or

Follower
```

But during an election, we need another temporary role:

> **Candidate**

Suppose:

```text
A = Leader

B C D E = Followers
```

A fails.

Followers stop receiving heartbeats:

```text
A ❌

B → no heartbeat
C → no heartbeat
D → no heartbeat
E → no heartbeat
```

Eventually one follower's randomized election timeout expires.

Suppose B times out first:

```text
B = Follower
     ↓
Election timeout expires
     ↓
B becomes Candidate
```

B can now attempt to become the next leader.

---

# 24. Basic Node States

A useful mental model is:

```text
              timeout
Follower ───────────────→ Candidate
   ↑                         │
   │                         │ wins majority
   │                         ↓
   └────────────────────── Leader
          steps down
```

The three important states are:

```text
Follower
Candidate
Leader
```

A follower normally listens to the current leader.

A candidate participates in an election.

A leader performs leader-specific responsibilities and sends heartbeats.

---

# 25. Candidate Requests Votes

Suppose the cluster has:

```text
A B C D E
```

A has failed.

B becomes a candidate.

B asks the other voting nodes:

```text
B → C: Vote for me?

B → D: Vote for me?

B → E: Vote for me?
```

B can also count its own vote.

If B receives:

```text
B
C
D
```

then:

```text
3 / 5
```

nodes support B.

That is a majority.

Therefore:

```text
B becomes Leader
```

---

# 26. Election Requires Quorum

For five nodes:

```text
Majority = 3
```

A candidate receiving:

```text
2 votes
```

cannot become leader.

A candidate receiving:

```text
3 votes
```

can.

Therefore:

```text
Candidate
    ↓
Collect votes
    ↓
Majority?
  /       \
No         Yes
↓           ↓
No leader   Become leader
```

This prevents a minority partition from independently establishing authoritative leadership.

---

# 27. What If Multiple Candidates Appear?

Randomized election timeouts reduce simultaneous candidates.

But they do not make them impossible.

Suppose:

```text
B timeout = 170 ms
C timeout = 175 ms
```

Both may time out before hearing from a new leader.

Therefore:

```text
B → Candidate

C → Candidate
```

Both begin requesting votes.

The election mechanism must remain safe even when multiple candidates exist.

---

# 28. One Vote Per Term

Suppose C votes for B:

```text
C → B ✅
```

Then D asks C:

```text
D → C:
"Vote for me too?"
```

C should not vote again in the same election term.

Rule:

> **A voting node should vote at most once per term.**

This is a critical election-safety property.

---

# 29. Why Multiple Votes Are Dangerous

Suppose we have five nodes:

```text
A B C D E
```

If nodes could vote multiple times:

```text
Candidate B gets:

B
C
D

= 3 votes
```

B believes:

```text
"I have majority.
I am leader."
```

But D also runs:

```text
Candidate D gets:

C
D
E

= 3 votes
```

If C and D are allowed to vote multiple times:

```text
B has majority

AND

D has majority
```

Now two candidates could believe they won the same election.

Therefore:

```text
One node
+
One vote
+
Per term
```

helps preserve election safety.

---

# 30. Randomized Timeout vs One Vote Per Term

These mechanisms solve different problems.

## Randomized Election Timeout

Goal:

```text
Reduce simultaneous candidates
```

Therefore:

```text
fewer split votes
↓
faster convergence
```

This primarily improves:

> **Liveness**

---

## One Vote Per Term

Goal:

```text
Prevent the same voter from
supporting multiple candidates
during the same term
```

This primarily protects:

> **Safety**

Mental model:

```text
Randomized timeout
→ helps elections finish

One vote per term
→ helps elections remain correct
```

---

# 31. Terms / Epochs

Distributed systems need to distinguish:

```text
Old leadership
```

from:

```text
New leadership
```

A common mechanism is a monotonically increasing:

> **Term / Epoch**

Example:

```text
Term 7
A = Leader
```

A fails.

A new election begins:

```text
Term 8
B = Candidate
```

B wins:

```text
Term 8
B = Leader
```

Later:

```text
Term 9
C = Leader
```

Therefore:

```text
Term 7 < Term 8 < Term 9
```

Higher terms represent newer leadership generations.

---

# 32. Why Terms Are Necessary

Consider:

```text
Term 7

A = Leader
```

A becomes isolated from the cluster.

The remaining nodes elect:

```text
Term 8

B = Leader
```

A may still believe:

```text
"I am leader."
```

When connectivity returns, A may continue sending leader-originated messages.

Without a generation number, other nodes need some way to determine:

```text
Is A still the current leader?

Or is A an old leader?
```

Terms provide that ordering.

---

# 33. Leader Messages Carry the Term

When we say:

```text
"A tells followers it is leader"
```

this does not necessarily mean there is a literal message:

```text
I_AM_LEADER
```

Instead, a leader naturally sends messages such as:

```text
Heartbeats

Replication messages

Coordination commands
```

These messages include the current term.

Example:

```text
A → heartbeat(term=7) → C
```

C can compare the incoming term with the newest term it knows.

---

# 34. Detecting a Stale Leader

Suppose:

```text
A believes:

term = 7
```

But C already participated in:

```text
term = 8
```

A reconnects:

```text
A ── heartbeat(term=7) ──→ C
```

C compares:

```text
incoming term = 7

current term = 8
```

Since:

```text
7 < 8
```

A's leadership information is stale.

Therefore C should not accept A as the current leader.

---

# 35. Old Leader Must Step Down

The protection should not exist only on followers.

Suppose A eventually receives a valid message containing:

```text
term = 8
```

while A believes:

```text
term = 7
```

A now learns:

```text
There has been a newer election.
```

Therefore:

```text
A must stop acting as leader
        ↓
update its term
        ↓
become follower
```

Rule:

> **When a node discovers a newer valid term, it must recognize that its older leadership is stale and step down.**

---

# 36. Connection to Fencing Tokens

There is a useful conceptual connection to distributed locks.

Distributed lock:

```text
A → fencing token 41

B → fencing token 42
```

The newer token helps distinguish:

```text
old ownership
vs
new ownership
```

Leader election:

```text
A → term 7

B → term 8
```

The newer term helps distinguish:

```text
old leadership
vs
new leadership
```

They are not identical mechanisms, but the intuition is similar:

> **Monotonically increasing generations help identify stale authority.**

---

# 37. Split Vote

Suppose:

```text
5 nodes

A = old leader and unavailable

B C D E = followers
```

B and C time out at approximately the same time.

Both become candidates.

Votes:

```text
B gets:

B
D

= 2 votes


C gets:

C
E

= 2 votes
```

A is unavailable.

Nobody reaches:

```text
3 / 5
```

Therefore:

```text
No candidate becomes leader.
```

This is a:

> **Split vote**

---

# 38. Split Vote Does Not Break Safety

A split vote means:

```text
Nobody obtained quorum.
```

Therefore nobody should declare itself leader.

The cluster temporarily has:

```text
No leader
```

This hurts:

> **Liveness / availability**

but preserves:

> **Safety**

The important rule remains:

```text
No quorum
→ no valid leader
```

---

# 39. Retrying After a Split Vote

A failed election is not permanent.

Followers/candidates again wait for randomized election timeouts.

Eventually:

```text
another timeout expires
        ↓
new election begins
        ↓
newer term
```

Example:

```text
Term 9

B → 2 votes
C → 2 votes

No leader ❌
```

Later:

```text
Term 10

D becomes candidate
      ↓
D gets 3 votes
      ↓
D becomes leader ✅
```

Therefore:

> **A split vote increases election convergence time, but the cluster can retry in a newer term.**

---

# 40. Why Randomization Matters Again

Without randomized timeouts:

```text
B timeout
C timeout
D timeout
E timeout
```

could repeatedly happen together.

Then:

```text
Term 9
→ split vote

Term 10
→ split vote

Term 11
→ split vote
```

The cluster might struggle to converge.

Randomization spreads candidate starts:

```text
B → 170 ms

C → 240 ms

D → 310 ms

E → 390 ms
```

Now B has a better chance to request votes before the others become candidates.

---

# 41. Election Safety vs Election Speed

This distinction is useful in interviews.

Mechanisms such as:

```text
Quorum

One vote per term

Terms / epochs
```

primarily protect:

> **Election correctness / safety**

Mechanisms such as:

```text
Randomized election timeout
```

primarily help:

> **Election convergence / liveness**

A good election mechanism needs both.

---

# 42. Leader Failover Is Not Instant

Leader election provides high availability, but failure recovery still takes time.

Suppose:

```text
A = Leader
```

A crashes.

Recovery looks roughly like:

```text
A crashes
    ↓
heartbeats stop
    ↓
followers wait
    ↓
election timeout expires
    ↓
candidate starts election
    ↓
votes collected
    ↓
new leader elected
    ↓
leader functionality resumes
```

The time between:

```text
old leader failure
```

and:

```text
new leader becoming usable
```

is part of the failover cost.

---

# 43. Election Timeout Affects Failover Time

Suppose:

```text
Election timeout = 10 sec
```

If the leader really dies, followers may spend several seconds waiting before beginning an election.

This increases:

```text
leader failover latency
```

But choosing:

```text
Election timeout = 500 ms
```

may cause temporary network delays or process pauses to trigger unnecessary elections.

Therefore timeout configuration balances:

```text
Fast real failure recovery
```

against:

```text
Election stability
```

---

# 44. Leadership Churn

Suppose production looks like:

```text
A = Leader

↓ 2 minutes

B = Leader

↓ 3 minutes

C = Leader

↓ 1 minute

D = Leader
```

even though nodes are not actually crashing.

This is:

> **Leadership churn**

Possible causes include:

```text
Election timeout too aggressive

Network latency

Packet loss

Leader CPU pressure

Long process pauses

Resource exhaustion
```

Frequent elections can temporarily interrupt leader-owned functionality and increase coordination overhead.

---

# 45. Losing Quorum While Still Alive

A particularly important scenario is:

```text
A = Leader
```

A becomes isolated from the majority.

Suppose:

```text
5 nodes
```

Partition:

```text
Side 1:

A B


Side 2:

C D E
```

A is alive and may still be able to communicate with B and some clients.

But:

```text
A + B = 2 / 5
```

A no longer has access to a majority.

Meanwhile:

```text
C + D + E = 3 / 5
```

can potentially establish newer leadership.

---

# 46. Old Leader Should Not Continue Authoritative Work

If A continues leader-only writes:

```text
A → writes on Side 1
```

while the majority elects:

```text
C → new leader
```

then:

```text
A performing leader writes

+

C performing leader writes
```

can create conflicting authority.

Therefore:

> **A leader that can no longer establish/maintain the required authority should stop performing authoritative leader-only work.**

This follows the same principle encountered with distributed locks:

```text
Cannot prove authority
        ↓
Do not assume authority
```

---

# 47. Fail Closed Under Leadership Uncertainty

Suppose the leader cannot determine whether:

```text
it still has valid leadership
```

or:

```text
a majority has moved on
and elected a newer leader
```

Continuing writes favors availability:

```text
"I might still be leader,
so I'll continue."
```

but risks split brain.

Stopping leader-only work favors correctness:

```text
"I cannot establish valid authority,
so I will stop."
```

For correctness-sensitive leader-owned operations:

> **Uncertainty should generally fail closed rather than allow conflicting authoritative leaders.**

---

# 48. What Leader Election Guarantees

Leader election helps answer:

```text
Who should currently coordinate
this leader-owned responsibility?
```

It provides mechanisms for:

```text
Selecting leadership

Replacing failed leaders

Rejecting stale leadership

Preventing minority partitions
from establishing authority
```

But it does NOT automatically guarantee that the business operation performed by a leader executes exactly once.

---

# 49. Leader Election ≠ Exactly Once

Suppose:

```text
A = Leader
```

A starts:

```text
Job 123
```

Execution:

```text
Step 1 ✅
Step 2 ✅
Step 3 ...
```

A crashes.

B becomes leader.

B now needs to determine what to do with:

```text
Job 123
```

Leader election tells B:

```text
"You are now the leader."
```

It does not automatically tell B:

```text
which business effects from A
already completed.
```

---

# 50. Safe Business Processing After Failover

Depending on the workload, safe failover may require additional mechanisms.

## Transaction

If the operation fits inside one transactional boundary:

```text
BEGIN

business operations

COMMIT
```

then failure can preserve atomicity.

---

## Idempotency

If retry is possible:

```text
A attempts Job 123
      ↓
A crashes
      ↓
B retries Job 123
```

idempotency can ensure:

```text
multiple attempts
→ one business effect
```

---

## Persisted Workflow State

For multi-step work:

```text
Job 123

Step 1 = DONE
Step 2 = DONE
Step 3 = PENDING
```

The new leader can inspect persisted state and determine what remains.

Therefore:

> **Leader election determines current authority; application-level mechanisms make failover of business work safe.**

---

# 51. Part 2 Mental Model

Election flow:

```text
Follower
    ↓
election timeout
    ↓
Candidate
    ↓
increment/start newer term
    ↓
request votes
    ↓
majority?
  /         \
No           Yes
↓             ↓
retry      Leader
```

Safety mechanisms:

```text
Quorum
      +
One vote per term
      +
Increasing terms
      ↓
Prevent conflicting/stale authority
```

Old leader:

```text
A = Leader, term 7
      ↓
partition
      ↓
B elected, term 8
      ↓
A reconnects
      ↓
A discovers term 8
      ↓
A steps down
```

Split election:

```text
No majority
      ↓
No leader
      ↓
randomized timeout
      ↓
new term
      ↓
retry election
```

---

# Part 2 Summary

A follower whose election timeout expires can become a:

```text
Candidate
```

The candidate requests votes and becomes leader only after receiving:

```text
Majority / Quorum
```

Multiple candidates may exist, even with randomized timeouts.

Therefore:

```text
Each node votes at most once per term.
```

Terms/epochs provide monotonically increasing leadership generations:

```text
Term 7
↓
Term 8
↓
Term 9
```

They allow nodes to distinguish:

```text
stale leader
```

from:

```text
newer leadership
```

When an old leader discovers a newer valid term:

```text
step down
↓
become follower
```

If an election splits:

```text
No quorum
→ No leader
→ Retry in newer term
```

This temporarily hurts liveness but preserves safety.

Finally:

```text
Leader Election
≠
Exactly-Once Business Processing
```

Leader election determines:

```text
Who has authority now?
```

Transactions, idempotency, and persisted workflow state may still be needed to answer:

```text
What business work already happened,
and how can the new leader continue safely?
```

Part 3 moves from election mechanics to architecture and scaling:

```text
Global Leader vs Partition Leaders

Leader Bottlenecks

Throughput

Failure Blast Radius

Partition Ownership

Rebalancing

Hot Partitions

Production Design Trade-offs
```
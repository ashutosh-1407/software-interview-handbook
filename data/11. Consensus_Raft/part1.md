# Consensus / Raft — Part 1
## Why Consensus, Roles, Terms, and Leader Election

---

## 1. What Problem Does Consensus Solve?

Leader election answers:

> **Which node should currently coordinate the system?**

But distributed systems need a stronger guarantee:

> **What operations have the cluster agreed happened, and what history must future leaders preserve?**

Consider five replicas:

```text
A = Leader

Client → A: SET balance = 500

A writes locally
A → B
A → C
A crashes
```

A new leader must not simply start accepting writes without understanding the history established before the crash.

Raft provides consensus over an **ordered log of operations**.

```text
Leader Election
→ Who can lead?

Raft Consensus
→ Who can lead?
→ What operations were agreed upon?
→ In what order?
→ What history must future leaders preserve?
```

---

## 2. Core Raft Model

A Raft cluster commonly contains an odd number of voting servers:

```text
A
B
C
D
E
```

For five servers:

```text
Majority = 3
```

The cluster can therefore continue making progress with up to two unavailable servers:

```text
5 nodes → tolerate 2 failures
3 nodes → tolerate 1 failure
```

If only two of five servers remain:

```text
A ❌
B ❌
C ❌
D ✅
E ✅

2/5
→ no majority
→ cannot elect leader
→ cannot commit new writes
```

Raft favors safety over continuing writes without a quorum.

---

## 3. Raft Roles

Every server is in one of three roles:

```text
Follower
Candidate
Leader
```

Normal lifecycle:

```text
Follower
   ↓ election timeout
Candidate
   ↓ majority votes
Leader
```

If a node discovers a higher term:

```text
Leader/Candidate
      ↓
   Follower
```

### Follower

Normally:

- receives leader heartbeats/log replication
- responds to requests
- votes during elections

### Candidate

A follower becomes a candidate when it stops hearing from the leader long enough.

It:

```text
increments its term
votes for itself
requests votes
```

If it gets a majority:

```text
Candidate → Leader
```

### Leader

The leader:

```text
receives client writes
↓
appends commands to its log
↓
replicates them
↓
establishes commitment
```

---

## 4. Election Timeouts

The leader periodically sends heartbeats.

```text
Leader
  ↓
heartbeat
  ↓
Followers
```

If a follower stops receiving them:

```text
heartbeat missing
↓
election timeout
↓
start election
```

But a timeout does **not** prove that the leader crashed.

It could mean:

```text
leader crashed
network partition
packet delay
CPU overload
GC pause
```

Important principle:

> **A timeout tells us communication failed within some period; it does not tell us why.**

---

## 5. Why Election Timeouts Are Randomized

Suppose every follower used exactly the same timeout.

```text
B timeout
C timeout
D timeout
E timeout
```

They could all become candidates simultaneously.

Votes might split:

```text
B gets 2
C gets 2
D gets 1

Nobody has majority.
```

Raft therefore randomizes election timeouts.

```text
B → 170 ms
C → 230 ms
D → 290 ms
E → 310 ms
```

B may start first and gather votes before the others become candidates.

This reduces repeated split elections and improves convergence.

---

## 6. Election Safety

Within one term:

> **A server grants at most one vote.**

Therefore two candidates cannot both obtain a majority in the same term.

For five nodes:

```text
Majority = 3
```

Two different sets of three must overlap.

Since the overlapping server cannot vote twice in the same term:

> **At most one leader can be elected per term.**

This is Raft's **Election Safety** property.

---

# Terms

## 7. What Is a Term?

A **term** is a monotonically increasing logical leadership era.

```text
Term 1 → A leader
Term 2 → B leader
Term 3 → C leader
```

Think:

```text
Term ≈ leadership version
```

Every server maintains:

```text
currentTerm
```

and Raft messages carry a term.

---

## 8. Why Terms Matter

Suppose:

```text
Term 5

A = Leader
```

A becomes partitioned:

```text
A      ❌      B C D E
```

B/C/D/E can still form a majority and elect B:

```text
Term 6

B = Leader
```

A might still believe:

```text
"I'm the leader of Term 5."
```

This is possible because A has not yet heard about Term 6.

But when A receives a Term-6 message:

```text
A.currentTerm = 5
incomingTerm   = 6
```

A knows its leadership is stale:

```text
6 > 5

→ update currentTerm
→ step down
→ become follower
```

Likewise, nodes already in Term 6 reject stale Term-5 authority.

So:

```text
Terms
→ distinguish newer leadership from stale leadership
```

---

## 9. Terms Don't Instantly Stop an Isolated Leader

An important nuance:

```text
A = Leader, Term 8
```

A becomes isolated.

Meanwhile:

```text
B/C/D/E
→ elect B
→ Term 9
```

A does **not magically know** Term 9 exists.

A may still accept a client request and append it locally.

But:

```text
A cannot reach majority
→ cannot commit the write
```

Once A eventually receives a Term-9 message:

```text
9 > 8
→ A steps down
```

This gives us two different protections:

```text
Majority requirement
→ stale isolated leader cannot commit

Terms
→ stale leader steps down once newer leadership is discovered
```

---

# Majority and Consensus

## 10. Why Majority Matters

Consider:

```text
A = Leader

X replicated to:

A ✅
B ✅
C ✅
D ❌
E ❌
```

Three of five servers have X:

```text
3/5 = majority
```

Majorities have an important mathematical property:

> **Any two majorities overlap.**

For five nodes:

```text
Old majority:
A B C

Future majority:
B D E

Overlap:
B
```

There must always be at least one overlapping server.

But majority overlap **alone** is not sufficient for Raft safety.

Raft also needs voting restrictions that prevent stale candidates from winning elections.

---

# Log Freshness During Elections

## 11. Why Not Every Candidate Can Become Leader

Suppose:

```text
A: [X][Y]
B: [X][Y]
C: [X][Y]
D: [X]
E: [X]
```

If `Y` is committed, a future leader must not lose it.

A stale candidate such as D should therefore not simply be able to gather votes and replace the established history.

Before voting, a server checks whether the candidate's log is sufficiently up-to-date.

---

## 12. Exact Raft Log Freshness Rule

Raft compares:

```text
1. lastLogTerm
2. lastLogIndex
```

The term is compared **first**.

A candidate is at least as up-to-date when:

```text
candidate.lastLogTerm > voter.lastLogTerm
```

or:

```text
candidate.lastLogTerm == voter.lastLogTerm

AND

candidate.lastLogIndex >= voter.lastLogIndex
```

---

## 13. Example — Term Wins First

Candidate B:

```text
lastLogTerm  = 8
lastLogIndex = 10
```

Candidate C:

```text
lastLogTerm  = 7
lastLogIndex = 100
```

B is considered more up-to-date.

Why?

```text
B last term = 8
C last term = 7

8 > 7
```

Even though C has many more entries:

```text
100 > 10
```

the newer **last log term** wins.

Rule:

```text
Compare lastLogTerm first.
```

---

## 14. Example — Index Breaks a Tie

Now:

```text
B:
lastLogTerm  = 8
lastLogIndex = 10

C:
lastLogTerm  = 8
lastLogIndex = 15
```

The terms are equal.

Therefore compare indexes:

```text
15 > 10
```

C is more up-to-date.

Remember:

```text
Higher lastLogTerm wins
        ↓ tie
Higher lastLogIndex wins
```

---

# Committed vs Uncommitted History

## 15. Writing to the Log Is Not Commitment

Suppose:

```text
A = Leader

X replicated:

A ✅
B ✅
C ❌
D ❌
E ❌
```

Only two servers have X.

```text
2/5
→ no majority
→ X is uncommitted
```

If A crashes:

```text
X may survive
OR
X may eventually disappear
```

Raft has made no durability guarantee for X yet.

---

## 16. Uncommitted Entries Can Survive

Suppose B later legitimately becomes leader and still contains X.

It may replicate X:

```text
B ✅
C ✅
D ✅
```

If the Raft commit rules are satisfied, X can eventually become committed.

Therefore:

```text
uncommitted
≠
must be deleted
```

It means:

```text
uncommitted
=
not guaranteed to survive
```

---

## 17. Uncommitted Entries Can Also Disappear

Suppose:

```text
A: [1][2][3][X]
B: [1][2][3][X]
C: [1][2][3]
D: [1][2][3]
E: [1][2][3]

X = uncommitted
```

A crashes and B is unavailable.

C can potentially obtain:

```text
C + D + E
= 3 votes
```

and legitimately become leader without X.

When B later returns, its uncommitted conflicting suffix can be repaired to match the current leader.

So:

```text
Uncommitted X
→ may be overwritten
```

This does **not** violate Raft safety.

---

## 18. Committed Entries Are Different

Suppose X has been safely committed.

Then:

> **Every future legitimate leader must preserve X.**

This is part of Raft's **Leader Completeness** guarantee.

Conceptually:

```text
Uncommitted entry
→ may survive
→ may disappear

Committed entry
→ must survive future leadership changes
```

This distinction is fundamental to Raft.

---

# Mental Model

Raft combines several mechanisms:

```text
Terms
→ identify leadership eras

Randomized election timeouts
→ reduce split elections

Majority voting
→ elect a leader

Log freshness checks
→ prevent stale candidates from winning

Majority-based commitment
→ establish agreed history

Leader Completeness
→ preserve committed history across future leaders
```

The high-level goal is:

> **All servers eventually agree on the same committed, ordered history of operations, even when leaders crash and elections occur.**

---

# Part 1 Interview Takeaways

```text
Leader Election
→ decides who coordinates

Consensus
→ decides what history the cluster agrees upon
```

```text
Follower
→ timeout
→ Candidate
→ majority vote
→ Leader
```

```text
Term
→ monotonically increasing leadership era
```

```text
Higher term discovered
→ update term
→ step down to follower
```

```text
Election freshness:

higher lastLogTerm
→ wins

same lastLogTerm
→ higher lastLogIndex wins
```

```text
Uncommitted
→ not guaranteed to survive

Committed
→ must survive future legitimate leaders
```

```text
5-node cluster
→ majority = 3
→ remains available with at most 2 failed/unavailable nodes
```

**Core interview principle:**

> Raft is not merely a mechanism for electing a leader. It ensures that leadership changes cannot discard the history the cluster has already safely agreed upon.
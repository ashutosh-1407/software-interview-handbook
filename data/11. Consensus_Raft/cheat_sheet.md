# Consensus / Raft — Interview Cheat Sheet

---

## 1. What Problem Does Raft Solve?

```text
Leader Election
→ Who leads?

Raft Consensus
→ Who leads?
→ What operations are agreed upon?
→ In what order?
→ What history must survive leader changes?
```

> **Raft makes replicas agree on one ordered, committed log despite crashes, partitions, and leader changes.**

---

## 2. Roles

```text
Follower
   ↓ election timeout
Candidate
   ↓ majority votes
Leader
```

Higher term discovered:

```text
Leader/Candidate
→ Follower
```

---

## 3. Terms

```text
Term = leadership era/version

Term 5 → A leader
Term 6 → B leader
```

If A is still in Term 5 and discovers Term 6:

```text
6 > 5
→ update term
→ step down
```

Important:

```text
Old leader may not KNOW it is stale.

No majority
→ cannot commit

Higher term discovered
→ step down
```

---

## 4. Majority

```text
3 nodes → majority 2 → tolerate 1 failure
5 nodes → majority 3 → tolerate 2 failures
7 nodes → majority 4 → tolerate 3 failures
```

No majority:

```text
→ cannot elect leader
→ cannot commit new writes
```

---

## 5. Randomized Election Timeout

Without randomization:

```text
multiple followers timeout together
→ multiple candidates
→ split votes
→ election takes longer
```

Randomized timeouts reduce simultaneous elections.

```text
Timeout
≠ leader definitely dead

Could be:
network / GC / overload / partition / crash
```

---

## 6. Voting — Log Freshness

Candidate must have a sufficiently up-to-date log.

Compare:

```text
1. lastLogTerm
2. lastLogIndex
```

Rule:

```text
Higher lastLogTerm wins

If equal:
→ higher lastLogIndex wins
```

Example:

```text
B: term 8, index 10
C: term 7, index 100

B is more up-to-date ✅
```

Term is checked first.

---

## 7. Write Flow

```text
Client
  ↓
Leader appends entry
  ↓
AppendEntries
  ↓
replicate
  ↓
commit
  ↓
apply to state machine
  ↓
respond
```

Remember:

```text
Written
≠
Replicated somewhere
≠
Committed
≠
Applied
```

---

## 8. Log Entry

Conceptually:

```text
Log Entry
├── index
├── term
└── command
```

Example:

```text
Index:   1  2  3  4
Term:    1  1  2  3
Command: A  B  C  D
```

---

## 9. AppendEntries Consistency

Leader sends:

```text
prevLogIndex
prevLogTerm
```

Meaning:

> **Does your history match mine immediately before the entries I'm sending?**

Mismatch:

```text
reject
↓
leader finds matching prefix
↓
remove follower's conflicting uncommitted suffix
↓
replicate leader's suffix
```

---

## 10. Log Matching

> **Same index + same term → identical history through that entry.**

Example:

```text
Leader:
[A][B][C][D][E]

Follower:
[A][B][C][X][Y]

match through 3
→ preserve 1..3
→ repair starting at 4
```

---

## 11. `matchIndex` vs `nextIndex`

```text
matchIndex[B]
→ highest index leader KNOWS B has replicated

nextIndex[B]
→ next index leader should send B
```

Example:

```text
matchIndex[B] = 3
nextIndex[B]  = 4
```

Memory:

```text
matchIndex = how far caught up?
nextIndex  = where continue?
```

---

## 12. Three Important Indexes

```text
lastLogIndex
→ HAVE

commitIndex
→ COMMITTED

lastApplied
→ EXECUTED
```

Example:

```text
lastLogIndex = 10
commitIndex  = 8
lastApplied  = 6
```

```text
1 ───── 6 | 7 ─ 8 | 9 ─ 10
 applied  |committed| logged
          |not      | only
          |applied  |
```

---

## 13. Commit Is a Prefix

```text
commitIndex = 10

→ entries 1..10 committed
```

Never:

```text
8 committed
9 uncommitted
10 committed
```

Think:

```text
[ COMMITTED PREFIX ] | [ UNCOMMITTED SUFFIX ]
```

---

## 14. Current-Term Commit Rule

Leader directly advances `commitIndex` to `N` when:

```text
majority has replicated N
+
log[N].term == currentTerm
```

Example:

```text
currentTerm = 12
index 21    = term 12

A ✅
B ✅
C ✅
D ❌
E ❌

→ majority
→ commit 21
```

---

## 15. Older-Term Entry

```text
currentTerm = 12

index 20 → term 11
index 21 → term 12
```

If `21` reaches majority:

```text
21 committed
↓
entire prefix committed
↓
20 committed too
```

Memory:

```text
Current-term entry
→ directly commit via majority

Older-term entries
→ committed indirectly through later
  current-term committed entry
```

---

## 16. Uncommitted vs Committed

### Uncommitted

```text
may survive
OR
may be overwritten
```

Example:

```text
A: [...][X]
B: [...][X]
C: [...]
D: [...]
E: [...]

X = 2/5
→ uncommitted
```

If C/D/E elect C:

```text
C can become leader without X
→ B's X may eventually be overwritten
```

### Committed

```text
must survive every future legitimate leader
```

---

## 17. Partition Example

```text
A B       |       C D E

A = old leader
```

C/D/E:

```text
3/5
→ elect C in higher term
```

Write `X` to A:

```text
A + B = 2/5
→ cannot commit
```

Write `Y` to C:

```text
C + D + E = 3/5
→ can commit
```

Partition heals:

```text
A discovers higher term
→ steps down

uncommitted X
→ may be removed

committed Y
→ preserved and replicated everywhere
```

---

## 18. Client Timeout

```text
Client → DEDUCT $100

Leader:
append
→ replicate
→ commit
→ crashes before response
```

Client sees:

```text
timeout
```

But:

```text
timeout
≠ operation failed

timeout
= outcome unknown
```

Retry may duplicate operation.

Solution:

```text
request_id = abc123
+
deduplication
```

Raft:

```text
agrees on commands/order
```

Deduplication:

```text
prevents duplicate logical execution
```

---

## 19. Raft Safety Properties

### Election Safety

```text
At most one leader elected per term.
```

### Leader Append-Only

```text
Leader never overwrites/deletes
its own log entries.
```

### Log Matching

```text
Same index + term
→ same history through that point.
```

### Leader Completeness

```text
Committed entry
→ present in every future legitimate leader.
```

### State Machine Safety

```text
If one server applies X at index N,
another server can never apply Y at index N.
```

---

## 20. Linearizable Reads

Danger:

```text
A = old isolated leader

Client → A: GET balance
```

A may return stale state.

Strong read needs:

```text
confirm current leadership
↓
identify required commit point
↓
wait until state machine applied through it
↓
read
```

### ReadIndex

```text
Linearizable read
WITHOUT putting every GET into Raft log.
```

---

## 21. Snapshots

Log cannot grow forever.

```text
Committed
→ Applied
→ Snapshot
→ Compact old log
```

Example:

```text
Snapshot through index 1,000,000
+
log entries after 1,000,000
```

Never snapshot speculative uncommitted state.

Why?

```text
uncommitted history may later change
```

Snapshots also help severely lagging followers catch up efficiently.

---

## 22. Safety vs Liveness

```text
Safety
→ don't make an incorrect decision

Liveness
→ eventually make progress
```

Raft without quorum:

```text
cannot make progress
BUT
does not violate committed history
```

---

## 23. Production Metrics

Watch:

```text
current term
leader changes
election frequency
quorum health

commitIndex
lastApplied

matchIndex / replication lag
AppendEntries failures/latency

snapshot failures
```

Useful signals:

```text
Frequent elections
→ network / GC / CPU / timeout issue

commitIndex >> lastApplied
→ state-machine application lag

Follower matchIndex far behind
→ replication/network/disk problem
```

---

# Common Interview Traps

```text
❌ Longest log wins

✅ Higher lastLogTerm first,
   then lastLogIndex
```

```text
❌ Entry exists on some replicas
   → must survive

✅ Only committed history
   is guaranteed to survive
```

```text
❌ Uncommitted entry must disappear

✅ It may survive OR disappear
```

```text
❌ Old leader instantly knows
   a new leader exists

✅ It learns when it sees
   a higher term
```

```text
❌ Cannot reach majority
   → another leader definitely exists

✅ Could simply be network/follower failure
```

```text
❌ Read from leader
   → automatically linearizable

✅ Must establish current leadership
   and applied commit point
```

```text
❌ Raft gives exactly-once requests

✅ Client retries still need
   request ID + deduplication
```

---

# 30-Second Interview Answer

> **Raft is a leader-based consensus algorithm that lets replicas agree on an ordered log despite crashes and network partitions. Nodes operate as followers, candidates, or leaders, with terms representing leadership eras. Candidates require a majority and must satisfy log-freshness rules. The leader replicates commands using AppendEntries, establishes a safe committed prefix, and replicas apply committed entries to their state machines. Log Matching and Leader Completeness ensure committed history survives leadership changes, while uncommitted conflicting entries may be overwritten.**

---

# Final Mental Model

```text
RAFT

Election
→ Term + Majority + Log Freshness

Write
→ Append → Replicate → Commit → Apply

Consistency
→ prevLogIndex + prevLogTerm
→ Log Matching

Follower Progress
→ matchIndex + nextIndex

Commit
→ Majority + Current-Term Rule

Failure
→ Uncommitted may disappear
→ Committed must survive

Stale Leader
→ Cannot commit without majority
→ Higher term → step down

Client Retry
→ request_id + dedup

Strong Read
→ Confirm leadership + applied state

Large Log
→ Snapshot + Compaction
```

> **The one sentence to remember: Raft ensures that despite failures and leader changes, replicas converge on one safe, ordered, committed history.**
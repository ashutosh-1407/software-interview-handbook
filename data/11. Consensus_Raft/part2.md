# Consensus / Raft — Part 2
## Log Replication, Consistency, and Commitment

---

# 1. The Raft Log

Raft replicates an **ordered log of commands**.

```text
Client command
→ append to leader log
→ replicate
→ commit
→ apply to state machine
```

Each entry contains conceptually:

```text
index
term
command
```

Example:

```text
Index:    1     2     3
Term:     1     1     2
Command:  A     B     C
```

The log is the agreed history.

The **state machine** is the actual application state produced by executing committed commands.

```text
Log
→ ordered operations

State machine
→ resulting application state
```

---

# 2. Normal Write Flow

Suppose the leader receives:

```text
SET balance = 900
```

Flow:

```text
Client
  ↓
Leader appends entry
  ↓
replicates to followers
  ↓
establishes commitment
  ↓
applies to state machine
  ↓
returns success
```

Important:

```text
Written to log
≠
Committed
≠
Applied
```

If the leader cannot reach enough replicas:

```text
cannot reach majority
→ cannot commit
```

This does not necessarily mean another leader exists.

It could simply be:

```text
network delay
partition
crashed follower
overloaded follower
```

---

# 3. Detecting Divergent Logs

Suppose:

```text
Leader:

Index: 1  2  3  4  5
Term:  1  1  2  3  3
       A  B  C  D  E
```

Follower:

```text
Index: 1  2  3  4  5
Term:  1  1  2  2  2
       A  B  C  X  Y
```

They agree through index `3` and diverge afterward.

Raft uses:

```text
prevLogIndex
prevLogTerm
```

in `AppendEntries`.

The leader is effectively asking:

> Does your log match mine immediately before the entries I'm sending?

If not:

```text
AppendEntries rejected
→ leader backs up
→ finds matching prefix
→ repairs follower
```

Eventually:

```text
Follower before:

[A][B][C][X][Y]

Follower after:

[A][B][C][D][E]
```

The conflicting **uncommitted suffix** is removed.

---

# 4. Why Check Both Index and Term?

Same index does not necessarily mean same history.

```text
Leader:
index 4 → term 3 → D

Follower:
index 4 → term 2 → X
```

Therefore Raft checks:

```text
index + term
```

This gives the **Log Matching Property**:

> If two logs contain an entry with the same index and term, their logs are identical through that entry.

---

# 5. `matchIndex` and `nextIndex`

The leader tracks follower replication progress.

### `matchIndex[B]`

Highest index the leader knows is successfully replicated on B.

```text
matchIndex[B] = 3
```

means:

```text
B matches leader through index 3
```

### `nextIndex[B]`

Next index the leader should try sending to B.

```text
matchIndex[B] = 3
nextIndex[B]  = 4
```

Mental model:

```text
matchIndex
→ How far has B caught up?

nextIndex
→ Where should I continue sending?
```

If replication fails:

```text
try 4 ❌
try 3 ❌
2 matches ✅

→ keep through 2
→ repair starting from 3
```

Real implementations can optimize this rather than backing up one entry at a time.

---

# 6. `lastLogIndex`, `commitIndex`, `lastApplied`

These track different stages:

```text
lastLogIndex
→ how much log I HAVE

commitIndex
→ how much is COMMITTED

lastApplied
→ how much I have EXECUTED
```

Example:

```text
lastLogIndex = 10
commitIndex  = 8
lastApplied  = 6
```

Meaning:

```text
1 ────── 6 | 7 ── 8 | 9 ── 10
  applied  | committed| logged
           | not yet  | only
           | applied  |
```

Entries `7–8` are committed but still need to be applied.

---

# 7. Commit Is a Prefix

Raft commits an ordered prefix.

If:

```text
commitIndex = 8
```

then:

```text
1..8 are committed
```

Conceptually:

```text
[ committed prefix ] | [ uncommitted suffix ]
```

Not:

```text
5 committed
6 uncommitted
7 committed
```

---

# 8. Current-Term Commit Rule

There is an important nuance to:

```text
majority replication → committed
```

A leader directly advances `commitIndex` to `N` when:

```text
majority has replicated N

AND

log[N].term == currentTerm
```

Example:

```text
currentTerm = 12
index 21    = term 12

matchIndex:

A = 21
B = 21
C = 21
D = 20
E = 18
```

Index 21 exists on:

```text
A ✅
B ✅
C ✅

3/5 → majority
```

and:

```text
log[21].term == currentTerm
```

Therefore:

```text
commitIndex → 21
```

---

# 9. Older-Term Entries

Suppose:

```text
currentTerm = 9

index 10 → term 8
```

Even if a majority currently contains index 10, the Term-9 leader does **not** directly commit it merely by counting replicas.

Instead, it can append a current-term entry:

```text
index 10 → term 8 → X
index 11 → term 9 → N
```

If index 11 reaches a majority:

```text
log[11].term == currentTerm
+
majority replication
```

then:

```text
commitIndex = 11
```

Since commitment covers the entire prefix:

```text
index 10 → committed ✅
index 11 → committed ✅
```

So:

```text
Current-term entry
→ can be directly committed by majority

Older-term entries
→ become committed indirectly when a later
  current-term entry commits
```

---

# 10. Followers Learning the Commit Point

Replication and knowing an entry is committed are separate.

Suppose:

```text
A = Leader

index 21:

A ✅
B ✅
C ✅

→ committed
```

A crashes before telling B/C:

```text
commitIndex = 21
```

B and C may temporarily have:

```text
entry 21 in log
commitIndex = 20
```

Entry 21 is **still committed**.

They simply haven't learned the new commit point yet.

The leader communicates this through:

```text
AppendEntries
→ leaderCommit
```

Followers then advance their `commitIndex` and apply newly committed entries.

---

# 11. Leader Crash During a Write

Three useful cases:

### Before sufficient replication

```text
A appends X
→ crashes

X uncommitted
→ may disappear
```

### Partial replication

```text
A ✅
B ✅
others ❌

→ no majority
→ X uncommitted
→ may survive or disappear
```

### After commitment

```text
A ✅
B ✅
C ✅

→ committed
```

If A crashes:

```text
X must survive future legitimate leaders
```

---

# 12. Commit Before Client Response

Suppose:

```text
Client → DEDUCT $100

Leader
→ appends
→ replicates
→ commits
→ crashes before response
```

The system knows:

```text
DEDUCT $100 committed
```

But the client sees:

```text
timeout
```

The client doesn't know whether the request committed.

If it blindly retries:

```text
DEDUCT $100
DEDUCT $100

→ duplicate execution
```

Use a unique request ID:

```text
request_id = abc123
command    = DEDUCT $100
```

Retry with the same ID:

```text
abc123 already processed
→ return previous result
→ don't execute again
```

Therefore:

```text
Raft
→ agrees on commands and ordering

Request-ID deduplication
→ protects against duplicate client retries
```

---

# Part 2 Interview Takeaways

```text
Client write
→ append
→ replicate
→ commit
→ apply
```

```text
prevLogIndex + prevLogTerm
→ find matching history
→ repair conflicting suffix
```

```text
matchIndex
→ how far follower has replicated

nextIndex
→ where leader sends next
```

```text
lastLogIndex
→ HAVE

commitIndex
→ COMMITTED

lastApplied
→ EXECUTED
```

```text
Direct commit of N:

majority replicated N
+
log[N].term == currentTerm
```

```text
Commit current-term entry
→ commits entire preceding prefix
→ older-term entries become committed too
```

```text
Committed before response + client timeout
→ outcome unknown to client
→ retry using request_id + deduplication
```

**Core principle:**

> Raft repairs replicas to a common log, commits a safe prefix of that log, and applies only committed operations to the state machine.
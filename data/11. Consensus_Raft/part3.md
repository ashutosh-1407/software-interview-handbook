# Consensus / Raft — Part 3
## Failure Handling, Safety, Reads, and Snapshots

---

# 1. Leader Completeness

One of Raft's most important guarantees is:

> **If an entry is committed, every future legitimate leader must contain that entry.**

Suppose:

```text
X committed:

A ✅
B ✅
C ✅
D ❌
E ❌
```

Later a new election occurs.

Raft combines:

```text
majority-based commitment
+
majority-based elections
+
log freshness voting
+
commit rules
```

to prevent a future legitimate leader from losing committed history.

This is the **Leader Completeness Property**.

```text
Uncommitted entry
→ may disappear

Committed entry
→ must survive future leaders
```

---

# 2. Old Leader During a Partition

Suppose:

```text
Term 10

A = Leader

A B       |       C D E
```

The partition separates the cluster.

A still believes it is leader.

Meanwhile:

```text
C/D/E
→ majority
→ elect C
→ Term 11
```

Now two nodes may temporarily **believe** they are leaders:

```text
A → Term 10
C → Term 11
```

But only C has the majority necessary to make progress.

---

# 3. Writes During the Partition

Client sends `X` to A:

```text
A → X
B → X

2/5
→ no majority
→ X cannot commit
```

Another client sends `Y` to C:

```text
C → Y
D → Y
E → Y

3/5
→ majority
→ Y can commit
```

So:

```text
minority-side old leader
→ may append
→ cannot commit

majority-side new leader
→ can commit
```

---

# 4. When the Partition Heals

Eventually A receives a message from Term 11:

```text
A.currentTerm = 10
incomingTerm   = 11
```

Therefore:

```text
A steps down
→ becomes follower
```

C then repairs A/B's logs.

The old conflicting `X` was uncommitted:

```text
X
→ may be removed
```

The committed `Y`:

```text
Y
→ must survive
→ eventually replicated everywhere
```

Eventually:

```text
A B C D E
↓
same committed history
```

---

# 5. Raft Safety Properties

Raft is commonly described through several safety properties.

### Election Safety

> At most one leader can be elected in a given term.

```text
one vote per server per term
+
majority requirement
```

prevents two candidates from both obtaining a majority in the same term.

---

### Leader Append-Only

> A leader never overwrites or deletes entries in its own log.

Leaders append new entries.

Conflicting entries are repaired on **followers**.

---

### Log Matching

> If two logs contain an entry with the same index and term, their logs are identical through that entry.

This follows from the `AppendEntries` consistency checks.

---

### Leader Completeness

> Every committed entry appears in every future legitimate leader's log.

This prevents leadership changes from losing committed history.

---

### State Machine Safety

> If one server applies a command at a particular log index, no server will ever apply a different command at that index.

This cannot happen:

```text
B:

index 25 → DEDUCT $100
           applied


C:

index 25 → ADD $500
           applied ❌
```

Why?

```text
Applied
↓
Committed
↓
Leader Completeness preserves it
↓
Log Matching maintains consistent history
↓
different command cannot later be applied at index 25
```

---

# 6. Important: Having an Entry Is Not Enough

Suppose:

```text
B:

index 25 → X
```

That alone does **not** mean index 25 can never change.

If X is uncommitted:

```text
X may later be overwritten
```

For example:

```text
A: [...][X]
B: [...][X]
C: [...]
D: [...]
E: [...]

X → 2/5 → uncommitted
```

If A crashes and B is unavailable:

```text
C + D + E
→ election majority
→ C can become leader
```

C does not contain X.

When B eventually returns:

```text
B's uncommitted X
→ can be removed during log repair
```

No safety violation occurs.

The important boundary is:

```text
present in log
≠ protected forever

committed
→ protected

applied
→ necessarily part of committed history
```

---

# 7. Linearizable Reads

Writes naturally go through Raft replication.

Reads introduce another problem.

Suppose:

```text
Term 5:
A = Leader

A becomes isolated

Term 6:
B = Leader
```

A may not yet know Term 6 exists.

A still has application state and may receive:

```text
GET balance
```

Simply reading A's local state could return stale data.

Therefore:

> **Reading from a node that believes it is leader is not automatically a linearizable read.**

---

# 8. Establishing a Strong Read

Before serving a linearizable read, the leader needs to establish that it is still the current leader and that its state machine has applied the required committed state.

Conceptually:

```text
Client GET
   ↓
Leader confirms current authority
with quorum
   ↓
determine required commit point
   ↓
wait until state machine
has applied through that point
   ↓
read locally
   ↓
return result
```

Why wait for application?

Because:

```text
commitIndex = 100
lastApplied = 95
```

means entries:

```text
96..100
```

are committed but not yet reflected in the local application state.

Reading immediately could therefore return stale state.

---

# 9. ReadIndex

A simple but expensive approach would be:

```text
GET
→ put operation into Raft log
→ replicate
→ commit
→ read
```

That would make every read require a new log entry.

Raft implementations can instead use mechanisms such as **ReadIndex**.

Conceptually:

```text
GET
↓
confirm leader is still current
↓
identify commit point read must observe
↓
wait until state machine reaches it
↓
read locally
```

Therefore:

> **ReadIndex enables linearizable reads without appending every read to the replicated log.**

---

# 10. Snapshots and Log Compaction

A long-running Raft cluster may accumulate millions of entries:

```text
1
2
3
...
10,000,000
```

Keeping the entire history forever is unnecessary.

Once a committed prefix has been applied:

```text
log entries
↓
state machine
↓
current application state
```

Raft can create a **snapshot**.

Example:

```text
Snapshot through index 9,000,000
+
log entries after 9,000,000
```

Instead of retaining millions of old commands, the snapshot stores the resulting state.

---

# 11. Why Snapshot Only Applied/Committed State?

Suppose:

```text
1 ───── 800 | 801 ───── 1000
 committed | uncommitted
 applied   |
```

Safe:

```text
snapshot through 800
```

Dangerous:

```text
snapshot through 1000 ❌
```

Entries `801–1000` might later be replaced after a leadership change.

If their effects were already baked into a snapshot:

```text
snapshot = state after 1000
```

we could no longer safely roll back to the committed state.

Therefore:

```text
Committed
↓
Applied
↓
Snapshot
↓
Compact covered log
```

---

# 12. Snapshots Help Lagging Followers

Suppose a follower has been offline for a long time.

Leader:

```text
snapshot through 1,000,000
+
newer log
```

Follower:

```text
only through 50,000
```

Sending almost one million old log entries is inefficient.

Instead:

```text
Leader
→ install snapshot on follower
→ replicate newer remaining entries
```

This allows severely lagging replicas to catch up efficiently.

---

# 13. Safety vs Availability

During a partition:

```text
2-node side
→ cannot form majority
→ cannot commit

3-node side
→ majority
→ can elect leader
→ can continue
```

Raft deliberately refuses unsafe progress on the minority side.

So:

```text
No quorum
→ lose write availability

But
→ preserve safety
```

This connects directly to the distributed-systems principle:

> When the cluster cannot prove that an operation is safe, Raft refuses to commit it.

---

# 14. Production Metrics

Useful Raft monitoring includes:

```text
current term
current leader
leader changes / election rate
commitIndex
lastApplied
replication lag
matchIndex per follower
AppendEntries failures/latency
quorum health
snapshot frequency
snapshot installation failures
```

### Frequent leader changes

Could indicate:

```text
network instability
GC pauses
CPU overload
timeouts too aggressive
```

### Large `commitIndex - lastApplied`

```text
commitIndex = 100,000
lastApplied = 80,000
```

means:

```text
consensus is ahead
but state-machine application is lagging
```

### Follower `matchIndex` far behind

Could indicate:

```text
slow follower
network problems
disk problems
overload
```

---

# 15. Failure Debugging Mental Model

When debugging Raft, ask:

```text
1. Who believes they are leader?

2. What terms are nodes in?

3. Is a majority reachable?

4. How far has each follower replicated?

5. What is commitIndex?

6. What is lastApplied?

7. Are elections happening repeatedly?

8. Are followers rejecting AppendEntries?

9. Is snapshot/catch-up required?
```

These separate:

```text
leadership problem
vs
replication problem
vs
commit problem
vs
state-machine application problem
```

---

# Part 3 Interview Takeaways

```text
Old leader + minority
→ may accept locally
→ cannot commit
```

```text
New leader + majority
→ can commit
```

```text
Partition heals
→ old leader sees higher term
→ steps down
→ conflicting uncommitted suffix repaired
```

Raft safety:

```text
Election Safety
→ one leader per term

Leader Append-Only
→ leaders only append

Log Matching
→ same index + term means same prefix

Leader Completeness
→ committed history survives future leaders

State Machine Safety
→ different commands never applied at same index
```

Strong reads:

```text
confirm current leadership
+
wait for required committed state to be applied
+
read locally
```

Snapshots:

```text
Committed
→ Applied
→ Snapshot
→ Compact old log
```

**Core principle:**

> Raft preserves a single committed history across leader failures, partitions, retries, follower divergence, and log compaction—even when individual nodes temporarily disagree about leadership or contain different uncommitted suffixes.
# Consensus / Raft — Part 4
## Production Considerations, Interview Traps, and Final Mental Model

---

# 1. What Raft Actually Guarantees

Raft's goal is not simply:

```text
"Keep several copies of data."
```

It is:

> **Make replicas agree on one ordered, committed history despite failures and leader changes.**

Conceptually:

```text
Leader Election
→ choose coordinator

Log Replication
→ distribute ordered commands

Commit Rules
→ determine safe history

State Machine
→ execute committed history

Leader Completeness
→ preserve committed history across leaders
```

---

# 2. Safety vs Liveness

Two useful distributed-systems concepts:

### Safety

> Nothing incorrect happens.

For Raft:

```text
committed entries aren't lost
different commands aren't applied at same index
stale leader cannot commit without quorum
```

### Liveness

> The system can eventually make progress.

Raft needs a reachable majority to make progress.

```text
5 nodes

3+ reachable
→ can potentially elect leader
→ can commit

only 2 reachable
→ cannot form majority
→ no new commits
```

So during severe failures:

```text
Raft sacrifices progress
rather than violate safety
```

---

# 3. Raft Assumes Crash/Network Failures

Raft is designed primarily for **non-Byzantine failures** such as:

```text
node crash
network partition
message delay
message loss
slow node
temporary disconnection
```

It does not assume nodes are maliciously sending arbitrary fabricated information.

That is a different class of consensus problem:

```text
Byzantine Fault Tolerance
```

---

# 4. Client Writes Usually Go to the Leader

Typical flow:

```text
Client
  ↓
Follower
```

If the contacted node is not leader:

```text
redirect/reject
→ client finds leader
→ retries
```

Then:

```text
Client
→ Leader
→ Raft replication
→ commit
→ apply
→ response
```

Followers generally do not independently commit client writes.

---

# 5. Client Timeout Does Not Mean Failure

Suppose:

```text
Client
→ Leader
→ command commits
→ Leader crashes before response
```

Client sees:

```text
timeout
```

But:

```text
timeout
≠
operation failed
```

It means:

```text
outcome unknown
```

Therefore retries should use:

```text
request_id
+
deduplication
```

Especially for non-idempotent operations such as:

```text
DEDUCT $100
INCREMENT counter
CREATE order
```

---

# 6. Common Interview Trap — "Majority Means Committed"

Too broad:

```text
Entry on majority
→ always committed ❌
```

Better Raft answer:

```text
Leader directly advances commitIndex to N when:

majority replicated N
AND
log[N].term == currentTerm
```

An older-term entry becomes committed when a later current-term entry at or after it is committed.

---

# 7. Common Interview Trap — "Longest Log Wins"

Incorrect:

```text
candidate with most entries
→ wins freshness comparison ❌
```

Raft compares:

```text
1. lastLogTerm
2. lastLogIndex
```

Example:

```text
B:
term 8
index 10

C:
term 7
index 100
```

B is more up-to-date because:

```text
8 > 7
```

Only when terms tie does index matter.

---

# 8. Common Interview Trap — "Uncommitted Means Deleted"

Incorrect:

```text
uncommitted
→ must be deleted ❌
```

Correct:

```text
uncommitted
→ not guaranteed to survive
```

It may:

```text
survive
→ new leader replicates it
→ eventually commit
```

or:

```text
conflict with future leader
→ be overwritten
```

---

# 9. Common Interview Trap — "Old Leader Immediately Knows"

Suppose:

```text
A = Leader, Term 5
```

A becomes partitioned.

Elsewhere:

```text
B = Leader, Term 6
```

A does not automatically know this.

It may temporarily still believe:

```text
"I'm leader."
```

Safety comes from:

```text
A cannot reach majority
→ cannot commit
```

Once A discovers Term 6:

```text
higher term
→ step down
```

---

# 10. Common Interview Trap — "Read From Leader = Linearizable"

Not necessarily.

An isolated old leader may still think it is leader:

```text
A       |       B C D E
old leader      new leader
```

Reading A's local state could return stale data.

For a strong read, establish:

```text
current leadership
+
required commit point
+
state machine applied through that point
```

Mechanisms such as:

```text
ReadIndex
```

allow this without putting every read into the Raft log.

---

# 11. Common Interview Trap — Consensus Gives Exactly-Once

Raft guarantees agreement on:

```text
commands
+
ordering
```

It does not automatically solve:

```text
client retries
duplicate business operations
```

Use:

```text
request_id
+
deduplication
```

when retry semantics require it.

---

# 12. Membership Changes

Suppose a cluster changes from:

```text
A B C
```

to:

```text
C D E
```

Changing membership carelessly could temporarily create two different groups that each believe they have a majority.

Raft handles configuration changes carefully, commonly using **joint consensus**.

Conceptually:

```text
Old configuration
      ↓
Old + New configuration
      ↓
New configuration
```

The transition prevents two independent configurations from safely making conflicting decisions.

For most interviews, knowing the purpose is enough unless membership changes are specifically discussed.

---

# 13. Snapshot Recovery

If a follower is extremely far behind:

```text
Leader:
snapshot through 1,000,000
log continues after that

Follower:
only through 50,000
```

Instead of replaying nearly one million entries:

```text
Leader
→ InstallSnapshot
→ follower restores snapshot
→ replicate remaining newer log
```

This makes recovery practical while preserving the committed state.

---

# 14. Production Monitoring

Useful signals:

```text
currentTerm
current leader
election frequency
commitIndex
lastApplied
matchIndex per follower
replication lag
AppendEntries latency/failures
quorum availability
snapshot/install failures
```

### Frequent elections

Possible causes:

```text
network instability
GC pauses
CPU saturation
overly aggressive election timeout
```

### `commitIndex >> lastApplied`

Consensus is progressing, but:

```text
state-machine application is slow
```

### One follower's `matchIndex` far behind

Possible:

```text
slow disk
network issue
overload
long outage
```

---

# 15. Raft Failure Debugging Checklist

When Raft appears unhealthy, ask:

```text
Who is leader?

What term is each node in?

Can a majority communicate?

Are elections repeatedly occurring?

How far has each follower replicated?

What is commitIndex?

What is lastApplied?

Are AppendEntries being rejected?

Is a follower far enough behind to need a snapshot?
```

This helps distinguish:

```text
election problem
vs
replication problem
vs
commit problem
vs
application problem
```

---

# 16. Full Raft Mental Model

### Election

```text
Follower
→ election timeout
→ Candidate
→ increment term
→ request votes
→ majority
→ Leader
```

Voting checks:

```text
higher lastLogTerm
        ↓ tie
higher lastLogIndex
```

---

### Write

```text
Client
→ Leader
→ append log entry
→ AppendEntries
→ replicate
→ commit
→ apply
→ response
```

---

### Follower Repair

```text
prevLogIndex + prevLogTerm
→ verify matching prefix

mismatch
→ find common prefix
→ remove conflicting uncommitted suffix
→ replicate leader's suffix
```

---

### Leadership Change

```text
old leader isolated
→ cannot reach majority
→ cannot commit

new majority
→ elects newer-term leader

partition heals
→ old leader sees higher term
→ steps down
→ logs converge
```

---

### Commitment

```text
Current-term entry
+
majority replication
→ commit

commit N
→ entire prefix through N committed
```

---

### Application

```text
commitIndex
→ safely decided

lastApplied
→ actually executed
```

---

### Strong Read

```text
confirm current leadership
→ identify required commit point
→ wait until applied
→ read state machine
```

---

### Long-Running Cluster

```text
committed
→ applied
→ snapshot
→ compact old log
```

---

# 17. 30–45 Second Interview Answer

> **Raft is a leader-based consensus algorithm that allows a group of replicas to agree on an ordered log despite crashes and network failures. Servers operate as followers, candidates, or leaders, and terms represent leadership eras. A candidate needs a majority to become leader, and voting considers log freshness so committed history cannot be lost. The leader appends client commands to its log, replicates them using AppendEntries, commits a safe prefix after satisfying Raft's majority and term rules, and replicas apply committed entries to their state machines. If logs diverge, followers' uncommitted suffixes are repaired to match the leader. Terms, quorum requirements, Log Matching, and Leader Completeness protect the system across partitions and leader failures.**

---

# 18. Final Interview Cheat Mental Model

```text
RAFT
│
├── Election
│   ├── Follower
│   ├── Candidate
│   ├── Leader
│   ├── Term
│   └── Majority
│
├── Voting
│   ├── lastLogTerm first
│   └── lastLogIndex second
│
├── Replication
│   ├── AppendEntries
│   ├── prevLogIndex
│   ├── prevLogTerm
│   ├── nextIndex
│   └── matchIndex
│
├── Progress
│   ├── lastLogIndex = HAVE
│   ├── commitIndex  = COMMITTED
│   └── lastApplied  = EXECUTED
│
├── Safety
│   ├── Election Safety
│   ├── Leader Append-Only
│   ├── Log Matching
│   ├── Leader Completeness
│   └── State Machine Safety
│
├── Failures
│   ├── minority leader cannot commit
│   ├── higher term → step down
│   ├── uncommitted may disappear
│   └── committed must survive
│
└── Production
    ├── request ID / dedup
    ├── linearizable reads / ReadIndex
    ├── snapshots
    ├── membership changes
    └── monitoring
```

---

# Final Principle

> **Raft turns an unreliable collection of servers into a replicated state machine by ensuring they agree on one safe, ordered, committed history—even as leaders crash, networks partition, and replicas temporarily diverge.**
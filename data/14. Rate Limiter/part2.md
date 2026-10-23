# Rate Limiter — System Design Handbook

## Part 2: Distributed Architecture, Redis, Consistency & Scalability

## 1. From a Single Rate Limiter to a Distributed System

In Part 1, we selected a token-bucket algorithm for an e-commerce API. Now we need to implement it across multiple gateway and application instances.

### 1.1 The system we are building

Our requirements:

- 10 API gateway replicas distributed across 3 regions.
- 100 requests per minute per authenticated user.
- Controlled bursts are allowed.
- Expensive endpoints consume more quota.
- Concurrent requests must not bypass the quota.
- Redis failures must not cause uncontrolled traffic or unnecessary outages.
- The system should maintain low latency.

A simplified architecture is:

```text
                   Clients
                      |
                      v
               Load Balancer
                      |
           +----------+----------+
           |                     |
           v                     v
      Gateway A              Gateway B
           |                     |
           +----------+----------+
                      |
                      v
                Rate Limiter
                      |
                      v
                Redis Primary
                 /         \
                v           v
          Replica 1      Replica 2
                      |
                      v
              Application APIs
                      |
                      v
             Databases / Services
```

The diagram represents the logical architecture. In a real deployment, the gateways and Redis nodes may be distributed across availability zones or regions, and the exact replication topology depends on the deployment.

The essential requirement is that all gateways enforcing the same quota must use a coordinated quota mechanism.

### 1.2 Why not keep the counter in gateway memory?

Suppose Gateway A and Gateway B each maintain a local counter for User 123.

Gateway A receives 60 requests and allows them. Gateway B independently receives 60 requests and also allows them.

Each gateway sees only 60 requests, but the user has made 120 requests.

Local memory is useful for caching policies or holding explicitly allocated token leases, but it cannot independently enforce a shared global quota unless the quota has been safely partitioned.

**Design principle:** Every request must consume quota from a coordinated budget, either directly through shared state or through a bounded allocation granted to that gateway.

---

## 2. Redis as the Shared Rate-Limit Store

Redis is a strong choice for many rate limiters because it supports fast key-value operations, expiration, atomic commands, and server-side scripting.

### 2.1 What should we store?

For a token bucket, we need two pieces of logical state:

1. Current token balance.
2. Last refill timestamp.

We also need the policy configuration, such as bucket capacity and refill rate. This configuration may be stored separately or supplied by a trusted policy service.

For example:

```text
Key:
rate_limit:{user:12345}:products

State:
tokens = 75
last_refill_timestamp = ...
```

The example represents a user's product-endpoint bucket. A general user quota could use a different key.

The key should uniquely represent the quota being enforced.

Examples:

```text
rate_limit:{user:12345}:global
rate_limit:{user:12345}:report_generation
rate_limit:{tenant:acme}:global
```

The exact naming scheme is less important than ensuring that all requests belonging to the same quota resolve to the same state.

### 2.2 Why use a timestamp?

The token balance changes not only when requests consume tokens, but also when time passes.

Suppose a bucket has 20 tokens and replenishes at 2 tokens per second. After 5 seconds without requests, it should have replenished by 10 tokens, subject to the bucket's capacity.

The logical refill calculation is:

\[
T_{\text{available}}
=
\min(C,\ T_{\text{stored}} + r \Delta t)
\]

Where:

- \(C\) is bucket capacity.
- \(T_{\text{stored}}\) is the previously stored balance.
- \(r\) is the refill rate.
- \(\Delta t\) is elapsed time.

After calculating the available balance, the limiter checks the incoming request's cost and deducts tokens if permitted.

The implementation must handle time consistently. For example, it should avoid allowing a backwards-moving timestamp to create an incorrect refill. A trusted time source or carefully controlled timestamp handling is important.

### 2.3 Why Redis TTL is not the same as token refill

A common implementation mistake is assuming that setting a key's TTL automatically implements token-bucket behavior.

TTL determines when a key expires. It does not calculate the number of tokens that should have replenished.

A token bucket needs refill logic. TTL may help clean up inactive state or implement a fixed-window counter, but it is not a replacement for token accounting.

For a token bucket, an implementation can expire an inactive key after a suitable period if it can safely reconstruct the correct initial state when the key is recreated.

---

## 3. The Concurrency Problem: Why Atomicity Matters

This is one of the most important parts of a distributed rate limiter.

Suppose a user's token bucket contains exactly one token. Two requests arrive almost simultaneously at different gateway replicas.

### 3.1 What goes wrong without atomicity?

```text
Gateway A: Read balance = 1
Gateway B: Read balance = 1

Gateway A: Check balance → enough tokens
Gateway B: Check balance → enough tokens

Gateway A: Allow request
Gateway B: Allow request
```

Both requests are allowed even though only one token existed.

The final stored value might even be zero, making the error difficult to detect by inspecting the counter alone.

This is a race condition: multiple requests make decisions based on the same outdated state.

### 3.2 The solution: atomic check-and-update

The operation must logically perform these steps as one indivisible action:

1. Read the stored balance and timestamp.
2. Calculate the refill.
3. Check whether sufficient tokens are available.
4. Deduct the request cost if permitted.
5. Save the new balance and timestamp.
6. Return the allow/reject decision.

No other request should be able to modify that bucket between the check and the update.

### 3.3 Using a Redis Lua script

Redis supports Lua scripting, allowing the rate-limiting operation to run atomically on the Redis server.

Conceptually:

```text
function rate_limit_request(bucket, cost):
    read bucket state
    calculate replenished tokens
    cap tokens at capacity

    if tokens >= cost:
        deduct cost
        save updated state
        return ALLOW
    else:
        save necessary refill state
        return REJECT
```

This is pseudocode, not a complete production script. A real implementation must validate inputs, handle missing state, calculate refill safely, and persist the correct timestamp and balance.

The key property is that the script executes as one atomic operation relative to other commands on that Redis server.

### 3.4 Why this works

Redis serializes command execution on a server. While the Lua script runs, other commands do not interleave with its operations.

If two requests compete for the last token:

- Request A executes first and deducts the token.
- Request B executes afterward and observes that no token remains.
- Request B is rejected unless sufficient tokens have been replenished.

**Interview takeaway:** Atomicity protects correctness under concurrent requests. Shared storage alone does not guarantee atomic rate-limit decisions.

### 3.5 Atomicity does not mean unlimited scalability

A Lua script prevents races on the relevant Redis server, but scripts consume server execution time. Long-running scripts can block other commands.

Keep the script small and predictable. Avoid expensive loops or large data scans in the request path.

Atomicity solves a correctness problem; it does not remove the need to monitor throughput, latency, and hot keys.

---

## 4. Redis Replication and Failover

A single Redis primary can become a single point of failure. Replicas can improve availability, but they introduce a consistency trade-off.

### 4.1 Basic replication architecture

```text
Rate Limiter
     |
     v
Redis Primary
     |
     +------> Replica A
     |
     +------> Replica B
```

The primary processes writes, while replicas copy its state.

If the primary fails, a healthy replica may be promoted to primary.

This can restore service, but it does not automatically guarantee that every recent quota update has been preserved.

### 4.2 How lost updates affect rate limiting

Suppose a bucket initially contains 100 tokens.

1. The user makes 30 requests, consuming 30 tokens.
2. The primary now stores 70 tokens.
3. The latest deductions have not all reached a replica.
4. The primary fails.
5. A replica becomes primary with 80 tokens recorded.

The user has effectively regained 10 tokens.

The limiter may now allow requests that should have been rejected. The failure has weakened enforcement even though Redis is reachable again.

This is a consistency issue, not simply an availability issue.

### 4.3 Reduce replication lag

Possible mitigations include:

- Monitoring replication lag and replica health.
- Ensuring replicas have sufficient CPU, memory, and network capacity.
- Investigating slow replication, network congestion, and overloaded nodes.
- Configuring failover behavior and replica placement appropriately.
- Alerting when replicas fall behind.

Reducing replication lag lowers the risk of losing recent quota updates, but it does not eliminate that risk.

### 4.4 Redis `WAIT`

Redis provides the `WAIT` command, which can wait for a specified number of replicas to acknowledge receiving writes issued by the same client connection.

Conceptually:

1. Execute the atomic rate-limit update.
2. Wait for the required replica acknowledgments.
3. Continue when the acknowledgment condition is met, or handle a timeout.

This can reduce the chance that recent writes are missing from replicas.

However:

- `WAIT` adds latency.
- An acknowledgment does not guarantee that the write will survive every possible failover.
- Redis replication remains asynchronous and is not transformed into strong consistency by `WAIT`.

The implementation must also ensure that the acknowledgment applies to the intended writes. If the Lua script executes on one connection but `WAIT` executes on another, the acknowledgment may not cover the relevant update.

**Design principle:** `WAIT` can improve confidence in replication, but it is not a universal guarantee against data loss.

### 4.5 When is occasional overshoot acceptable?

For a general browsing endpoint, a small temporary quota overshoot might be an acceptable trade-off for lower latency and higher availability.

For an expensive report-generation endpoint, losing quota deductions could result in significant CPU, memory, database, or network consumption. The system may require tighter coordination or additional protective limits.

The required consistency level should be chosen based on the consequences of overshoot.

---

## 5. Fail-Open Versus Fail-Closed

Replication failure and limiter unavailability are different scenarios.

- **Stale state:** The limiter is reachable but may have an incorrect quota balance.
- **Unavailable state:** The gateway cannot reliably obtain a quota decision.

Fail-open and fail-closed address the second scenario.

### 5.1 Fail-open

If the limiter is unavailable, allow requests to continue.

**Benefits**
- Preserves user-facing availability.
- Avoids rejecting legitimate requests because a dependency failed.

**Risks**
- Unchecked traffic may overwhelm the application.
- Expensive downstream operations may become overloaded.
- Abuse protection may temporarily be weakened.

### 5.2 Fail-closed

If the limiter is unavailable, reject requests because the quota cannot be verified.

**Benefits**
- Prevents uncontrolled admission when the quota mechanism is unavailable.
- Protects expensive or sensitive operations.

**Risks**
- Legitimate users may be unable to use otherwise healthy APIs.
- A limiter outage can become a customer-facing outage.

### 5.3 Choose by endpoint

| Endpoint | Possible policy | Reason |
|---|---|---|
| Product browsing | Fail-open, if excess traffic is tolerable | Preserve availability |
| Excel report generation | Fail-closed | Protect expensive resources |
| Financial or security-sensitive operation | Strict policy based on business risk | Avoid uncontrolled or unsafe operations |

These are examples, not universal rules. A critical operation may need fail-closed behavior even if it consumes few resources.

### 5.4 Fail-open and fail-closed do not fix stale counters

Suppose Redis fails over and now shows 80 tokens when the true balance is 70.

Redis is reachable, so the limiter continues making decisions. Fail-closed does not automatically detect that the balance is stale.

To reduce this risk, improve replication behavior or use a stronger quota-coordination design.

---

## 6. Multi-Region Rate Limiting

Now suppose our application runs in the US, Europe, and Asia.

Each region has local gateway replicas and its own Redis cluster.

We want a global limit of 100 requests per minute per user, but we also want low latency.

### 6.1 Option A: One globally coordinated quota

All regions consult a common quota authority.

**Advantages**
- A single logical quota is easier to reason about.
- Quota decisions can reflect usage across regions.

**Trade-offs**
- Cross-region network calls increase latency.
- Network partitions can affect availability.
- The central quota mechanism may become a throughput bottleneck.
- Strong global consistency requires coordination.

This approach can be suitable when strict global enforcement is more important than minimizing cross-region latency.

### 6.2 Option B: Partition the quota by region

Allocate non-overlapping budgets:

| Region | Allocated quota |
|---|---:|
| US | 50 |
| Europe | 30 |
| Asia | 20 |
| Total | 100 |

Each region spends only its own allocation.

If allocations are uniquely granted and enforced, the regions cannot collectively spend more than the total authorized budget.

This avoids coordination on every request.

### 6.3 Why quota partitioning is safe

Suppose the US receives 50 tokens and Europe receives 30. Each region tracks its own remaining allocation.

The US cannot spend Europe's 30 tokens, and Europe cannot spend the US's 50 tokens. Their authorized budgets do not overlap.

The risk arises if the allocation mechanism itself is incorrect.

For example, if the global budget has 10 tokens remaining and two regions independently read that same balance and each claim all 10, the system has issued overlapping allocations.

Therefore, **the quota authority must grant allocations atomically or use another mechanism that guarantees non-overlapping ownership**.

Once valid allocations exist, local spending does not require global coordination for each request.

### 6.4 The unused-capacity problem

Suppose:

- US has 40 tokens remaining.
- Europe has exhausted its allocation.
- Asia has only used half its budget.

The global quota may still have unused capacity, but Europe cannot automatically spend it.

This is called stranded capacity.

Possible approaches:

- Periodically rebalance allocations.
- Request additional quota from a central authority.
- Use smaller allocations to reduce stranded capacity.
- Use local quota leases that can be safely renewed.

Each approach trades off coordination, latency, and utilization.

### 6.5 What if a region fails?

Suppose the US region fails while holding unused quota.

The remaining regions should not automatically assume that every US token is available if the US region might still be processing requests.

A safe transfer requires confidence that the previous allocation can no longer be spent. This can be implemented with controlled lease expiration, ownership validation, or another explicit revocation mechanism.

The general rule is that **quota must not be reassigned while its previous owner can still spend it**.

---

## 7. Hot Keys and Hot Shards

A distributed Redis deployment may spread many users across keys and shards. However, one very active user can still concentrate a large amount of traffic on a single key.

Suppose User 123 sends 10,000 requests in a few seconds.

All requests may target:

```text
rate_limit:{user:123}:global
```

Even though the system has many Redis shards, this user's requests still compete to update the same bucket.

### 7.1 Why is a hot key difficult?

A token bucket requires coordinated updates to the balance. Arbitrarily splitting the balance across independent keys is unsafe because each key could authorize requests without knowing what the others have already allowed.

Read replicas do not solve this directly: rate-limit decisions require writes, and independently updating replicas would not maintain one authoritative balance.

### 7.2 Strategy A: Reduce unnecessary work

Keep the atomic operation small. Avoid unnecessary reads, writes, and expensive processing in the request path.

Cache static policy configuration separately where appropriate, while ensuring that quota decisions still use valid quota state.

This is the simplest starting point, but it cannot eliminate contention if every request must update the same key.

### 7.3 Strategy B: Local token leases

A gateway can reserve a bounded batch of tokens from a quota authority and spend them locally.

For example:

- The global quota authority grants Gateway A 10 tokens.
- It atomically subtracts those 10 tokens from the available budget.
- Gateway A allows up to 10 one-token requests locally.
- Other gateways cannot spend the same reserved tokens.

If 1,000 requests arrive and gateways reserve tokens in batches of 10, the number of reservation operations could be much lower than one Redis operation per request.

**Benefits**
- Reduces shared-store traffic.
- Reduces contention on a hot key.
- Allows local admission decisions with low latency.

**Trade-offs**
- Unused tokens can become stranded.
- Gateways may need to request additional batches.
- Crashed gateways require safe lease-recovery handling.
- Expiration and ownership rules become part of the correctness model.

Leases improve efficiency by changing how quota is allocated; they do not eliminate the need for a global quota policy.

### 7.4 Strategy C: Bounded quota partitions

Instead of granting a small batch on demand, allocate bounded portions of a user's quota to gateways or regions.

For example:

```text
Global budget: 100 tokens

Gateway A: 40
Gateway B: 35
Gateway C: 25
```

If the allocations are unique and the gateways cannot spend beyond their own budgets, their combined spending cannot exceed 100 tokens.

This can reduce write contention, but it introduces a utilization trade-off: one gateway may run out while another still has unused capacity.

### 7.5 Why not split one user's quota across arbitrary Redis keys?

Suppose we create five keys and put a limit of 100 on each. The user could potentially consume 500 requests.

Even if we assign smaller limits to each key, we need a defined allocation whose total cannot exceed the intended global quota.

**Design principle:** Distributing the state is safe only when the allocation and ownership rules preserve the global limit.

---

## 8. Token Leases and Safe Recovery

Token leases allow a gateway to spend a bounded number of tokens locally for a limited period.

However, a gateway may crash after receiving tokens but before spending all of them.

We want to recover unused capacity without allowing two gateways to spend the same quota.

### 8.1 The basic lease model

A lease includes:

- An allocation of tokens.
- An owner, such as a particular gateway.
- An expiration time or another defined revocation condition.
- A rule that prevents spending after the lease becomes invalid.

For example, Gateway A receives 10 tokens with a lease expiring at 12:00:00.

It uses 3 tokens and then crashes. Seven tokens remain unused.

The quota manager cannot immediately reissue all seven if Gateway A might still be spending tokens.

### 8.2 Wait for safe expiration

A simple strategy is to wait until the old lease expires before recovering unused quota.

This works only if the system ensures that an expired lease can no longer be used.

For example, Gateway A must stop spending tokens before its lease deadline. A gateway that can continue spending after expiration defeats the safety of the lease.

### 8.3 Clock drift and safety margins

Suppose Gateway A's local clock is behind the reference time.

The quota manager believes the lease has expired, but Gateway A believes it still has a few seconds remaining. If the manager reissues the quota during that interval, both gateways may spend it.

To reduce this risk:

- Keep clocks synchronized.
- Account for possible clock drift.
- Require gateways to stop spending before the official deadline.
- Use a conservative safety margin.
- Ensure every local token spend checks lease validity.

A safety margin reduces risk but does not independently guarantee correctness if a gateway pauses for an extended period or its clock behaves unexpectedly.

### 8.4 Fencing tokens

For stronger ownership protection, a system can issue monotonically increasing fencing tokens when granting leases.

For example:

```text
Gateway A receives lease generation 41
Gateway B later receives lease generation 42
```

A downstream resource that supports fencing can reject operations carrying an older generation after it has observed a newer one.

This helps prevent stale lease holders from continuing to act after ownership has changed.

However, fencing is not automatically enforced by a gateway's local token counter. The component accepting the protected operation must participate in validating the fencing token, or the design must use another mechanism that makes expired ownership unusable.

### 8.5 The trade-off

Safe leases reduce shared-store traffic, but recovery may delay reuse of unused tokens.

The design must balance:

- Correct global quota enforcement.
- Low-latency local decisions.
- Efficient utilization of allocated tokens.
- Safe recovery after crashes and network partitions.

---

## 9. Failure Scenarios and Their Mitigations

| Failure | Possible impact | Mitigation |
|---|---|---|
| Gateway replica crashes | Its local state or unused lease may be lost | Recover quota only when ownership rules make it safe |
| Redis primary fails | Recent quota updates may be lost during failover | Reduce replication lag; consider acknowledgment mechanisms and acceptable overshoot |
| Redis becomes unavailable | Quota decisions cannot be verified | Apply endpoint-specific fail-open/fail-closed policy |
| Hot key develops | High latency and contention on one user's bucket | Optimize the atomic path or allocate bounded token leases |
| Region loses connectivity | Global coordination may be unavailable | Use explicit regional quota budgets and a defined partition policy |
| Gateway clock is inaccurate | A lease may be treated as valid after expiration | Use trusted time assumptions, safety margins, and ownership validation |
| Quota allocation overlaps | Multiple owners can spend the same budget | Allocate quota atomically and enforce ownership |
| Limiter latency rises | Gateway request latency rises | Measure limiter and Redis latency separately; investigate saturation and hot keys |

The mitigation depends on the guarantee required. A design that tolerates small quota overshoots may choose a simpler recovery policy than one that requires strict enforcement.

---

## 10. Putting the Distributed Design Together

A practical starting architecture for our e-commerce system is:

```text
Client
  |
  v
Load Balancer
  |
  v
API Gateway
  |
  +--> Authenticate / validate identity
  |
  +--> Determine quota policy and request cost
  |
  +--> Rate-limit decision
           |
           v
      Shared quota state
           |
           v
      Atomic token-bucket update
           |
       +---+---+
       |       |
     Allow   Reject
       |       |
       v       v
  Application  HTTP 429
  instances
```

The logical design is straightforward:

1. Authenticate the user and identify the relevant quota.
2. Determine the request's token cost.
3. Evaluate the token bucket using shared state or a safely allocated local budget.
4. Atomically consume quota when the request is admitted.
5. Forward allowed requests to application instances.
6. Reject requests that cannot be admitted.
7. Apply an explicit policy when the quota mechanism is unavailable.
8. Monitor latency, errors, quota overshoot, and resource saturation.

For a multi-region deployment, the quota coordination model must be selected explicitly. A globally coordinated quota may provide more direct enforcement but add latency; partitioned budgets can improve local performance but require safe allocation and rebalancing.

---

## 11. Interview-Level Trade-Offs

### Shared state versus local leases

**Shared state:** Simpler quota reasoning, but more shared-store traffic and dependency on the store.

**Local leases:** Fewer shared-store operations and faster local decisions, but more complicated allocation, expiration, and recovery.

### Availability versus enforcement strictness

**More availability:** The system may tolerate small quota overshoots or use bounded local fallback behavior.

**Stricter enforcement:** The system may require additional coordination and reject requests when quota ownership cannot be verified.

### Regional locality versus global utilization

**Regional budgets:** Lower request-path coordination and predictable local limits, but unused quota may be stranded.

**Globally coordinated quota:** Better ability to share capacity across regions, but higher coordination cost and sensitivity to network failures.

### Replication versus consistency

**Replicas:** Improve availability and can distribute some read traffic.

**Limitation:** Asynchronous replication may lose recent writes during failover. Replication alone does not provide strong global consistency.

These are design trade-offs, not problems with one universally correct solution.

---

## 12. Part 2 Review Checklist

- [ ] Why is a local in-memory counter insufficient for a global quota?
- [ ] What state does a token bucket need?
- [ ] Why is TTL not a substitute for token refill logic?
- [ ] Why must token refill, check, and deduction be atomic?
- [ ] How does a Redis Lua script prevent concurrent requests from spending the same token?
- [ ] Why can a Redis replica become stale?
- [ ] What does Redis `WAIT` improve, and what does it not guarantee?
- [ ] How are fail-open and fail-closed different from stale-state handling?
- [ ] Why can multi-region quota partitioning reduce coordination?
- [ ] How can incorrectly granted regional allocations overlap?
- [ ] Why is a hot key difficult to solve by simply adding read replicas?
- [ ] How do token leases reduce shared-store traffic?
- [ ] Why must expired leases become unusable before quota is reissued?
- [ ] What are fencing tokens intended to prevent?
- [ ] Which consistency and availability trade-offs matter for the specific API?

---

## Part 2 Summary

A distributed rate limiter is not just an algorithm backed by Redis. It is a coordinated quota system whose correctness depends on state updates, ownership, failure recovery, and allocation.

The key principles are:

1. Use shared state or bounded quota allocation for global enforcement.
2. Make token-bucket updates atomic.
3. Understand the limitations of asynchronous replication and failover.
4. Choose endpoint-specific failure policies.
5. Avoid splitting a quota without explicit, non-overlapping allocation rules.
6. Use token leases to reduce shared-store traffic only when expiration and ownership are safe.
7. Measure the trade-off between strictness, latency, availability, and capacity utilization.

**Next — Part 3: Production Readiness, Monitoring, Capacity Planning, Advanced Scenarios & Interview Cheat Sheet.** We'll consolidate observability, overload handling, client retry behavior, operational failure modes, and the end-to-end interview answer.
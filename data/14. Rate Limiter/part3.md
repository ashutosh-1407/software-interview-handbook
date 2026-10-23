# Rate Limiter Handbook — Part 3
## Production Readiness, Monitoring, Capacity Planning, Advanced Scenarios & Interview Cheat Sheet

---

# 1. From a Correct Design to a Production-Ready System

A rate limiter can be algorithmically correct and still fail in production.

For example:
- Redis latency increases, causing every API request to become slower.
- A deployment resets limiter state, allowing unexpected bursts.
- A popular user's quota becomes a hot key.
- A failover restores stale quota state, temporarily allowing excess requests.
- A retry storm increases traffic precisely when the service is overloaded.
- A monitoring dashboard shows a high rejection rate, but nobody knows whether it is expected or a sign of a bug.

Production readiness means designing for these operational realities, not merely choosing Token Bucket or implementing a Redis script.

## 1.1 Production requirements

A production-grade rate limiter should address the following:

| Requirement | What it means |
|---|---|
| Correctness | Enforce the intended quota within explicitly accepted limits |
| Low latency | Add minimal overhead to the request path |
| Availability | Continue making appropriate decisions during partial failures |
| Scalability | Support growth in request volume, users, and application instances |
| Observability | Explain what is allowed, rejected, delayed, or failing |
| Recoverability | Handle restarts, failovers, deployments, and state loss |
| Fairness | Prevent one user or tenant from monopolizing shared capacity |
| Security | Prevent clients from bypassing limits by manipulating identity or keys |
| Operability | Allow engineers to change policies safely and investigate incidents |

**Important:** These requirements can conflict. For example, a strict global quota may require shared coordination, which adds latency and introduces a dependency on the shared state store.

The goal is not to maximize every property independently. It is to choose and document the trade-offs appropriate to the business.

---

# 2. Monitoring and Observability

A rate limiter must answer three operational questions:

1. Is it enforcing the intended policy?
2. Is the limiter itself healthy?
3. Is the limiter protecting the downstream service without unnecessarily rejecting legitimate traffic?

## 2.1 The most important metrics

### A. Request-level metrics

Track:

- Total requests evaluated by the limiter
- Requests allowed
- Requests rejected
- Requests delayed or queued, if supported
- Rejection rate by endpoint, tenant, and policy
- Requests that bypassed the limiter
- Requests that encountered limiter errors

The rejection rate is:

\[
\text{Rejection Rate} =
\frac{\text{Rejected Requests}}{\text{Evaluated Requests}}
\times 100\%
\]

Interpret this metric in context. A high rejection rate might be expected during a promotion or a malicious traffic spike. A sudden increase during normal traffic could indicate an overly restrictive policy or a configuration error.

Also track the absolute rejection count. A rejection rate of 50% means something very different at 10 requests per second versus 100,000 requests per second.

### B. Latency metrics

Measure limiter overhead separately from total API latency.

Track:

- Limiter decision latency: p50, p95, and p99
- Redis command latency
- Timeouts while accessing the shared state store
- End-to-end API latency
- Time spent waiting in a queue, if applicable

Why percentiles matter:

- **p50:** Typical latency.
- **p95:** Latency experienced by the slower 5% of requests.
- **p99:** Latency experienced by the slowest 1%, often useful for detecting tail-latency problems.

Suppose an API normally responds in 80 ms. If the limiter adds 3 ms at p50 but 180 ms at p99, the median looks healthy while some users experience severe degradation.

### C. Redis and infrastructure metrics

Monitor:

- CPU utilization
- Memory utilization and eviction activity
- Network throughput
- Active connections
- Command latency
- Timeouts and connection errors
- Replication lag
- Failovers and reconnects
- Key count and expiration behavior
- Hot-key concentration
- Client-side connection-pool saturation

A Redis instance can be reachable while still being unhealthy for the limiter's latency requirements.

For example, high CPU or connection-pool exhaustion may cause requests to time out even when Redis is technically available.

### D. Correctness and business-impact metrics

These are easy to overlook:

- Quota overshoot during failover or regional incidents
- Requests allowed while the limiter is unavailable
- Unexpected policy bypasses
- Downstream service saturation
- Legitimate requests rejected after configuration changes
- Per-tenant fairness
- Cost per accepted request for expensive endpoints

A limiter's success is not simply a low rejection rate. It is whether the system remains within its intended operational and business constraints.

## 2.2 Avoid high-cardinality metrics

Do not automatically create a separate time series for every user ID, API key, or raw URL.

Millions of unique label values can overwhelm a metrics platform.

Prefer bounded labels such as:

- Endpoint template: `/users/{id}`
- Policy name
- Region
- Application service
- Response decision
- Tenant tier, where the number of tiers is bounded

Use logs, sampled traces, or dedicated diagnostic tools for investigating individual users or keys.

## 2.3 Logs and traces

Useful structured log fields include:

- Policy identifier
- Endpoint or route template
- Decision: allow, reject, or bypass
- Cost charged
- Remaining quota, when useful
- Limiter backend status
- Region
- Failure reason
- Correlation or trace ID

Avoid logging API keys, credentials, or other sensitive identifiers directly.

For tracing, add a rate-limiter span to the request path. This helps distinguish latency caused by the limiter from latency caused by authentication, application logic, or the database.

**Design principle:** Metrics tell you that something is wrong; traces and structured logs help you determine why.

---

# 3. Alerts and Incident Response

A useful alert identifies a meaningful failure, not just an unusual metric.

## 3.1 Example alerts

| Alert | Why it matters |
|---|---|
| Limiter p99 latency exceeds its SLO | Request-path performance is degrading |
| Redis timeout rate rises | Decisions may be delayed or unavailable |
| Redis CPU or memory approaches a critical threshold | Capacity or stability risk |
| Rejection rate changes sharply | Policy issue, traffic spike, or attack may be occurring |
| Limiter bypass rate increases | Protection may be weakened |
| Replication lag rises | Failover could lose more recent quota updates |
| Downstream saturation increases despite active limiting | Policy may be ineffective or traffic may be bypassing it |
| Quota overshoot exceeds the accepted tolerance | Correctness guarantees may be violated |

Thresholds should be based on the system's baseline, SLOs, and acceptable business risk. There is no universal p99 latency or rejection-rate threshold that works for every service.

## 3.2 Example incident: p99 latency suddenly increases

Imagine the API's p99 latency rises from 100 ms to 450 ms, while p50 remains almost unchanged.

A systematic investigation:

1. **Confirm the scope.** Is the problem limited to one endpoint, region, tenant tier, or all traffic?
2. **Inspect the limiter span.** Did the time spent evaluating rate limits increase?
3. **Inspect Redis.** Check command latency, CPU, connections, timeouts, and failovers.
4. **Check traffic distribution.** Is one key receiving a disproportionate number of writes?
5. **Review recent changes.** Look for policy changes, deployments, connection-pool changes, or new endpoints.
6. **Mitigate the immediate problem.** Depending on business risk, scale or repair the backend, reduce unnecessary limiter operations, or activate a carefully designed fallback policy.
7. **Verify recovery.** Confirm that latency improves without allowing unacceptable downstream overload.

Do not immediately add Redis replicas as the fix. Read replicas can help read-heavy workloads, but they do not eliminate contention when each request must atomically update the same quota key.

## 3.3 Incident: a large number of legitimate users are rejected

Investigate:

- Was the quota lowered accidentally?
- Did a deployment reset token-bucket state?
- Is the limiter using the correct authenticated identity?
- Did a tenant's traffic pattern change?
- Are multiple endpoints sharing a quota unintentionally?
- Is the retry behavior causing repeated attempts?
- Is the regional quota allocation correct?

A safe response may involve rolling back a policy change or adjusting a specific quota. Globally disabling rate limiting could expose the downstream system to overload.

---

# 4. Capacity Planning

Capacity planning should begin with traffic characteristics and the enforcement model, not just the number of application servers.

## 4.1 Estimate request volume

Suppose the service handles:

- 20,000 API requests per second
- One rate-limit decision per request
- One Redis script execution per decision

The limiter performs approximately 20,000 script executions per second, before accounting for retries, multiple policies, internal commands, or other workloads.

If each request checks three independently evaluated policies, the system might perform up to 60,000 policy evaluations per second, depending on how those checks are combined.

This is a planning estimate, not a Redis capacity guarantee. Actual throughput depends on script complexity, key distribution, network latency, hardware, payload size, and contention.

## 4.2 Estimate active key count

Suppose there are 2 million active users, and each user has one active quota key.

If each key consumes an average of 300 bytes, the rough payload estimate is:

\[
2{,}000{,}000 \times 300
= 600{,}000{,}000 \text{ bytes}
\]

That is approximately 600 MB in decimal units.

However, 300 bytes must represent the actual total per-key cost for this estimate to be meaningful. Real Redis memory consumption includes data structures, key objects, allocator overhead, expiration metadata, and other server costs.

Multiple policies per user can also multiply the number of keys.

**Practical lesson:** Measure memory consumption using representative keys and production-like data rather than relying solely on a theoretical byte count.

## 4.3 Estimate state-store operations

A basic token bucket may need to:

1. Read the previous token count and timestamp.
2. Refill tokens based on elapsed time.
3. Check the request cost.
4. Deduct tokens if allowed.
5. Persist the new state and expiration.

These steps should generally execute atomically when strict per-key decisions are required.

A single Lua script can combine the logic into one client-server operation. That reduces round trips, but the script still consumes Redis execution time.

Keep scripts bounded and efficient. Avoid expensive loops, scans, or unbounded work.

## 4.4 Understand the actual bottleneck

Potential bottlenecks include:

- Network round-trip latency
- Redis CPU
- Hot-key contention
- Connection-pool limits
- Application-side serialization
- Excessive policy evaluations
- Large numbers of short-lived keys
- Uneven traffic across shards
- Cross-region coordination

A distributed rate limiter may be CPU-light overall but still suffer from one extremely hot key. Aggregate capacity does not guarantee that a particular key or shard can sustain its traffic.

## 4.5 Scaling strategies

| Strategy | Benefit | Trade-off |
|---|---|---|
| Redis sharding | Distributes keys and write load | A hot key still concentrates on one shard |
| Local caching of policy configuration | Reduces configuration lookups | Configuration changes may propagate with delay |
| Local token leases | Reduces per-request shared writes | Requires careful quota allocation and lease recovery |
| Regional quota allocation | Reduces cross-region coordination | Can strand capacity in one region |
| Batching independent evaluations | Can reduce round trips | Adds complexity and may increase decision latency |
| Dedicated limiter infrastructure | Isolates limiter load | Adds another service and operational dependency |
| Hierarchical limiting | Combines local protection with global policy | Requires explicit consistency and budget semantics |

### Hierarchical example

A system might enforce:

- A local concurrency limit to protect one application instance.
- A regional token bucket to reduce regional overload.
- A global user quota to enforce a business entitlement.

These controls solve different problems. A local concurrency limit does not replace a global request quota, and a global request quota does not guarantee that one instance cannot become overloaded.

---

# 5. Testing Strategy

Rate limiters need more than ordinary unit tests. Their most important failures often appear under concurrency, clock changes, failover, or traffic spikes.

## 5.1 Unit tests

Test the algorithm independently.

For a token bucket, cover:

- A request when sufficient tokens are available.
- A request when insufficient tokens are available.
- Refill after elapsed time.
- Refill capped at bucket capacity.
- A request whose cost equals the available token count.
- A request whose cost exceeds bucket capacity.
- Invalid costs and invalid configuration.
- Expiration and initial-state behavior.

Example:

- Capacity: 10 tokens
- Refill rate: 2 tokens per second
- Initial state: 4 tokens
- Request cost: 3 tokens

The request should be allowed, leaving 1 token.

After 2 seconds, the bucket refills by 4 tokens, reaching 5 tokens. A request costing 6 tokens should still be rejected.

This assumes no other requests consume tokens and the bucket is not subject to a different refill rule.

## 5.2 Concurrency tests

Launch many concurrent requests against the same quota key.

Verify that:

- The state updates are atomic.
- Concurrent requests do not all observe the same old token count and overspend it.
- The total allowed cost stays within the intended algorithmic bound.
- Denied requests do not deduct tokens unless the policy explicitly says otherwise.

For a bucket starting with \(B\) tokens and refilling at rate \(r\), the theoretical available budget over an interval of duration \(t\) is bounded by:

\[
B + rt
\]

assuming the bucket begins full, there are no external budget grants, and costs are measured in the same units.

The precise observation interval and treatment of boundary conditions must be specified when validating the bound.

## 5.3 Load and stress tests

Test:

- Normal peak traffic
- Sudden traffic spikes
- Many users with evenly distributed keys
- One or a few extremely hot keys
- Expiration bursts
- Mixed cheap and expensive endpoints
- Redis saturation
- Application connection-pool exhaustion

Measure both throughput and tail latency. A design that passes a throughput test but creates unacceptable p99 latency is not production-ready.

## 5.4 Failure-injection tests

Simulate:

- Redis becoming unavailable
- Redis timeouts while the network remains partially reachable
- Primary failover
- Replication lag
- Application restarts
- Lost local token leases
- Policy configuration changes
- Clock skew between nodes
- A region becoming isolated
- A burst of retries from clients

For each scenario, define the expected behavior before running the test.

For example, if Redis fails, should the system fail open, fail closed, or use a bounded local fallback? The answer should match the endpoint's business risk.

## 5.5 Test policy changes

Suppose a tenant's quota changes from 100 requests per minute to 20 requests per minute.

Verify:

- How quickly the new policy becomes active.
- Whether old state remains valid.
- Whether a new policy version resets or migrates state.
- Whether all regions agree on the new configuration.
- Whether a rollout can be rolled back safely.

Configuration changes can be as risky as code changes, especially when they affect many tenants simultaneously.

---

# 6. Advanced Production Scenarios

## 6.1 What happens when the limiter's state disappears?

Suppose a Redis failover or recovery operation loses recent token-bucket updates.

If the application recreates missing buckets as full, many users may suddenly receive a fresh burst allowance. If the bucket is initialized empty, legitimate users may be rejected unnecessarily.

Possible approaches include:

- Choosing an explicit initialization policy.
- Preserving state where the infrastructure permits it.
- Applying conservative recovery behavior to high-risk endpoints.
- Using bounded local budgets.
- Monitoring post-failover quota behavior.

The correct approach depends on whether the system prioritizes availability, strict enforcement, or user experience.

There is no universal recovery rule that eliminates all trade-offs.

## 6.2 Can Redis `WAIT` guarantee strict rate limiting?

No.

Redis `WAIT` can wait for acknowledgments from replicas for writes issued by the same client connection. It may reduce the chance that an acknowledged write is missing from a replica, but it does not provide strong consistency or guarantee that failover can never lose the latest quota update.

It also adds latency.

If strict enforcement is a hard business or security requirement, the design must examine the guarantees of the complete storage and failover architecture. Adding `WAIT` alone is not enough.

## 6.3 What if the client retries every rejected request?

A poorly designed client can amplify traffic:

1. The server returns HTTP 429.
2. The client retries immediately.
3. The next request is rejected.
4. The cycle repeats.

Recommended behavior:

- Return HTTP 429 for a quota rejection.
- Include `Retry-After` when a meaningful retry time can be provided.
- Use exponential backoff with jitter for retryable failures.
- Respect the server's retry guidance.
- Avoid automatic retries that cannot succeed before quota replenishment.
- Apply retry budgets where appropriate.

Do not treat every 429 as a transient server error. A quota rejection often requires waiting or reducing the request rate, not repeatedly retrying.

## 6.4 How do you prevent one tenant from monopolizing capacity?

Use multiple layers where necessary:

- Per-user limits
- Per-tenant aggregate limits
- Per-endpoint limits
- Concurrency limits for expensive operations
- Fair scheduling or bounded queues for workloads that can wait

A per-user limit alone may not protect a service from a tenant with thousands of users. Conversely, a tenant-wide quota alone may let one user consume all of that tenant's budget.

The identity and scope of each policy should reflect the resource being protected.

## 6.5 What if a request triggers asynchronous work?

Consider an API that accepts a request and starts a long-running export.

A request-per-minute quota might allow a user to submit many exports that each consume substantial CPU, memory, and storage.

Use complementary controls:

- A request-rate limit for API ingress.
- A concurrency limit for active exports.
- A queue-depth limit to bound pending work.
- A weighted quota based on expected export cost.
- Per-tenant resource budgets.

Rate limiting controls the rate of admission. Concurrency limits control how much work is in progress. Queue limits control how much work is waiting.

These are related but distinct protections.

## 6.6 How should a limiter handle clock skew?

Token-bucket refill calculations depend on elapsed time.

If multiple machines independently calculate elapsed time for the same bucket, clock differences can produce inconsistent calculations. A backward-moving clock can also cause negative elapsed time unless handled explicitly.

Possible safeguards:

- Prefer a consistent time source for shared state calculations.
- Use elapsed-time logic that handles backward time safely.
- Clamp negative elapsed time to zero when appropriate.
- Bound refill calculations and token capacity.
- Test clock skew and time adjustments.
- Avoid assuming that a local wall clock is perfectly synchronized.

For local token leases, clock margins can reduce risk, but a margin alone does not guarantee exclusive ownership after expiration. Safe lease designs must ensure an expired owner cannot continue spending budget that has been reassigned.

---

# 7. Senior-Level Interview Scenarios

Use these scenarios to practice explaining the trade-offs, not merely naming algorithms.

## Scenario A: The product requires a global quota across three regions

**Question:** A user may make 1,000 requests per minute globally. Traffic is distributed across three regions. How do you enforce the limit without adding a cross-region round trip to every request?

**Strong answer:**

Allocate uniquely owned regional budgets whose total does not exceed the global allowance. Each region consumes its own budget locally. This avoids per-request global coordination, provided allocations cannot overlap.

The trade-off is stranded capacity: one region may run out of budget while another has unused capacity.

If rebalancing is required, transfer budget safely through a coordination mechanism. Do not independently grant each region the full global allowance.

Also clarify the quota window, burst semantics, allocation reset behavior, and acceptable overshoot.

## Scenario B: One tenant creates a hot key

**Question:** Redis is healthy overall, but one tenant's key dominates write traffic. What do you do?

**Strong answer:**

First confirm that the hot key is the bottleneck. Read replicas alone will not solve contention if every request must atomically update that same key.

Options include:

- Allocate bounded local token leases.
- Partition the tenant's budget into uniquely owned sub-budgets.
- Apply hierarchical rate limiting.
- Introduce separate quotas for different workload classes.
- Reduce unnecessary policy evaluations.

Each option trades coordination cost against budget utilization, fairness, or enforcement precision.

## Scenario C: Redis fails during a traffic spike

**Question:** Should the application fail open or fail closed?

**Strong answer:**

It depends on the endpoint's risk.

- A low-risk read endpoint may use a bounded local fallback or fail open to preserve availability.
- An expensive export endpoint may reject or defer requests when quota enforcement is unavailable.
- A sensitive operation may require strict enforcement and fail closed.

The decision should be explicit per policy. If a local fallback is used, bound its budget and monitor its use so that failure does not turn into an uncontrolled bypass.

## Scenario D: Redis failover causes quota overshoot

**Question:** A user exceeds the expected quota immediately after failover. Why?

**Strong answer:**

Redis replication may be asynchronous. The promoted replica may lack recent token deductions, effectively restoring an older, larger token balance.

Mitigations include evaluating the durability and replication model, using appropriate replication acknowledgments where justified, limiting burst capacity, applying conservative recovery rules, and monitoring failovers and overshoot.

`WAIT` can reduce some risk but does not guarantee strong consistency.

## Scenario E: The rate limiter is correct, but the service still overloads

**Question:** The request-rate limit is being enforced, yet database connections and CPU are saturated. What is missing?

**Strong answer:**

The limit may be too coarse to reflect resource consumption. Different endpoints can have dramatically different costs, and concurrency can remain high even at an acceptable request rate.

Add weighted request costs, per-endpoint policies, concurrency limits, queue-depth controls, and downstream resource monitoring as appropriate.

## Scenario F: The system must enforce a strict rolling-window quota

**Question:** A user may make at most 100 requests in any rolling 60-second interval. Is Token Bucket sufficient?

**Strong answer:**

Not necessarily. Token Bucket supports a sustained rate and controlled bursts; it does not guarantee a strict maximum over every rolling 60-second interval.

An exact sliding log can enforce the rolling-window requirement by retaining request timestamps, but it has higher state and processing costs. A sliding-window counter is more efficient but approximate.

Choose based on the actual correctness requirement.

## Scenario G: The limiter is adding 30 ms to every request

**Question:** How would you reduce latency?

**Strong answer:**

Measure first: distinguish network round-trip time, Redis command latency, connection-pool wait time, script execution time, and cross-region communication.

Then consider:

- Keeping the limiter state store close to the application.
- Combining operations into one atomic script.
- Reusing connections correctly.
- Removing unnecessary policy evaluations.
- Moving appropriate enforcement into local bounded budgets.
- Reducing cross-region coordination.

Do not sacrifice required correctness guarantees before understanding the bottleneck.

---

# 8. Interview Cheat Sheet

## 8.1 Algorithm selection

| Requirement | Likely choice | Key trade-off |
|---|---|---|
| Simple quota reset at fixed intervals | Fixed Window | Boundary bursts |
| Approximate rolling-window behavior | Sliding-Window Counter | Approximation error |
| Exact rolling-window maximum | Sliding Log | More state and processing |
| Controlled bursts plus sustained rate | Token Bucket | Does not guarantee strict rolling-window maximum |
| Smooth processing or paced output | Leaky Bucket / shaping | May introduce delay or queueing |

## 8.2 Core design decisions

| Question | What to establish |
|---|---|
| What is limited? | User, API key, IP, tenant, endpoint, or resource |
| Where is the limiter placed? | Gateway, application, or multiple layers |
| Is the quota global? | Per instance, per region, or global |
| How is state shared? | Central store, regional state, or bounded local budgets |
| How is the decision atomic? | One atomic operation per quota key |
| What happens on failure? | Fail open, fail closed, or bounded fallback |
| How are bursts handled? | Explicit bucket capacity and refill rate |
| How are expensive endpoints handled? | Weighted costs and concurrency limits |
| How is the system observed? | Rejections, latency, backend health, overshoot, bypasses |
| How is it tested? | Concurrency, stress, failover, clock skew, and policy changes |

## 8.3 Essential formulas

**Token refill**

\[
T_{\text{new}} =
\min\left(C,\ T_{\text{old}} + r\Delta t\right)
\]

Where:

- \(C\) = bucket capacity
- \(r\) = refill rate in tokens per second
- \(\Delta t\) = elapsed time in seconds

For a request with cost \(w\):

- If \(T_{\text{new}} \geq w\), allow and deduct \(w\).
- Otherwise, reject or delay according to the policy.

**Rejection rate**

\[
\frac{\text{Rejected Requests}}{\text{Evaluated Requests}}
\times 100\%
\]

**Token-bucket budget over an interval**

\[
\text{Available Budget} \leq C + r\Delta t
\]

This bound assumes a standard token bucket, no external budget grants, and consistent token accounting.

## 8.4 HTTP behavior

- `429 Too Many Requests`: The client exceeded a rate limit.
- `Retry-After`: Advises when to retry, when the server can provide a useful value.
- Use a consistent error response and document the quota policy.
- Clients should back off rather than retry immediately.
- Do not reveal sensitive internal policy or tenant information in error messages.

## 8.5 Common interview mistakes

Avoid these statements:

- “Token Bucket guarantees no more than N requests in any rolling minute.”
- “Redis replication makes quota updates strongly consistent.”
- “Redis `WAIT` guarantees no quota loss during failover.”
- “Adding read replicas solves hot-key write contention.”
- “Every service should fail open when Redis is down.”
- “A request-rate limit is enough to protect an expensive asynchronous workload.”
- “Dividing a global quota among regions is safe even if allocations overlap.”
- “A clock margin alone guarantees safe token-lease ownership.”
- “A high rejection rate always means the limiter is misconfigured.”

Instead, explain the assumptions, correctness requirements, and trade-offs.

---

# 9. Production Readiness Review Checklist

Use this before considering the design complete.

## Policy and correctness

- [ ] The limited identity and policy scope are explicit.
- [ ] The quota window and burst semantics are defined.
- [ ] Weighted request costs are defined where needed.
- [ ] Atomic state updates are implemented.
- [ ] Boundary conditions and initialization behavior are tested.
- [ ] Global and regional quota allocations cannot overlap.
- [ ] Accepted overshoot, if any, is quantified.

## Reliability

- [ ] Redis or the chosen state store has a documented failure policy.
- [ ] Fail-open, fail-closed, or fallback behavior is selected per policy.
- [ ] Replication and failover limitations are understood.
- [ ] Recovery behavior after state loss is defined.
- [ ] Token leases have safe ownership and expiration semantics.
- [ ] Retries use backoff and jitter where appropriate.
- [ ] Deployment and policy changes are reversible.

## Performance and capacity

- [ ] Expected request rate and peak rate are estimated.
- [ ] Policy evaluations per request are counted.
- [ ] Memory is estimated using realistic key overhead.
- [ ] Hot-key behavior has been tested.
- [ ] Connection pools and backend capacity have been load-tested.
- [ ] Limiter p95 and p99 latency are measured.
- [ ] Expensive endpoints have suitable resource controls.

## Observability

- [ ] Allowed, rejected, delayed, and bypassed requests are measured.
- [ ] Backend latency and error rates are monitored.
- [ ] Replication lag and failovers are monitored where relevant.
- [ ] Alerts have meaningful thresholds and ownership.
- [ ] Logs and traces can identify the source of latency.
- [ ] High-cardinality labels and sensitive data are avoided.

## Validation

- [ ] Unit tests cover algorithm boundaries.
- [ ] Concurrent requests cannot overspend the same shared bucket.
- [ ] Load tests cover normal and burst traffic.
- [ ] Failure injection covers outages and failovers.
- [ ] Clock skew and lease expiry are tested if applicable.
- [ ] Configuration changes and rollbacks are tested.

---

# 10. Final Interview Walkthrough

When asked to design a rate limiter, use this sequence.

**1. Clarify the requirements.**

Ask what is being limited, the quota window, whether bursts are permitted, whether enforcement is global, and what the cost of an incorrect decision would be.

**2. Choose the algorithm.**

Use Fixed Window for simplicity, Sliding-Window Counter for approximate rolling-window behavior, Sliding Log for exact rolling-window enforcement, or Token Bucket for controlled bursts and sustained rate.

**3. Place the limiter.**

Enforce the policy before expensive application work. Use the gateway for broad request protection and application-level checks where business context or resource costs require them.

**4. Define the state model.**

Specify the key, token count, timestamp, capacity, refill rate, and expiration behavior.

**5. Make the decision atomic.**

Use a short atomic operation, such as a Redis Lua script, to refill, check, deduct, and persist quota state.

**6. Scale beyond one instance.**

Use shared state, sharding, regional budgets, or bounded local leases according to the required scope and consistency. Explain the trade-offs rather than claiming that a single approach is universally best.

**7. Handle failure explicitly.**

Choose fail-open, fail-closed, or a bounded fallback based on the endpoint's business risk. Account for replication lag, failover, state loss, and recovery.

**8. Protect expensive resources.**

Combine request-rate limits with weighted costs, concurrency limits, queue-depth limits, or tenant budgets where appropriate.

**9. Monitor and test.**

Measure rejection rates, limiter p95/p99 latency, state-store health, hot keys, overshoot, and bypasses. Validate concurrency, load, failover, and recovery behavior.

**10. State the trade-offs clearly.**

Conclude with the balance between strictness, availability, latency, fairness, and operational complexity.

---

# 11. The Mental Model to Remember

A rate limiter is not just an algorithm. It is a **policy-enforcement system with distributed state**.

The algorithm determines which requests should be allowed. The state model determines how quota is tracked. The coordination model determines whether multiple instances agree. The failure policy determines what happens when coordination breaks. Observability and testing determine whether the system behaves as intended in production.

A strong system design answer connects all five.

**Rate Limiter handbook complete:** Parts 1 and 2 establish the fundamentals and distributed architecture; Part 3 covers production operation, validation, advanced scenarios, and interview review.
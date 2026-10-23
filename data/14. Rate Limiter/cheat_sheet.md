# Rate Limiter — Complete System Design Cheat Sheet
## Senior Software Engineer Interview Reference

## 1. Fundamentals: What, Why, and Where?

### 1.1 What is a rate limiter?

A rate limiter controls the rate at which requests or operations are admitted into a system. It typically enforces a policy over a defined identity, resource, and time interval.

Examples:

- A user can make 100 API requests per minute.
- A tenant can generate 10 reports concurrently.
- An IP address can make 20 login attempts per minute.
- A customer can consume 10,000 API credits per day.
- A service can accept no more than 5,000 requests per second.

These are different kinds of policies. A request-rate limit, a concurrency limit, and a daily resource quota are related but not interchangeable.

### 1.2 Why do we need it?

| Problem | How rate limiting helps |
|---|---|
| Traffic spikes | Limits the rate at which work enters the system |
| Abuse or brute-force attempts | Restricts repeated actions by an identity |
| Noisy neighbors | Prevents one user or tenant from consuming excessive shared capacity |
| Expensive operations | Charges different requests different amounts |
| Uncontrolled API usage | Enforces contractual or subscription quotas |
| Downstream overload | Rejects excess work before it reaches expensive dependencies |

Rate limiting does not automatically prevent every denial-of-service attack. For example, a distributed attack may generate traffic across many IP addresses, so additional network-level protections and identity-based controls may be necessary.

### 1.3 Rate limiting versus related controls

| Control | What it limits | Example |
|---|---|---|
| Rate limiter | Admission rate over time | 100 requests/minute |
| Concurrency limiter | Simultaneous in-flight operations | 20 active exports |
| Queue-depth limit | Pending work | At most 500 queued jobs |
| Circuit breaker | Calls to an unhealthy dependency | Temporarily stop calling a failing service |
| Load shedding | Work rejected under overload | Drop low-priority requests |
| Quota system | Consumption over a longer accounting period | 100,000 credits/month |

**Interview insight:** A rate limiter protects against excessive admission rate. It does not, by itself, guarantee that the number of concurrent requests or the amount of queued work stays bounded.

### 1.4 Where should the limiter be placed?

Typical request path:

`Client → API Gateway → Authentication → Rate Limiter → Application → Database`

The exact ordering depends on the architecture.

**At the API gateway**
- Enforces broad policies before requests reach application instances.
- Provides a consistent entry point.
- May have limited access to business-specific information.

**Inside the application**
- Can use tenant entitlements, endpoint semantics, request cost, or business context.
- Adds implementation and operational responsibility to the application.

**At multiple layers**
- Gateway protects the overall service.
- Application enforces fine-grained business policies.
- Local concurrency limits protect individual instances.

Avoid enforcing the same policy independently at every application instance unless the local budgets are coordinated or intentionally approximate. Otherwise, each instance may grant the full quota separately.

---

## 2. Define the Requirements Before Choosing an Algorithm

A strong system design begins by clarifying what must be limited.

### Functional requirements

- What identity is limited: user, API key, tenant, IP, device, or endpoint?
- What is the quota: requests per second, per minute, or credits per day?
- Are short bursts permitted?
- Does the limit apply globally or independently per region?
- Are different endpoints charged different costs?
- Should excess requests be rejected, delayed, or queued?
- Should policies differ by subscription tier?

### Non-functional requirements

- How much latency can the limiter add?
- What availability is required?
- How strict must enforcement be?
- What quota overshoot, if any, is acceptable during failures?
- What is the expected peak request rate?
- What happens when the limiter's state store is unavailable?
- How quickly must policy changes propagate?

### The key trade-off

Stricter global enforcement generally requires more coordination. More local enforcement reduces latency and dependency on shared state but may allow bounded deviations from the global policy.

You cannot assume strict global coordination, zero added latency, unlimited availability, and zero overshoot simultaneously without examining the underlying architecture and its guarantees.

---

## 3. Rate-Limiting Algorithms

### 3.1 Fixed Window Counter

**How it works**

Maintain a counter for each identity and fixed time window. Increment the counter for each request and reject once the configured maximum is reached. Reset or replace the counter when the window changes.

Example: 100 requests per minute.

- 10:00:00–10:00:59: one counter
- 10:01:00–10:01:59: another counter

**Advantages**
- Simple implementation.
- Low memory usage.
- Efficient atomic counter operations.
- Easy to explain and operate.

**Disadvantages**
- Can allow a burst around the window boundary.
- Does not enforce a strict rolling-window maximum.

**Boundary-burst example**

A client sends 100 requests at 10:00:59 and another 100 at 10:01:00. Both windows permit their full quota, so 200 requests may arrive in approximately two seconds.

**Use when:** Simplicity matters and boundary bursts are acceptable.

### 3.2 Sliding-Window Log

Store timestamps of accepted requests and remove timestamps older than the rolling window. Count the remaining entries before admitting a new request.

For a limit of 100 requests in any rolling 60-second interval, count requests within the preceding 60 seconds.

**Advantages**
- Enforces an exact rolling-window request-count limit when implemented correctly.
- Avoids the fixed-window boundary burst.

**Disadvantages**
- Stores individual timestamps.
- Memory grows with active request volume.
- Requires atomic cleanup, counting, and insertion.
- High-volume identities can create significant processing overhead.

**Use when:** Exact rolling-window enforcement justifies the extra state and processing cost.

### 3.3 Sliding-Window Counter

Combine the current fixed-window count with the previous window's count, weighted by how much of the previous window overlaps the current rolling interval.

A common approximation is:

\[
C_{\text{estimated}} =
C_{\text{current}}+
C_{\text{previous}}\times(1-\alpha)
\]

Here, \(\alpha\) is the fraction of the current window that has elapsed.

Example:

- Previous-window count = 80
- Current-window count = 30
- Fraction of current window elapsed = 0.25

\[
C_{\text{estimated}}=30+80(1-0.25)=90
\]

The estimated usage is 90.

**Advantages**
- Much less state than a timestamp log.
- Smoother behavior than a fixed window.
- Suitable for many API quotas.

**Disadvantages**
- It estimates usage rather than tracking every request timestamp.
- Its accuracy depends on traffic distribution within each window.
- It does not provide the same exact guarantee as a correctly implemented sliding log.

**Use when:** Approximate rolling-window behavior is acceptable.

### 3.4 Token Bucket

The bucket holds tokens. Tokens refill over time, up to a maximum capacity. Each request consumes tokens according to its cost.

Let:

- \(C\) = bucket capacity
- \(T\) = current token balance
- \(r\) = refill rate in tokens per second
- \(\Delta t\) = elapsed time
- \(w\) = request cost

The refill calculation is:

\[
T_{\text{refilled}}=
\min(C,T+r\Delta t)
\]

Then:

- If \(T_{\text{refilled}}\geq w\), allow the request and deduct \(w\).
- Otherwise, reject or delay the request.

**Example**

Capacity = 100 tokens; refill rate = 10 tokens/second.

The bucket can permit a burst of up to 100 tokens when full. After the burst consumes all tokens, approximately 10 tokens become available per second, assuming no other requests consume them.

**Advantages**
- Supports controlled bursts.
- Enforces a sustained consumption rate.
- Supports weighted requests naturally.
- Efficient state representation.

**Disadvantages**
- Requires correct time and state management.
- Does not enforce an exact maximum over every rolling time interval.
- Distributed coordination can become complex.

**Use when:** APIs should permit bursts while maintaining a long-term rate.

### 3.5 Leaky Bucket

The leaky-bucket concept processes or releases traffic at a controlled rate. Incoming work may be queued, and the queue drains at a configured pace.

**Advantages**
- Smooths outgoing traffic.
- Can protect a downstream system from sudden bursts.
- Useful when work can wait.

**Disadvantages**
- Queues consume memory.
- Delayed work increases latency.
- Queue capacity and overflow behavior must be defined.
- It may be unsuitable for requests that require immediate responses.

**Use when:** The system needs traffic shaping or paced processing rather than immediate admission decisions.

### 3.6 Algorithm comparison

| Property | Fixed Window | Sliding Counter | Sliding Log | Token Bucket | Leaky Bucket |
|---|---|---|---|---|---|
| Simple implementation | High | Medium | Low | Medium | Medium |
| Memory efficiency | High | High | Lower | High | Depends on queue |
| Controlled bursts | Boundary artifacts | Approximate | Depends on quota policy | Yes | Usually smooths traffic |
| Exact rolling count | No | No | Yes, when correctly implemented | No | Not its primary guarantee |
| Natural weighted costs | Yes, with counters | Yes, with weighted accounting | Yes | Yes | Depends on implementation |
| Delays requests | No, normally | No, normally | No, normally | No, normally | Often |
| Typical use | Simple quotas | Approximate API limits | Strict rolling quotas | API rate control | Traffic shaping |

**Algorithm selection rule:** Choose based on the guarantee required, not just implementation popularity.

---

## 4. Token Bucket: Important Design Details

### 4.1 Capacity and refill rate are different

- Capacity controls how much burst traffic can be admitted.
- Refill rate controls how quickly the bucket recovers.

A capacity of 100 tokens with a refill rate of 10 tokens/second permits an initial burst of 100 tokens when full, while replenishing at 10 tokens/second.

Do not confuse capacity with the sustained rate.

### 4.2 Weighted requests

If every request costs one token, the limiter counts requests.

If requests have different costs, the bucket represents an abstract budget:

- Metadata read: cost 1
- Search operation: cost 5
- Large report: cost 20

Reject a request if its cost exceeds the available balance.

Validate that costs are positive and that a request's cost is not greater than the bucket's capacity unless the system has a separate policy for such operations.

### 4.3 Time handling

A token bucket typically stores a last-refill timestamp.

Important edge cases:
- A clock moves backward.
- An application node has clock skew.
- An elapsed interval is unusually large.
- The stored state is missing or corrupted.
- Two concurrent requests attempt to update the same bucket.

The refill must be bounded by capacity. Time handling should avoid creating extra tokens because of backward-moving clocks or incorrect initialization.

### 4.4 Expiration

State can expire after a period of inactivity to prevent inactive users from consuming memory indefinitely.

Expiration should not be treated as an arbitrary implementation detail. Define what happens when an expired or missing bucket is recreated.

If every missing bucket is initialized full, state loss may unintentionally grant a fresh burst allowance to every affected user. Initializing empty can instead reject legitimate traffic. Choose deliberately.

---

## 5. Distributed Architecture and Shared State

### 5.1 Why per-instance counters fail

Suppose an API has 10 application instances and the quota is 100 requests/minute per user.

If every instance independently permits 100 requests/minute, the user may receive up to 1,000 requests/minute across the fleet, depending on load distribution.

A per-instance counter is appropriate only when the policy is explicitly local or the budget has been safely partitioned.

### 5.2 Common architecture

`Client → Gateway → Limiter Logic → Shared State Store → Application`

The limiter logic:
1. Identifies the applicable policy.
2. Builds the quota key.
3. Reads and updates quota state atomically.
4. Makes an allow/reject decision.
5. Emits metrics and a response.

The state store may be Redis or another system with the necessary performance and correctness characteristics.

### 5.3 Key design

A quota key should encode the policy scope, not merely the user's name.

Example conceptual key:

`rate_limit:{policy_id}:{tenant_id}:{user_id}`

The exact format depends on the system.

Consider:
- Identity stability.
- Tenant and endpoint isolation.
- Policy versioning.
- Key expiration.
- Privacy and sensitive identifiers.
- Hot-key risk.
- Shard distribution.

Do not trust client-controlled identity fields without authentication and validation.

### 5.4 Atomicity

A naïve implementation may perform separate operations:

1. Read token count.
2. Refill tokens.
3. Check the balance.
4. Deduct tokens.
5. Save the result.

If concurrent requests interleave these operations, they may all see the same old balance and overspend it.

Use an atomic operation for the complete per-key decision. With Redis, a Lua script is a common option.

**Atomicity is not the same as durability.** A script can execute atomically on the active Redis server, while replication and failover still create a possibility of losing recent updates.

---

## 6. Redis Implementation and Consistency

### 6.1 What should an atomic script do?

For a token bucket, a conceptual script should:

1. Read the existing token balance and last-refill timestamp.
2. Initialize state according to the explicit missing-state policy.
3. Calculate elapsed time safely.
4. Refill tokens, capped at capacity.
5. Compare the available balance with request cost.
6. Deduct tokens if allowed.
7. Persist the updated state and appropriate expiration.
8. Return the decision and useful metadata.

The script should be short, predictable, and bounded. Avoid expensive scans or unbounded work in the request path.

### 6.2 Redis replication and failover

Redis replication may be asynchronous. If the primary accepts a token deduction but fails before the update reaches the replica, a promoted replica may restore an older balance.

This can allow quota overshoot.

Mitigations depend on the required guarantee:
- Choose appropriate replication and durability settings.
- Understand the failover behavior of the deployment.
- Use replication acknowledgments where justified.
- Limit burst sizes where appropriate.
- Consider bounded fallback or recovery policies.
- Monitor failovers and observed overshoot.

Redis `WAIT` can wait for replica acknowledgments of writes issued on the same client connection. It may reduce some risk, but it does not guarantee strong consistency or zero data loss on failover. It also adds latency.

### 6.3 What if Redis is unavailable?

Decide the behavior before the incident.

**Fail-open:** Allow requests when the limiter cannot decide. Availability improves, but downstream protection weakens.

**Fail-closed:** Reject requests when the limiter cannot decide. Protection is preserved, but legitimate requests fail.

**Bounded local fallback:** Enforce a local budget while shared state is unavailable. This can preserve some availability without granting unlimited access, but it does not automatically preserve a strict global quota.

Different endpoints may need different policies.

### 6.4 What if Redis is reachable but stale?

This is different from an outage. The limiter can return a decision while using stale or recently recovered state.

Fail-open/fail-closed alone does not solve stale-state correctness. The architecture must explicitly account for replication, failover, recovery, and the accepted overshoot tolerance.

---

## 7. Scaling: Hot Keys, Sharding, Leases, and Regions

### 7.1 Hot keys

A single user's quota key can become extremely popular. Even if the Redis deployment has many shards, all updates to that key may concentrate on one shard.

Adding read replicas does not solve the write contention if every request must atomically update the same key.

Possible approaches:
- Allocate bounded local token leases.
- Partition a global budget into uniquely owned sub-budgets.
- Separate policies for different workload classes.
- Reduce redundant policy evaluations.
- Move appropriate local protection closer to the application.

Each option changes coordination, utilization, fairness, or enforcement precision.

### 7.2 Local token leases

A central authority can allocate a bounded token budget to a local process or region. The local process consumes those tokens without coordinating with the central store on every request.

Benefits:
- Fewer shared writes.
- Lower decision latency.
- Reduced pressure on hot shared keys.

Trade-offs:
- Unused tokens may become stranded.
- Leases require safe expiration and recovery.
- A stale owner must not spend tokens after its budget has been reassigned.
- Clock margins reduce risk but do not, by themselves, guarantee safe ownership.

Fencing tokens can help when the protected resource validates the fencing token and rejects stale owners. Merely generating a fencing token without enforcing it at the resource is insufficient.

### 7.3 Multi-region quota enforcement

Suppose a user has a global allowance of 1,000 tokens across three regions.

A regional allocation could be:
- Region A: 500
- Region B: 300
- Region C: 200

The allocations must be uniquely owned and must not overlap. The sum of regional allocations must not exceed the global budget.

**Advantages**
- Lower request latency.
- Reduced cross-region coordination.
- Better regional autonomy.

**Disadvantages**
- One region may exhaust its budget while another has unused tokens.
- Rebalancing requires coordination.
- Failures and ownership transfers must be handled safely.

If the requirement is a strict global quota, independent regions cannot each grant the entire global allowance.

### 7.4 Hierarchical rate limiting

A production design can combine:
- Global user quota.
- Regional admission budget.
- Local per-instance concurrency cap.
- Queue-depth limit for asynchronous work.

These controls solve different problems. A global quota protects the entitlement; regional budgets reduce coordination; local concurrency limits protect individual instances.

---

## 8. Weighted Limits, Concurrency, and Fairness

### 8.1 Why request count can be misleading

One endpoint may return a small metadata response, while another performs a large database query or generates a multi-gigabyte export.

Allowing 100 requests of each type does not imply equal resource consumption.

Use weighted costs when a meaningful cost model is available. Treat weights as estimates unless the system can measure resource consumption accurately.

### 8.2 Combine controls

For an export service, a good policy may include:

- API request rate: limit how quickly jobs can be submitted.
- Per-tenant quota: limit aggregate consumption.
- Active-job limit: bound concurrent exports.
- Queue-depth limit: bound pending work.
- Resource budget: account for estimated or measured cost.

### 8.3 Fairness

A per-user limit does not necessarily protect a tenant if that tenant has thousands of users.

A tenant-wide limit does not necessarily protect individual users within that tenant.

Use policy scopes that match the resource being protected. For high-contention workloads, consider scheduling and fair allocation in addition to admission rate limiting.

---

## 9. HTTP Responses and Client Behavior

### 9.1 Standard response

Use HTTP `429 Too Many Requests` when a client exceeds a rate limit.

A response may include:
- A consistent error code.
- A short explanation.
- `Retry-After`, if a meaningful retry time is known.
- A request or correlation ID.

Avoid disclosing sensitive policy details or other tenants' information.

### 9.2 Retry behavior

Clients should not immediately retry every 429.

Recommended behavior:
- Respect `Retry-After` when supplied.
- Use exponential backoff with jitter for retryable failures.
- Avoid retrying faster than quota can replenish.
- Use bounded retry attempts or retry budgets.
- Distinguish quota rejection from transient infrastructure failure.

Retries can amplify load during an incident. A rate limiter and a retry policy should be designed together.

### 9.3 Reject, delay, or queue?

- **Reject:** Suitable for synchronous APIs when the client can retry later.
- **Delay:** Useful when the system can safely wait without exhausting resources.
- **Queue:** Suitable for asynchronous workloads that can be processed later, provided queue depth is bounded.

A queue is not an unlimited solution. Unbounded queuing merely converts an admission overload into a memory, storage, or latency problem.

---

## 10. Monitoring and Observability

### 10.1 Request metrics

Track:
- Total requests evaluated.
- Allowed and rejected requests.
- Rejection rate.
- Decisions by endpoint and policy.
- Limiter bypasses.
- Requests delayed or queued, if supported.
- Quota overshoot.

Rejection rate:

\[
\text{Rejection Rate}=
\frac{\text{Rejected Requests}}{\text{Evaluated Requests}}
\times100\%
\]

A high rejection rate is not automatically a bug. It may reflect a traffic spike or expected policy enforcement. Investigate sudden changes and business impact.

### 10.2 Latency metrics

Track:
- Limiter p50, p95, and p99 latency.
- State-store command latency.
- Connection-pool wait time.
- Timeouts and errors.
- End-to-end API latency.

A low p50 does not guarantee a healthy system if p99 is high.

### 10.3 Infrastructure metrics

For Redis or the selected backend, monitor:
- CPU and memory.
- Network throughput.
- Connections and pool saturation.
- Command latency.
- Evictions and key count.
- Replication lag.
- Failovers and reconnects.
- Hot-key concentration.

### 10.4 Avoid high-cardinality metrics

Do not create a separate metrics time series for every user ID or API key. Use bounded labels such as endpoint template, policy, region, and outcome. Use structured logs or traces for individual investigations.

### 10.5 Example incident: p99 latency increases

1. Identify affected endpoints and regions.
2. Inspect the limiter's trace span.
3. Check backend latency, CPU, connections, and timeouts.
4. Look for hot keys and traffic changes.
5. Review deployments and policy changes.
6. Mitigate the actual bottleneck without blindly disabling protection.
7. Verify latency recovery and enforcement correctness.

---

## 11. Capacity Planning and Testing

### 11.1 Estimate request volume

If a service handles 20,000 requests/second and performs one atomic rate-limit evaluation per request, it performs approximately 20,000 evaluations/second before retries or extra policies.

If each request evaluates three independent policies, the workload may approach 60,000 evaluations/second.

This is a workload estimate, not a throughput guarantee. Actual capacity depends on script complexity, key distribution, hardware, network latency, and contention.

### 11.2 Estimate active state

Suppose 2 million users each have one active key, and the measured average total cost per key is 300 bytes:

\[
2{,}000{,}000\times300
=600{,}000{,}000\text{ bytes}
\]

That is about 600 MB in decimal units.

The 300-byte figure must represent realistic total memory consumption, including Redis overhead. Validate with representative data rather than relying only on the raw token payload size.

### 11.3 Testing checklist

**Unit tests**
- Bucket starts at the configured initial balance.
- Refill is capped at capacity.
- Requests consume the correct cost.
- Insufficient balances are rejected.
- Invalid costs and timestamps are handled.
- Missing and expired state follows the defined policy.

**Concurrency tests**
- Many simultaneous requests target the same key.
- Atomicity prevents unintended overspending.
- Rejected requests do not deduct tokens unless explicitly designed to do so.

**Load tests**
- Normal traffic.
- Peak traffic.
- Sudden bursts.
- Skewed traffic and hot keys.
- Mixed cheap and expensive endpoints.

**Failure tests**
- Backend outage.
- Network timeout.
- Primary failover.
- Replication lag.
- State loss.
- Clock skew.
- Lease expiration.
- Policy change and rollback.

Define the expected result for each test before running it.

---

## 12. Advanced Interview Scenarios

### Scenario 1: Strict global quota across three regions

**Answer outline:**
- Clarify the global quota and acceptable overshoot.
- Explain that per-request global coordination is expensive.
- Allocate uniquely owned regional budgets whose sum is bounded by the global quota.
- Discuss stranded capacity and safe rebalancing.
- Explain how failover affects ownership and accounting.

### Scenario 2: A single hot key overloads Redis

**Answer outline:**
- Confirm the hot key is the bottleneck.
- Explain why read replicas do not remove shared write contention.
- Consider bounded local token leases or partitioned sub-budgets.
- Discuss fairness, stranded capacity, and safe recovery.

### Scenario 3: Redis becomes unavailable

**Answer outline:**
- Choose fail-open, fail-closed, or bounded local fallback according to business risk.
- Do not assume one strategy is correct for every endpoint.
- Bound fallback consumption.
- Monitor fallback activation and potential downstream overload.

### Scenario 4: Quota overshoot after failover

**Answer outline:**
- Recent token deductions may have been lost when a stale replica was promoted.
- Evaluate replication and durability guarantees.
- Consider acknowledgments, conservative recovery, and smaller burst capacity where appropriate.
- Explain that `WAIT` reduces some risk but does not guarantee strong consistency.

### Scenario 5: The limiter is healthy but the database is overloaded

**Answer outline:**
- Request count may not reflect resource cost.
- Add weighted endpoint costs, concurrency limits, queue-depth limits, and resource budgets.
- Check whether traffic bypasses the limiter.
- Monitor the actual downstream bottleneck.

### Scenario 6: The product demands at most 100 requests in any rolling 60 seconds

**Answer outline:**
- Token Bucket alone does not guarantee this strict rolling-window maximum.
- Sliding Log can enforce the exact rolling count but costs more state and processing.
- Sliding-Window Counter is more efficient but approximate.
- Choose based on the exact guarantee required.

### Scenario 7: Limiter latency adds 30 ms per request

**Answer outline:**
- Decompose network, backend, connection-pool, and script latency.
- Keep operations atomic but avoid unnecessary round trips.
- Reuse connections appropriately.
- Reduce redundant policy checks.
- Consider local bounded budgets if the correctness trade-off is acceptable.

---

## 13. Common Mistakes to Avoid

| Incorrect claim | Better explanation |
|---|---|
| Token Bucket enforces a strict rolling-window maximum | It supports controlled bursts and a sustained refill rate |
| Every application instance can use its own full quota | Independent full quotas multiply the effective allowance |
| Redis replication guarantees strong consistency | Recent updates may be lost during failover |
| `WAIT` guarantees zero data loss | It can reduce risk but does not provide that guarantee |
| Read replicas solve hot-key writes | Shared atomic writes to one key remain concentrated |
| Fail-open is always best for availability | It may expose expensive downstream systems to overload |
| Fail-closed is always safest | It can unnecessarily deny legitimate work |
| A per-user limit protects the whole tenant | Aggregate tenant limits may also be required |
| Request rate alone protects expensive work | Concurrency, queue depth, and weighted cost may be necessary |
| Clock margins guarantee safe leases | Safe ownership and recovery must be enforced |
| High rejection rate means the limiter is broken | Rejections may be expected under policy or traffic spikes |

---

## 14. Final Design Review Checklist

### Requirements
- [ ] Identity and policy scope are defined.
- [ ] Quota window and burst semantics are explicit.
- [ ] Global versus regional enforcement is clear.
- [ ] Acceptable overshoot is documented.
- [ ] Fail-open, fail-closed, or fallback behavior is chosen.

### Algorithm and correctness
- [ ] Algorithm matches the required guarantee.
- [ ] Token refill and deduction are correct.
- [ ] Shared state updates are atomic.
- [ ] Boundary cases and initialization are tested.
- [ ] Weighted costs and concurrency controls are included where necessary.

### Distributed architecture
- [ ] Shared state and key design are defined.
- [ ] Sharding and hot-key behavior are understood.
- [ ] Replication and failover trade-offs are explicit.
- [ ] Regional budgets cannot overlap.
- [ ] Local leases have safe expiration and ownership rules.

### Operations
- [ ] Latency, rejection, and error metrics are available.
- [ ] Backend health and replication are monitored.
- [ ] Alerts and incident procedures are defined.
- [ ] Capacity is tested at peak traffic.
- [ ] Policy changes and rollbacks are safe.
- [ ] Failure injection covers outages and recovery.

---

## 15. The 90-Second Senior-Level Interview Answer

“I'd first clarify the identity being limited, quota window, burst behavior, whether enforcement must be global, and the cost of incorrect decisions.

For the algorithm, I'd choose Token Bucket for controlled bursts and sustained rate, Sliding-Window Counter for approximate rolling-window quotas, or Sliding Log if an exact rolling-window maximum is required.

I'd enforce the policy at the gateway or application layer based on the available context. For distributed enforcement, I'd maintain shared quota state in Redis and use an atomic Lua script to refill, check, deduct, and persist tokens.

For scalability, I'd evaluate sharding, hot keys, regional budget allocation, and bounded local token leases. I'd explain the consistency trade-offs rather than assuming that Redis replication guarantees strict global enforcement.

I'd explicitly define fail-open, fail-closed, or bounded fallback behavior for each endpoint based on business risk. For expensive operations, I'd supplement request-rate limits with weighted costs, concurrency limits, and queue-depth controls.

Finally, I'd monitor allowed and rejected traffic, p95/p99 latency, backend health, hot keys, and quota overshoot. I'd validate the design using concurrency tests, burst load tests, failover tests, and recovery tests.”

---

## 16. One-Line Mental Model

**Requirements → Algorithm → State → Atomicity → Coordination → Failure policy → Observability → Testing**

A strong rate-limiter design is not just an algorithm. It is a policy-enforcement system whose correctness, coordination, failure behavior, and operational characteristics must all be understood.
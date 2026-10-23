# Rate Limiter — System Design Handbook

## Part 1: Fundamentals, Requirements, Algorithms & Design Decisions

## 1. What Is a Rate Limiter?

A rate limiter controls how frequently a client can make requests or consume resources within a defined period.

It acts as an **admission-control mechanism**: before a request consumes significant application resources, the system decides whether the request should be allowed to proceed.

Consider an e-commerce platform with an API that allows each authenticated user to make 100 requests per minute.

- User A makes 80 requests: all are allowed.
- User A makes another 20 requests: all are allowed.
- User A makes request 101 before sufficient quota becomes available: the request is rejected or delayed, depending on the policy.
- User B has an independent quota and is unaffected by User A's usage, unless a separate system-wide limit is reached.

The rate limiter needs to maintain enough state to determine whether a request is permitted. That state might be a counter, a collection of request timestamps, or a token balance and refill timestamp.

### 1.1 Why do we need a rate limiter?

**Resource protection**

Excessive traffic can exhaust CPU, memory, database connections, thread pools, and network bandwidth. A limiter can reject excess requests before they trigger expensive operations.

**Abuse prevention**

Automated clients can repeatedly call login, search, report-generation, or other endpoints. Rate limiting reduces the impact of excessive request patterns.

**Fairness**

In a multi-tenant system, one tenant should not consume a disproportionate share of shared resources and degrade service for everyone else.

**Availability**

A system that admits more work than it can process accumulates queues, experiences rising latency, and may eventually fail. Rate limiting helps control incoming demand.

**Cost control**

APIs that trigger large database queries, machine-learning inference, or report generation can incur substantial infrastructure costs. A request quota or resource-cost budget can help bound consumption.

### 1.2 Rate limiting versus related mechanisms

| Mechanism | Primary purpose | Example |
|---|---|---|
| Rate limiter | Restrict the frequency or budget of admitted requests | 100 requests/minute/user |
| Concurrency limiter | Restrict simultaneous in-flight operations | 3 active reports/user |
| Load balancer | Distribute traffic across instances | Route requests across 10 servers |
| Circuit breaker | Stop or limit calls to a failing dependency | Temporarily stop calling an unhealthy database service |
| Retry with backoff | Recover from transient failures without overwhelming a dependency | Retry after an increasing delay |
| Queue | Buffer work for later processing | Generate reports asynchronously |
| Autoscaling | Increase or decrease available capacity | Add application instances as load increases |

These mechanisms complement each other.

For example, a rate limiter might permit five report-generation requests per minute, but all five could execute simultaneously. A concurrency limiter might additionally restrict a user to two reports running at once.

Likewise, a load balancer distributes requests but does not automatically limit the total requests a particular user can make.

**Interview takeaway:** First identify the behavior or resource you need to control. Then decide whether rate limiting alone is sufficient or whether concurrency limits, queues, or other controls are also needed.

---

## 2. Define the Requirements Before Choosing an Algorithm

Choosing Redis or a particular algorithm before clarifying the requirements can lead to unnecessary complexity or incorrect enforcement.

Start with the following questions.

### 2.1 Who or what is being limited?

Possible limiting identities include:

- **User ID:** Suitable for authenticated users.
- **API key:** Useful for external API consumers and developers.
- **IP address:** Useful for coarse protection of unauthenticated endpoints.
- **Organization or tenant ID:** Appropriate when multiple users share a quota.
- **Endpoint:** Useful for protecting a particular operation.
- **Composite identity:** For example, a user ID combined with an endpoint.

Example keys:

```text
rate_limit:user:12345
rate_limit:user:12345:report_generation
rate_limit:tenant:acme
rate_limit:ip:203.0.113.10:login
```

Each key represents a different policy. A user-level key applies to the user's general quota, while a user-plus-endpoint key can enforce a separate limit for a particular operation.

#### Important identity considerations

**IP addresses are imperfect identifiers.** Many legitimate users can share one public IP through NAT, a corporate proxy, or a mobile carrier. Conversely, one abusive client may rotate IP addresses.

**Authenticated identities need to be trustworthy.** A client must not be allowed to choose an arbitrary user ID and thereby access someone else's quota.

**Unauthenticated endpoints need separate policies.** A login endpoint cannot always rely on an authenticated user ID, so IP-based limits, account-based limits, or combinations of signals may be appropriate.

### 2.2 What exactly are we limiting?

Different limits protect different resources.

| Policy | Example | Primary objective |
|---|---|---|
| Request rate | 100 requests/minute | Control request volume |
| Concurrency | 5 simultaneous operations | Control in-flight work |
| Daily quota | 10,000 requests/day | Control long-term consumption |
| Resource budget | 500 cost units/minute | Account for expensive operations |
| Endpoint-specific quota | 5 reports/minute | Protect a costly API |
| Tenant-wide quota | 5,000 requests/minute/tenant | Isolate shared usage |

These constraints can coexist.

For example, a user might have:

- 100 general API requests per minute.
- 5 report-generation requests per minute.
- At most 2 reports running concurrently.
- A daily budget of 1,000 resource-cost units.

The general request limit does not replace the concurrency limit or the daily budget.

### 2.3 What does the time interval mean?

A limit of 100 requests per minute is ambiguous until we define its enforcement semantics.

It could mean:

- At most 100 requests in each fixed calendar minute.
- At most 100 requests in every rolling 60-second interval.
- A sustained rate of approximately 100 requests per minute, with controlled bursts permitted.

These are different policies. A fixed-window counter can permit 200 requests across a minute boundary, while a token bucket can permit a burst of accumulated tokens plus newly replenished tokens.

**Always clarify whether the requirement is a strict rolling-window maximum or a sustained rate with burst capacity.**

### 2.4 How strict must enforcement be?

There are two broad design goals.

**Approximate enforcement**

Small quota overshoots may be acceptable in exchange for lower latency, higher throughput, or less coordination.

**Strict enforcement**

The system must prevent concurrent requests or distributed instances from exceeding the authorized quota within the defined policy.

Strict enforcement requires careful handling of atomicity, shared state, failover, and distributed quota allocation. The guarantees depend on the actual implementation.

A senior-level answer should state the desired guarantee rather than simply claiming that a distributed limiter is globally accurate.

### 2.5 What happens when the quota is exhausted?

Possible responses include:

- Reject the request.
- Return HTTP `429 Too Many Requests`.
- Include a `Retry-After` header if a useful retry time can be calculated.
- Delay or queue the request when bounded waiting is appropriate.

For synchronous APIs, rejection is often simpler than queueing. A queue must be bounded because unlimited waiting work can itself exhaust memory and other resources.

---

## 3. Where Should the Rate Limiter Live?

Consider the request path:

```text
Client
  |
  v
Load Balancer
  |
  v
API Gateway
  |
  v
Application Instances
  |
  v
Database / Downstream Services
```

The enforcement point determines how early the system can reject traffic and what information is available to make the decision.

### 3.1 API gateway enforcement

The gateway authenticates or validates the request identity, evaluates the applicable policy, and forwards only permitted requests.

**Advantages**

- Centralizes enforcement across multiple services.
- Rejects excess traffic before it consumes significant application resources.
- Provides a consistent place for user-, API-key-, and IP-based policies.
- Simplifies policy configuration and monitoring.

**Trade-offs**

- The gateway needs access to a trustworthy identity.
- Multiple gateway replicas must coordinate quota state.
- Business-specific request costs may not be known until the application examines the operation.
- A shared quota store can become a dependency or bottleneck.

### 3.2 Application-level enforcement

The application checks the quota after receiving the request, using middleware or business logic.

**Advantages**

- Can use detailed business context to determine request cost.
- Useful when limits depend on the operation's actual behavior.
- Can enforce policies close to a specific database or downstream dependency.

**Trade-offs**

- Some application resources have already been consumed before rejection.
- Policy duplication across services can lead to inconsistent enforcement.
- A shared quota mechanism is still needed when the policy spans multiple instances.

### 3.3 Can both layers enforce limits?

Yes. Different layers can enforce different policies.

For example:

- The gateway applies a broad per-user request limit.
- The report service applies a separate report-generation quota.
- A concurrency limiter restricts the number of active reports.
- A downstream database-protection mechanism limits expensive queries.

The policies must be designed together so one layer does not unintentionally undermine another.

### 3.4 Why multiple instances change the design

Suppose 10 application instances independently allow 100 requests per minute for a user.

If a user can distribute traffic across all 10 instances, the effective allowance may become 1,000 requests per minute.

Centralizing the code at an API gateway does not automatically fix this if the gateway itself has multiple replicas.

The system needs either:

1. Shared quota state accessed by all relevant instances.
2. Safely allocated, non-overlapping quota budgets that instances can enforce locally.

The first approach is straightforward conceptually but introduces shared-state traffic. The second can reduce coordination but makes allocation, expiration, and rebalancing more complicated.

---

## 4. Rate-Limiting Algorithms

The algorithms differ in how they count requests, handle bursts, and trade simplicity for precision.

## 4.1 Fixed window

A fixed-window limiter divides time into fixed intervals and maintains a counter for each interval.

Suppose the limit is 100 requests per minute.

```text
10:00:00–10:00:59 → Maximum 100 requests
10:01:00–10:01:59 → Maximum 100 requests
10:02:00–10:02:59 → Maximum 100 requests
```

When a request arrives, the limiter identifies the current window, increments its counter, and permits the request if the count remains within the configured limit.

### Example implementation

For a fixed-window counter, state might conceptually look like this:

```text
Key: rate_limit:user:12345:window:10:01
Value: 37
```

The counter represents requests admitted during that window. An implementation can use an expiry aligned with the window boundary or a key that changes with each window.

The check and increment must still be atomic if concurrent requests could otherwise exceed the limit.

### The boundary problem

Suppose the user sends:

- 100 requests at 10:00:59.
- 100 requests at 10:01:00.

The limiter accepts both groups because they belong to different windows. The user has made 200 requests in approximately one second.

This is the defining weakness of fixed windows: the configured limit applies separately to each fixed interval, not to every possible rolling interval.

### Advantages

- Simple to understand.
- Low storage and computational overhead.
- Easy to implement with counters and expiration.
- Useful for coarse quotas and billing periods.

### Disadvantages

- Allows boundary bursts.
- Does not provide a strict rolling-window maximum.
- Requires atomic counter updates in a concurrent implementation.

### When should we use it?

Use fixed windows when simplicity and low overhead matter more than strict rolling-window behavior.

It can be appropriate for coarse quotas, such as a daily request allowance, depending on the exact business semantics.

---

## 4.2 Sliding window

A sliding-window limiter evaluates requests over a moving interval rather than resetting the entire quota at fixed boundaries.

For a 60-second window, the limiter considers requests made during the most recent 60 seconds.

As time advances, older requests leave the window and newer requests enter it.

### Exact sliding log

One implementation stores the timestamps of individual requests.

For every incoming request:

1. Remove timestamps older than the current rolling interval.
2. Count the remaining timestamps.
3. Reject the request if the count has reached the limit.
4. Otherwise, record the new request and allow it.

If the limit is 100 requests per 60 seconds, the limiter counts the timestamps that fall within that rolling interval.

**Advantage:** Accurate rolling-window enforcement when the operation is implemented correctly.

**Disadvantages:**

- Potentially stores many timestamps per user.
- Requires timestamp cleanup or equivalent expiration.
- Adds processing overhead compared with a simple counter.
- Still requires atomic coordination if requests arrive concurrently.

### Sliding-window counter

A sliding-window counter approximates the rolling request count using the previous and current fixed-window counters.

For example:

- Previous-window count: 80.
- Current-window count: 20.
- Current window is 25% complete.

An approximate count is:

\[
\text{Estimated count}
=
80 \times (1 - 0.25) + 20
\]

\[
= 80
\]

The calculation estimates how much of the previous window's traffic is likely to remain relevant to the current rolling interval.

This is cheaper than storing every timestamp, but it is an approximation. The actual distribution of requests within the previous window may differ from the assumption.

### Advantages

- More consistent enforcement over time.
- Avoids the classic fixed-window boundary burst.
- Counter-based variants can reduce storage compared with exact logs.

### Disadvantages

- Exact sliding logs can be expensive at high request volumes.
- Counter-based variants introduce estimation error.
- Concurrent updates still require careful coordination.

### When should we use it?

Use a sliding window when the requirement is explicitly about the maximum number of requests over a rolling interval.

For example, an API might require that no more than 100 requests occur in any 60-second period.

Be clear about whether an exact sliding log or an approximate sliding-window counter satisfies the requirement.

---

## 4.3 Token bucket

Token bucket is a strong choice when an API should permit controlled bursts while restricting sustained traffic.

Each client has a bucket containing tokens.

- The bucket has a maximum capacity.
- Tokens replenish at a configured rate.
- Each request has a token cost.
- A request is admitted if enough tokens are available.
- The request's cost is deducted when it is admitted.
- If insufficient tokens remain, the request is rejected or delayed.

### Worked example

Suppose:

- Bucket capacity: 100 tokens.
- Refill rate: 100 tokens per minute.
- Ordinary request cost: 1 token.

A full bucket permits a burst of up to 100 ordinary requests.

Once empty, the bucket replenishes at approximately 1.67 tokens per second. If the user stops sending requests, tokens accumulate until the bucket is full.

### How is the token balance calculated?

A conceptual implementation maintains:

- \(T_{\text{old}}\): previously stored token balance.
- \(t_{\text{old}}\): last refill timestamp.
- \(t_{\text{now}}\): current time.
- \(r\): refill rate, in tokens per second.
- \(C\): bucket capacity.
- \(w\): cost of the incoming request.

First calculate the elapsed time:

\[
\Delta t = \max(0, t_{\text{now}} - t_{\text{old}})
\]

Calculate newly replenished tokens:

\[
T_{\text{refill}} = r \times \Delta t
\]

Cap the balance at the bucket's maximum capacity:

\[
T_{\text{available}}
=
\min(C,\ T_{\text{old}} + T_{\text{refill}})
\]

Then check the incoming request:

- If \(T_{\text{available}} \geq w\), allow the request and deduct its cost.
- Otherwise, reject or delay the request.

For an admitted request:

\[
T_{\text{new}} = T_{\text{available}} - w
\]

The updated balance and timestamp must be stored consistently. In a distributed implementation, the read, refill, check, and deduction must be atomic to prevent concurrent requests from spending the same tokens.

### What does capacity control?

Bucket capacity controls the maximum accumulated burst.

A capacity of 100 means that, when full, the bucket can authorize up to 100 one-token requests immediately.

A larger bucket permits larger bursts; a smaller bucket limits burst size.

### What does refill rate control?

The refill rate controls the sustained token budget.

At 100 tokens per minute, the bucket replenishes 100 tokens over a minute, subject to the capacity ceiling.

Capacity and refill rate therefore serve different purposes:

- Capacity determines how much can be spent in a burst.
- Refill rate determines how quickly spending capacity is replenished.

### Important distinction: sustained rate versus rolling-window maximum

A bucket with capacity 100 and refill rate 100 tokens per minute does not enforce a maximum of 100 requests in every rolling 60-second interval.

A user may spend accumulated tokens at the beginning of the interval and then spend additional tokens replenished during the interval.

If the requirement is a strict rolling-window maximum, use an algorithm and implementation that enforce that requirement.

### Advantages

- Supports controlled bursts.
- Controls sustained request rates.
- Supports different request costs.
- Works well with atomic state updates in a shared store.
- Can avoid storing every request timestamp.

### Disadvantages

- Requires token-balance and refill-time state.
- Concurrent updates must be atomic.
- Capacity and refill rate require careful tuning.
- A token budget is an approximation of actual resource consumption unless costs are calibrated to real usage.

### When should we use it?

Use token bucket when short bursts are legitimate but sustained traffic must remain controlled.

For our e-commerce scenario, it is a good starting point because product browsing may occur in bursts while the service still needs a predictable long-term admission rate.

---

## 4.4 Leaky bucket

Leaky bucket is commonly used to smooth traffic into a more regular processing rate.

Imagine incoming requests entering a bounded queue that drains at a configured rate.

```text
Incoming bursts
      |
      v
Bounded queue
      |
      v
Controlled-rate processing
      |
      v
Downstream service
```

The queue absorbs short bursts, but processing proceeds at a controlled pace. If the queue fills, new requests are rejected or handled according to policy.

### Example

Suppose report generation can safely begin at five operations per second.

A bounded queue can temporarily absorb a burst of report requests while workers start processing them at the configured pace.

If incoming work continues to exceed processing capacity, the queue eventually fills. The system must then reject additional requests or apply another bounded admission policy.

### Advantages

- Smooths incoming bursts.
- Helps protect downstream systems that need predictable processing.
- Separates request arrival rate from processing rate.

### Disadvantages

- Adds queueing latency.
- Requires queue capacity and scheduling.
- Requests may be rejected when the queue fills.
- Queueing alone does not guarantee a per-user quota.

The term *leaky bucket* is also used for counter-based policing algorithms. In an interview, clarify whether you're describing queue-based traffic shaping or a bucket-based rate-enforcement algorithm.

---

## 5. Choosing the Right Algorithm

| Requirement | Suitable starting point | Main trade-off |
|---|---|---|
| Simple requests-per-minute quota | Fixed window | Boundary bursts |
| Maximum requests over a rolling interval | Sliding window | More state or computation |
| Controlled bursts with sustained rate control | Token bucket | Not a strict rolling-window count |
| Smooth traffic toward downstream processing | Leaky bucket with bounded queue | Queueing latency |

There is no universally best algorithm.

The choice depends on:

1. Whether bursts are legitimate.
2. Whether a strict rolling-window maximum is required.
3. How much state and computation the implementation can afford.
4. Whether the system should reject or delay excess requests.
5. Whether requests have different resource costs.

For the running e-commerce scenario, token bucket is a good default because occasional bursts are acceptable while sustained traffic needs to remain controlled.

---

## 6. Weighted Requests: Account for Resource Cost

Not all requests consume the same resources.

Consider these operations:

| Operation | Example cost |
|---|---:|
| Product lookup | 1 token |
| Database-heavy search | 5 tokens |
| Excel report generation | 20 tokens |

If every request costs one token, a user could trigger many expensive report generations while remaining within a request-count limit.

### How weighted token bucket works

1. Determine the request's cost from a trusted policy.
2. Refill the bucket according to elapsed time.
3. Check whether enough tokens remain for that request.
4. Atomically deduct the cost if the request is admitted.
5. Reject or delay the request if insufficient tokens remain.

### Why combine weights with endpoint limits?

Weighted costs approximate resource consumption, but they do not necessarily control every relevant dimension.

For example, a report-generation request might cost 20 tokens, yet several reports could still execute simultaneously and consume substantial memory.

A more complete policy might combine:

- A general per-user token bucket.
- A separate report-generation quota.
- A maximum number of concurrent reports.
- A global resource limit for the report service.

### Critical design detail

The cost should reflect the resource being protected. If a request's actual resource use varies significantly, a fixed token weight may not be sufficient.

Weighted tokens are a useful approximation, not a guarantee that actual CPU, memory, or database consumption will exactly match the configured cost.

---

## 7. HTTP Behavior and Client Experience

A rate limiter affects both the backend and the client contract.

### HTTP 429

When a request exceeds its quota, the API can return:

```text
HTTP/1.1 429 Too Many Requests
Retry-After: 10
```

The example indicates that the client should wait before retrying. The actual value should reflect the policy and the time at which a request may become eligible again.

### Why Retry-After matters

Without retry guidance, clients may immediately retry rejected requests. This can increase load and create repeated rejection traffic.

A useful client strategy is to:

- Respect `Retry-After` when supplied.
- Apply bounded exponential backoff where appropriate.
- Add jitter to avoid many clients retrying simultaneously.
- Avoid unlimited retries.

### Rejection versus queueing

Rejection is often appropriate for synchronous APIs because it provides immediate feedback and avoids accumulating work.

Queueing can be useful when the operation is asynchronous, such as report generation, but the queue must have bounded capacity and a defined overflow policy.

The client experience is part of the design, not an afterthought.

---

## 8. Critical vs. Optional Features

### Critical for a production design

- Clearly defined limiting identity and quota.
- Correct enforcement across application or gateway replicas.
- Atomic quota updates when concurrent requests could overspend.
- Explicit failure behavior.
- Protection against abusive traffic and expensive operations.
- Monitoring of latency, rejections, errors, and enforcement accuracy.
- A defined response for rejected requests.

### Optional or workload-dependent

- Weighted request costs.
- Per-endpoint and per-tenant quotas.
- Multi-region quota allocation.
- Local token leases to reduce shared-store traffic.
- Dynamic quota adjustment and automated rebalancing.
- Sophisticated client retry guidance.

These features add value when justified by traffic volume, resource cost, or geographic distribution. Avoid adding complexity without a requirement that warrants it.

---

## 9. If the Rate Limiter Fails, What Is the Business Impact?

The rate limiter protects the application, but it can itself become a dependency.

### Fail-open

If the limiter is unavailable, requests continue without quota verification.

**Potential benefit:** Better availability for users.

**Potential risk:** Uncontrolled traffic may overwhelm application instances or downstream services.

### Fail-closed

If the limiter is unavailable, requests are rejected because their quotas cannot be verified.

**Potential benefit:** Protects the system against unbounded admission.

**Potential risk:** Legitimate users may lose access to otherwise healthy services.

### Policy should depend on the endpoint

For example:

- Product browsing might fail open if temporary excess traffic is tolerable.
- Expensive report generation might fail closed to protect shared resources.
- Financial or security-sensitive operations may need stricter controls even when they are not resource-intensive.

Neither policy is universally correct. Decide based on business risk, resource cost, and the consequences of allowing an unchecked request.

**Important distinction:** Fail-open and fail-closed do not fix stale quota state. If Redis is reachable but has an outdated counter, the limiter may still make an incorrect decision.

---

## 10. Design Pitfalls and Interview Traps

### Pitfall 1: Independent counters on each instance

Ten instances each allowing 100 requests per minute do not automatically enforce a global limit of 100.

**Correction:** Use shared quota state or safely allocated, non-overlapping quota budgets.

### Pitfall 2: Treating token bucket as a strict rolling-window limiter

Token bucket controls bursts and sustained rate but does not guarantee a fixed maximum over every rolling interval.

**Correction:** Clarify the policy and choose the algorithm accordingly.

### Pitfall 3: Forgetting concurrency

A request-rate limit does not cap simultaneous in-flight work.

**Correction:** Add a concurrency limiter where long-running or expensive operations need protection.

### Pitfall 4: Using IP address as the only identity

Legitimate users may share IP addresses, and abusive clients may rotate them.

**Correction:** Use the most appropriate trustworthy identity and consider multiple limiting dimensions.

### Pitfall 5: Assuming a gateway guarantees global enforcement

Multiple gateway replicas can each maintain separate state.

**Correction:** Coordinate their quotas or allocate bounded budgets safely.

### Pitfall 6: Treating every endpoint the same

A cheap lookup and a large Excel export may have very different resource costs.

**Correction:** Consider endpoint-specific limits, weighted requests, and concurrency limits.

### Pitfall 7: Failing to define behavior during dependency failure

A rate limiter that depends on a remote store introduces a failure mode of its own.

**Correction:** Explicitly choose fail-open, fail-closed, or a carefully bounded fallback for each class of operation.

---

## 11. Interview Walkthrough: Designing the Initial Policy

Suppose the interviewer asks:

> Design a rate limiter for an e-commerce API with 10 application instances. Each authenticated user should be limited to 100 requests per minute. Some requests are expensive, and the system should allow controlled bursts.

A strong answer begins with requirements rather than immediately choosing a database.

### Step 1: Define the quota

The default quota is 100 requests per minute per authenticated user. Expensive endpoints may need separate quotas or weighted request costs.

### Step 2: Select the enforcement point

Start at the API gateway so excess requests can be rejected before reaching application instances. Business-specific controls may also be applied inside the application.

### Step 3: Select the algorithm

Token bucket is a good starting point because it permits controlled bursts while restricting sustained traffic.

If the interviewer instead requires no more than 100 requests in every rolling 60-second interval, a sliding-window approach may be more appropriate.

### Step 4: Define the state

A token bucket needs a token balance and refill timestamp for each limiting key. The implementation must update this state consistently under concurrent requests.

### Step 5: Address distribution

All instances must enforce the same global quota. Independent counters are insufficient. The design needs shared state or safely allocated quota budgets.

### Step 6: Address failure behavior

Define what happens if the quota mechanism is unavailable, with policies appropriate to each endpoint's business risk and resource cost.

### Step 7: Define observability

Monitor request volume, rejection rates, latency percentiles, errors, quota overshoot, and the health of the quota mechanism.

This gives the interviewer a coherent initial design. Detailed Redis coordination, replication, multi-region allocation, and hot-key handling can then be explored as follow-up questions.

---

## 12. Part 1 Review Checklist

Before moving to distributed implementation, make sure you can answer these questions:

- [ ] What is a rate limiter, and why is it an admission-control mechanism?
- [ ] How is rate limiting different from concurrency limiting?
- [ ] What identity should the quota use?
- [ ] Why can IP-based limits be problematic?
- [ ] Why doesn't a load balancer automatically enforce a global user quota?
- [ ] What is the difference between fixed-window and sliding-window enforcement?
- [ ] Why can fixed windows permit boundary bursts?
- [ ] How do token-bucket capacity and refill rate differ?
- [ ] Why doesn't token bucket necessarily enforce a strict rolling-window maximum?
- [ ] When is leaky bucket useful?
- [ ] How can weighted requests protect expensive operations?
- [ ] Why might an endpoint need a concurrency limit as well?
- [ ] What should happen when a quota is exhausted?
- [ ] What is the difference between fail-open and fail-closed?
- [ ] Why must failure policy be considered separately from stale quota state?

---

## Part 1 Summary

A sensible starting design for our e-commerce scenario is an authenticated per-user token bucket enforced at the API gateway, with shared quota state and atomic updates.

The fundamental design sequence is:

1. Define the limiting identity and quota.
2. Choose the enforcement point.
3. Select an algorithm based on burst behavior and enforcement strictness.
4. Account for different resource costs where needed.
5. Determine how quota state will be coordinated across instances.
6. Define failure behavior based on business impact.
7. Establish the client response and monitoring strategy.

The most important lesson is that **the rate-limiting algorithm, the quota state, and the distributed enforcement mechanism are separate design decisions**. Selecting token bucket determines how traffic is admitted; it does not by itself solve shared-state consistency or global coordination.

**Next — Part 2: Distributed Rate Limiter Architecture.** We'll build on these fundamentals with Redis key design, atomic Lua scripts, replication and failover, regional quota allocation, hot-key mitigation, and token leases.
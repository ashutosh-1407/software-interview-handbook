# Health Checks — Part 1

## 1. Why Health Checks Exist

A load balancer needs to know whether an application instance should receive traffic.

```text
             Load Balancer
                   │
        ┌──────────┼──────────┐
        ↓          ↓          ↓
      App A      App B      App C
```

The load balancer does not need to understand every internal detail of the application.

Instead, the application exposes health information such as:

```text
/live
/ready
```

The application is responsible for deciding whether it is healthy enough to continue running or receive traffic.

---

## 2. The Application Owns Its Health Signal

Suppose:

```text
App process = running
Database    = unavailable
```

The load balancer cannot automatically know that the application has lost database connectivity.

The application must communicate this through its health endpoint.

```text
Load Balancer
      │
      │ GET /ready
      ↓
 Application
      │
      ├── check critical conditions
      │
      ↓
   200 or 503
```

The key principle is:

> The application knows whether it can perform its responsibility; the load balancer only consumes that signal.

---

# 3. Liveness vs Readiness

These answer two different questions.

```text
LIVENESS
"Should this application instance continue running?"

READINESS
"Should this application instance receive traffic?"
```

They should not be treated as the same thing.

---

## 4. Liveness

Liveness determines whether the process is fundamentally alive.

Example:

```text
GET /live
```

A successful response means:

```text
Application process is functioning
→ do not restart it
```

A failed liveness check may cause the orchestrator to restart the instance.

### Important Principle

Liveness should generally not depend heavily on external services.

Bad example:

```text
/live
→ check Orders DB
```

Now suppose the database goes down.

```text
Database outage
      ↓
Every instance fails /live
      ↓
Every instance restarts
      ↓
Database still unavailable
      ↓
Instances restart again
```

This creates a restart storm without fixing the real problem.

Therefore:

> A downstream outage usually should not make the application itself "dead."

---

# 5. Readiness

Readiness determines whether the instance should receive production traffic.

```text
GET /ready
```

Example:

```text
Application process = running
Database pool        = still initializing
```

The application can be:

```text
/live  → 200
/ready → 503
```

Meaning:

```text
"I am alive, so don't restart me."

"But I am not ready to receive traffic yet."
```

This distinction is extremely important during startup and dependency failures.

---

# 6. Startup Example

Suppose a new application instance starts.

```text
Process starts
    ↓
HTTP server starts
    ↓
Configuration loads
    ↓
Database pool initializes
    ↓
Application becomes ready
```

During initialization:

```text
/live  = 200
/ready = 503
```

After initialization:

```text
/live  = 200
/ready = 200
```

The instance remains running while initialization completes, but the load balancer does not send user traffic to it prematurely.

---

# 7. Startup Checks

Some applications take a long time to initialize.

Examples:

```text
load large configuration
initialize connection pools
load models
warm local state
perform startup migrations/checks
```

If normal liveness checking begins immediately, a slow-starting application may be restarted before it ever finishes initialization.

Example:

```text
Application normally needs 60 sec to start

Liveness begins immediately
Timeout after 10 sec
        ↓
Restart application
        ↓
Startup begins again
        ↓
Restart again
```

The application can get trapped in an endless restart loop.

---

## 8. Startup Probe

A startup probe answers:

```text
"Has this application finished initializing?"
```

Example:

```text
Startup check every 5 sec
Maximum failures = 24
```

This gives the application up to approximately:

```text
5 sec × 24
= 120 sec
```

to finish initialization.

If it becomes healthy after 50 seconds:

```text
startup passes
      ↓
normal liveness checking begins
```

We do not blindly wait the full 120 seconds.

If startup never succeeds:

```text
120 sec reached
      ↓
startup considered failed
      ↓
application may be restarted
```

---

## 9. Startup Probe Does Not Fix Application Bugs

Suppose the application contains a deterministic startup bug.

```text
Start
 ↓
bug
 ↓
startup never completes
 ↓
restart
 ↓
same bug
 ↓
restart
```

A startup probe does not solve that bug.

It only provides a bounded period for legitimate initialization.

The real fix may require:

```text
rollback
configuration change
code fix
dependency restoration
```

---

# 10. Three Health Signals

A useful mental model is:

```text
STARTUP
"Have I finished initializing?"

LIVENESS
"Should I keep running?"

READINESS
"Should I receive traffic?"
```

Example:

```text
/startup = 200
/live    = 200
/ready   = 503
```

This means:

```text
Initialization completed
Application is alive
Application should not currently receive traffic
```

Possible reason:

```text
critical dependency unavailable
instance intentionally draining
critical local state unavailable
```

The instance should not necessarily be restarted.

---

# 11. What Should Affect Readiness?

Consider Checkout:

```text
Checkout
 ├── Orders DB       → required
 ├── Redis Cache     → optimization
 └── Recommendation  → optional
```

The important question is:

> Can Checkout still perform its critical responsibility?

---

## Orders DB Failure

If Checkout cannot create or retrieve orders without the Orders DB:

```text
Orders DB unavailable
        ↓
Checkout cannot perform core functionality
        ↓
/ready = 503
```

Removing the instance from traffic may be appropriate.

---

## Redis Failure

Suppose Redis is only a cache.

```text
Redis unavailable
      ↓
Checkout falls back to DB
      ↓
Requests become slower
      ↓
Core functionality still works
```

Then:

```text
/ready = 200
```

may still be correct.

Redis should be monitored separately.

Its failure may affect:

```text
latency
database load
cache hit ratio
capacity
```

but it does not necessarily mean Checkout is unable to serve traffic.

---

## Recommendation Failure

Suppose recommendations are optional:

```text
Recommendation unavailable
        ↓
Checkout still works
        ↓
Recommendations omitted
```

Then Recommendation should not make:

```text
/ready = 503
```

Otherwise an optional feature failure could take down the entire Checkout service.

---

# 12. Critical vs Optional Dependencies

A useful classification is:

```text
Critical dependency
→ core operation cannot succeed without it

Optional dependency
→ service can still provide useful functionality

Performance dependency
→ service works without it, but becomes slower/more expensive
```

Example:

```text
Orders DB       → Critical
Payment         → Depends on service responsibility
Redis           → Performance optimization
Recommendation  → Optional
```

---

# 13. Payment Is More Subtle

Suppose Checkout provides:

```text
load cart
calculate totals
validate inventory
place order
```

Payment is unavailable.

If Checkout can still provide the first three operations:

```text
Payment unavailable
       ↓
only payment-dependent operation fails/degrades
```

It may be better to keep Checkout ready.

```text
/ready = 200
```

and fail only:

```text
POST /place-order
```

or whatever operation requires Payment.

However, if the entire service exists only to perform an operation that fundamentally requires Payment, then Payment failure may justify failing readiness.

Therefore:

> Dependency criticality depends on the service's actual responsibility.

---

# 14. Readiness Is Not "Are All My Dependencies Healthy?"

This is a common design mistake.

Bad model:

```text
DB healthy?
Redis healthy?
Payment healthy?
Recommendation healthy?
Search healthy?

If ANY fail:
    /ready = 503
```

This unnecessarily couples the service's availability to every downstream dependency.

A better question is:

```text
"Can this instance still perform the critical functionality for which it receives traffic?"
```

This keeps optional failures from unnecessarily increasing the blast radius.

---

# 15. Active Health Checks

An active health check is when the load balancer deliberately probes the instance.

Example:

```text
Load Balancer
      │
      │ GET /ready
      ↓
 Application
      │
      └── 200
```

The load balancer may perform this every few seconds.

For example:

```text
every 5 sec:
    GET /ready
```

The response is used to determine whether the instance stays in the routing pool.

---

# 16. Passive / Runtime Health Signals

Health can also be inferred from real traffic.

Examples:

```text
request timeouts
high 5xx rate
extreme latency
connection failures
```

An instance may report:

```text
/ready = 200
```

while real traffic is performing poorly.

Example:

```text
CPU                  = 98%
request queue         = very deep
connection pool       = nearly exhausted
downstream latency    = high
```

The application may still technically satisfy its readiness conditions while users experience degradation.

Therefore:

> `/ready = 200` means the configured minimum readiness conditions are satisfied. It does not guarantee every request will succeed or be fast.

---

# 17. Health Checks vs Monitoring

Health checks usually support a binary operational decision.

```text
Should this instance receive traffic?

Should this process be restarted?
```

Monitoring answers a much broader question:

```text
How well is the system actually performing?
```

Example:

```text
/ready = 200

but:

p95 latency       = 3 sec
error rate        = 4%
DB pool usage     = 95%
queue depth       = increasing
```

The service may remain ready, but monitoring clearly shows degradation.

Therefore:

```text
Health Check
→ routing / lifecycle decision

Monitoring
→ performance / diagnosis / trends / alerting
```

---

# 18. What To Investigate When Readiness Is Healthy but Users Report Slowness

If:

```text
/ready = 200
```

but users report slow responses, investigate runtime behavior.

A useful sequence:

```text
1. Traffic
2. Latency
3. Resource saturation
4. Downstream performance
5. Error rate
6. Recent deployment/configuration changes
```

---

## Traffic

Check whether request volume or traffic shape changed.

```text
overall QPS increased?
specific endpoint increased?
one tenant generating unusual load?
unexpected retry traffic?
```

---

## Latency

Inspect:

```text
p50
p95
p99
```

and break it down by endpoint.

This helps determine whether:

```text
everything is slower
```

or:

```text
one operation is causing the problem
```

---

## Resource Saturation

Check:

```text
CPU
memory
worker/thread pool
request queue
connection pools
```

CPU can be normal while the application is still saturated elsewhere.

Example:

```text
CPU = 45%

DB connection pool = 100%
request queue       = growing
```

Users can experience severe latency even though CPU looks healthy.

---

## Downstream Dependencies

Inspect:

```text
DB latency
Redis latency
Payment latency
external API latency
```

A dependency can remain technically reachable while becoming slow.

---

## Recent Deployment

If degradation started after deployment:

```text
compare old vs new version
check configuration changes
check new dependencies
check resource usage changes
check endpoint-specific failures
```

Recent changes should usually be high on the debugging list.

---

# 19. Overload and Readiness Feedback Loops

Suppose there are 10 application instances.

Each instance fails readiness when:

```text
CPU > 80%
```

Traffic increases.

```text
Instance A crosses 80%
        ↓
A removed from LB
        ↓
A's traffic moves to remaining 9
        ↓
More instances cross 80%
        ↓
They are removed
        ↓
Even more load shifts
```

Eventually:

```text
most or all instances removed
```

The health mechanism has amplified the overload.

This is a dangerous feedback loop.

---

# 20. Do Not Make Readiness Too Sensitive

Readiness should not react to every tiny transient event.

Possible stabilizing mechanisms include:

```text
consecutive failures
consecutive successes
sustained failure windows
timeouts
grace periods
load shedding
rate limiting
```

The goal is:

> Detect meaningful failure without allowing transient noise to destabilize routing.

---

# 21. Consecutive Failure Threshold

Suppose the load balancer checks every 5 seconds.

Instead of removing an instance after one failure:

```text
503
→ remove
```

we might require:

```text
503
503
503
→ remove
```

This prevents one transient network glitch from removing a healthy server.

---

# 22. Consecutive Recovery Threshold

Similarly, one successful probe may not prove that an instance has fully recovered.

Instead of:

```text
200
→ immediately restore
```

we might require:

```text
200
200
200
→ restore
```

or another configured threshold.

The exact values depend on the system.

The important principle is:

```text
Do not declare failure from insufficient evidence.

Do not declare recovery from insufficient evidence.
```

---

# 23. Connection to Circuit Breakers

There is a conceptual similarity:

```text
Load Balancer Health          Circuit Breaker
────────────────────          ───────────────
Healthy                       CLOSED
Unhealthy                     OPEN
Recovery evaluation           HALF-OPEN-like behavior
Health probes                 Limited test requests
Restore cautiously            Close cautiously
```

They operate at different scopes, but both avoid reacting aggressively to transient failure or transient recovery.

Do not memorize rules such as:

```text
recovery threshold must always be larger
```

or:

```text
Circuit Breaker must always use fewer recovery probes
```

There is no universal numeric rule.

The configuration depends on:

```text
traffic volume
failure cost
recovery characteristics
capacity
desired sensitivity
```

---

# 24. Health-Check Timing

Three important parameters are:

```text
interval
timeout
failure threshold
```

---

## Interval

How frequently do we send the health probe?

Example:

```text
interval = 5 sec
```

means approximately:

```text
GET /ready
wait 5 sec
GET /ready
wait 5 sec
...
```

More frequent checking gives faster detection but creates more health-check traffic.

---

## Failure Threshold

How many consecutive failed probes are required before removing the instance?

Example:

```text
failure threshold = 3
```

If the interval is 5 seconds:

```text
rough detection time ≈ 15 sec
```

If the interval is 30 seconds:

```text
rough detection time ≈ 90 sec
```

This is a simplified approximation, but it shows the relationship.

---

## Probe Timeout

Probe timeout determines how long the health checker waits for a response.

Example:

```text
interval          = 5 sec
probe timeout     = 1 sec
failure threshold = 3
```

Suppose:

```text
GET /ready
```

takes 1.5 seconds.

The application eventually returns:

```text
200
```

but the health checker already gave up after 1 second.

That probe counts as a failure.

---

# 25. Aggressive Health Configuration

Suppose:

```text
interval          = 1 sec
timeout           = 900 ms
failure threshold = 1
```

A temporary one-second network issue could immediately remove a healthy instance.

If this happens across many instances:

```text
healthy instances removed
        ↓
traffic shifts
        ↓
remaining instances receive more load
        ↓
additional failures
```

This can cause a cascading failure.

Therefore:

> Fast failure detection must be balanced against stability and false positives/negatives.

---

# 26. Health Checks Also Consume Resources

Suppose:

```text
10,000 instances

health check interval = 1 sec
```

That produces approximately:

```text
10,000 health probes/sec
```

before considering multiple load balancers or other health-checking systems.

Health checks themselves therefore have a cost.

The configuration must balance:

```text
fast detection
vs
false failures
vs
probe overhead
```

---

# 27. Critical Services May Need Faster Detection

A latency-sensitive payment service may use more frequent health checking than a low-priority analytics worker.

Example:

```text
Payment
→ faster detection desired

Analytics
→ slower detection may be acceptable
```

But:

> Critical service does not automatically mean `failure threshold = 1`.

You still need protection against transient failure.

---

# 28. Core Mental Model So Far

```text
STARTUP
→ Has initialization completed?

LIVENESS
→ Should this process continue running?

READINESS
→ Should this instance receive traffic?

MONITORING
→ How well is the system actually performing?
```

And readiness should be:

```text
lightweight
deterministic
representative
limited to critical conditions
stable under transient failures
```

The purpose is not:

```text
"Prove every dependency and every endpoint in the system is perfect."
```

The purpose is:

```text
"Make a reliable routing decision without creating new failures."
```
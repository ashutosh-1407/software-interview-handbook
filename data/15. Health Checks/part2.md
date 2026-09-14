# Health Checks — Part 2

## 29. Keep Health Checks Lightweight

A readiness endpoint should answer:

> Can this instance reliably perform the critical functionality for which it receives traffic?

It should **not** execute a complete production workflow.

Bad design:

```text
/ready
→ heavy DB query
→ call Payment
→ call Inventory
→ call Recommendation
→ read/write Redis
→ execute business logic
```

This creates several problems:

```text
health check becomes expensive
health check creates dependency load
slow dependencies make probes slow
optional failures can remove healthy instances
health checks themselves can amplify outages
```

Suppose:

```text
1,000 instances
health check every 5 sec
```

If every `/ready` performs a DB query:

```text
1,000 / 5
= 200 DB queries/sec
```

just from health checks.

During a DB incident, this is exactly the wrong time to add unnecessary traffic.

Therefore:

```text
/readiness should be:

lightweight
fast
deterministic
representative
limited to critical conditions
```

---

# 30. How Deep Should a Readiness Check Go?

There are two extremes.

Too shallow:

```text
/ready
→ process is running
→ return 200
```

This may miss real application failures.

Too deep:

```text
/ready
→ DB query
→ Payment
→ Inventory
→ Redis
→ Recommendation
→ Search
```

This creates unnecessary coupling and load.

The goal is the middle:

```text
minimum reliable information
needed to make a routing decision
```

For a critical database, for example, we may check whether the application's existing connection pool is usable rather than creating a new connection and executing an expensive query on every probe.

---

# 31. Health Checks vs Synthetic Monitoring

A health check answers:

```text
"Should this instance receive traffic?"
```

Synthetic monitoring answers something different:

```text
"Can a user successfully complete an important workflow?"
```

Example synthetic flow:

```text
login
→ add to cart
→ calculate total
→ checkout
```

This can be valuable, but it should not normally live inside `/ready`.

Otherwise every health probe becomes an end-to-end business transaction.

Mental model:

```text
/readiness
→ lightweight routing decision

Synthetic monitoring
→ end-to-end user journey validation
```

---

# 32. TCP Health Checks

A TCP health check asks:

```text
"Can I establish a TCP connection to this port?"
```

Example:

```text
Load Balancer
      │
      │ connect :8080
      ↓
 Application
```

If the connection succeeds:

```text
TCP health check → healthy
```

This proves:

```text
host reachable
something listening on port 8080
TCP connection accepted
```

It does **not** prove that application functionality works.

Example:

```text
TCP :8080 → success

POST /checkout → 500
POST /checkout → 500
```

The TCP health check can still report healthy.

---

# 33. HTTP Health Checks

An HTTP health check can ask the application directly:

```text
GET /ready
```

The application can evaluate conditions such as:

```text
initialization complete?
critical state available?
critical dependency usable?
instance intentionally draining?
```

Then:

```text
200 → ready
503 → not ready
```

This makes HTTP checks more application-aware.

A useful mental model:

```text
TCP
→ Can I connect?

HTTP /live
→ Should the application continue running?

HTTP /ready
→ Should this instance receive traffic?
```

However, HTTP does not automatically mean the health check is good.

This:

```python
def ready():
    return 200
```

provides almost no application-level information.

The quality of the readiness logic still matters.

---

# 34. Readiness Cannot Detect Every Application Bug

Suppose:

```text
/ready → 200

POST /checkout → 500
```

because of a bug specifically in checkout business logic.

This can happen even with a well-designed health endpoint.

We generally don't want `/ready` executing every endpoint and every business operation.

Therefore:

```text
health checks
+
real-request metrics
+
monitoring
```

are needed together.

Readiness is a routing signal, not proof that every possible request will succeed.

---

# 35. False Positive Health

A false positive means:

```text
Health check says:
HEALTHY

Reality:
instance cannot properly serve traffic
```

Example:

```text
TCP :8080 succeeds

but

application requests return 500
```

Result:

```text
LB keeps sending traffic
        ↓
users receive failures
```

---

# 36. False Negative Health

A false negative means:

```text
Health check says:
UNHEALTHY

Reality:
instance could still serve useful traffic
```

Example:

```text
Redis unavailable
      ↓
Checkout could fall back to DB
      ↓
but /ready returns 503
      ↓
instance removed
```

Useful capacity was removed unnecessarily.

This can become especially dangerous when every instance has the same readiness logic.

```text
optional dependency outage
        ↓
all instances fail readiness
        ↓
entire service removed
```

A health check has now **increased the blast radius**.

---

# 37. Instance vs Service vs Region Health

Health exists at different levels.

```text
                    Global Router
                   /             \
                  ↓               ↓
             US Region        EU Region
                 │
            Load Balancer
           /     |      \
          A      B       C
```

### Instance Health

```text
"Should this particular instance receive traffic?"
```

If B fails:

```text
remove B
continue with A and C
```

### Service / Deployment Health

```text
"Does this deployment still have enough healthy capacity?"
```

### Region Health

```text
"Can this region reliably serve traffic?"
```

These should not be confused.

---

# 38. Do Not Turn Instance Failure Into Regional Failure

Suppose:

```text
US Region

100 Checkout instances
97 healthy
3 unhealthy
```

The region can still perform its responsibility.

So:

```text
remove the 3 unhealthy instances
continue routing to the remaining 97
```

We should not automatically move all US traffic to Europe.

Regional failover becomes appropriate when the **region itself** cannot reliably serve traffic.

Example:

```text
US Orders DB unavailable
        ↓
most/all Checkout instances cannot serve
        ↓
US region effectively unavailable
```

Then global routing may need to redirect traffic, assuming the architecture supports cross-region failover.

---

# 39. Flapping

Suppose:

```text
12:00:00  /ready = 200
12:00:05  /ready = 503
12:00:10  /ready = 200
12:00:15  /ready = 503
12:00:20  /ready = 200
```

If the LB reacts immediately:

```text
add
remove
add
remove
add
```

the instance is **flapping**.

This creates unstable routing and constantly redistributes traffic.

---

# 40. Hysteresis: Avoid Reacting to One Probe

Instead of:

```text
one 503
→ remove
```

we might require:

```text
503
503
503
→ remove
```

Similarly, instead of:

```text
one 200
→ restore
```

we might require multiple successful probes.

The exact thresholds depend on the system.

The principle is:

```text
Do not declare failure from insufficient evidence.

Do not declare recovery from insufficient evidence.
```

---

# 41. Connection to Circuit Breaker Recovery

There is a useful conceptual similarity.

Circuit Breaker:

```text
OPEN
  ↓
HALF-OPEN
  ↓
limited probes
  ↓
sufficient evidence of recovery
  ↓
CLOSED
```

Health checking:

```text
UNHEALTHY
    ↓
continue probing
    ↓
sufficient successful probes
    ↓
restore to routing pool
```

Both avoid immediately trusting a transient success.

However, do **not** compare their numeric thresholds directly.

For example:

```text
CB CLOSED:
observe 20 production requests

CB HALF-OPEN:
allow 3 controlled probes
```

Those numbers represent different mechanisms and traffic conditions.

There is no universal rule such as:

```text
health recovery threshold must be larger

or

CB recovery threshold must be smaller
```

The common principle is simply:

> Be careful about both transient failure and transient recovery.

---

# 42. Rolling Deployments

Health checks are critical during deployments.

A new instance may follow:

```text
process starts
      ↓
startup check
      ↓
initialization
      ↓
/live = 200
/ready = 503
      ↓
critical initialization completes
      ↓
/ready = 200
      ↓
LB starts routing traffic
```

This prevents partially initialized instances from serving users.

---

# 43. Graceful Shutdown

Health checks also help safely remove an instance.

Bad shutdown:

```text
kill process immediately
        ↓
LB may still route requests
        ↓
requests fail
```

Better:

```text
begin shutdown
      ↓
mark not ready
      ↓
stop new traffic
      ↓
drain in-flight requests
      ↓
terminate
```

---

# 44. The Shutdown Race

Suppose:

```text
t=0

App B:
    /ready = 503
    active_requests = 0
```

Can B immediately exit?

Not necessarily.

The LB may not yet know that B became unready.

```text
t=0
B changes /ready to 503

t=1
LB still considers B healthy
→ sends new request

t=2
LB performs next health probe
→ discovers 503
```

Therefore:

```text
"No requests are running right now"
```

does not mean:

```text
"No new requests can arrive."
```

---

# 45. Safe Shutdown Sequence

A safer conceptual sequence is:

```text
1. Begin shutdown

2. Mark not ready / deregister

3. Ensure routing layer stops assigning new work

4. Drain existing in-flight requests

5. Terminate
```

Production load balancers and orchestrators may provide:

```text
deregistration
connection draining
termination grace periods
```

These are more reliable than simply guessing:

```text
sleep 10 seconds
then exit
```

---

# 46. Long-Lived Connections

Shutdown is harder for:

```text
WebSockets
streaming
long polling
large downloads
```

A typical policy might be:

```text
stop accepting new connections
        ↓
allow existing connections to drain
        ↓
wait for bounded grace period
        ↓
terminate remaining connections
```

Graceful shutdown generally needs a maximum deadline; a server cannot wait forever.

---

# 47. Monitor the Health-Check System

Health checks themselves need observability.

Useful metrics:

```text
healthy instance count
unhealthy instance count

readiness failure rate
liveness failure rate

probe latency

health-state transitions
restart count

time to detect failure
time to recover
```

Also capture **why** readiness failed.

Example:

```text
readiness_failure_reason:

db_pool_unavailable
startup_incomplete
critical_dependency_unavailable
instance_draining
```

These reasons can live in internal metrics/logs without exposing unnecessary details publicly.

---

# 48. Detect Flapping Through Monitoring

A dashboard may currently show:

```text
App B = HEALTHY
```

But another metric may show:

```text
47 health-state transitions
in 10 minutes
```

That tells a very different story.

Possible causes:

```text
aggressive thresholds
unstable dependency
network instability
probe timeout too small
bad readiness logic
```

Health-state transition count is therefore an important operational metric.

---

# 49. Correlate Health With Real System Behavior

Do not look only at:

```text
/ready
```

Correlate health information with:

```text
request success rate
latency
timeouts
traffic
CPU/memory
queues
connection pools
dependency performance
```

For example, an instance can technically remain ready while:

```text
p99 latency ↑
DB pool saturation ↑
request queue ↑
```

Readiness tells us whether the instance should receive traffic.

Monitoring tells us how well the system is actually performing.

---

# 50. Debugging Health Failures After Deployment

Suppose:

```text
Healthy instances:      100 → 55

Traffic:                unchanged
CPU:                    normal
Memory:                 normal
Orders DB:              healthy
Payment:                healthy

/readiness failures:    ↑
```

Because a deployment just occurred, investigate:

```text
What changed in /ready?

Was a new dependency added?

Did health-check configuration change?

Did the probe timeout change?

Did failure/recovery thresholds change?

Why specifically is /ready returning 503?
```

The most important debugging step is:

> Correlate the readiness failure reason with the deployment diff.

---

# 51. Probe Timeout

A health checker does not wait forever.

Suppose:

```text
interval          = 5 sec
probe timeout     = 100 ms
failure threshold = 3
```

But normal `/ready` latency occasionally reaches:

```text
150 ms
```

Then:

```text
LB sends /ready
      ↓
100 ms passes
      ↓
LB gives up
      ↓
probe counted as failure

50 ms later:
/ready returns 200
```

The application was actually capable of responding, but the probe timeout was too aggressive.

Repeated failures may remove a healthy instance.

This is another possible **false negative**.

---

# 52. Final Incident — Bad Redis Readiness Check

Suppose Checkout has:

```text
Orders DB       → critical
Redis           → performance optimization
Payment         → required for payment operation
```

A gradual deployment changes readiness:

```text
Old version:
/ready does NOT check Redis

New version:
/ready checks Redis
```

Redis becomes unavailable.

Production shows:

```text
20 total instances

12 ready
8 unready

Traffic        = unchanged
CPU            = normal
Memory         = normal

Orders DB      = healthy
Payment        = healthy

Success rate   ≈ 99%
Latency        ↑
```

The strongest clue is:

```text
deployment diff
+
Redis outage
+
readiness failures
```

Likely sequence:

```text
new-version instances
        ↓
check Redis
        ↓
Redis unavailable
        ↓
/ready = 503
        ↓
instances removed
```

Because deployment is gradual, the 12 ready instances may still be running the old version.

---

# 53. Why the Readiness Design Is Wrong

If Redis is only a cache:

```text
Redis unavailable
      ↓
Checkout falls back to DB
      ↓
latency increases
      ↓
core functionality still works
```

Therefore Redis should not necessarily make:

```text
/ready = 503
```

Otherwise:

```text
cache outage
      ↓
Checkout instances removed
      ↓
Checkout capacity decreases
```

The health check has increased the blast radius.

---

# 54. Immediate Incident Response

A strong response:

```text
1. Pause the rollout.

2. Confirm Redis is causing readiness failures.

3. Roll back/fix the readiness change.

4. Restore incorrectly removed instances.

5. Monitor DB load and latency.
```

The last point matters because:

```text
Redis unavailable
      ↓
cache misses / fallback
      ↓
more DB traffic
      ↓
higher latency / possible DB pressure
```

So keeping Checkout ready does not mean ignoring the Redis outage.

It means handling Redis degradation through the appropriate monitoring and capacity mechanisms instead of incorrectly removing Checkout instances.

---

# 55. Better Health Model

```text
/startup
→ Has initialization completed?

/live
→ Should this process keep running?

/ready
→ Can this instance perform critical Checkout functionality?
```

Dependencies:

```text
Orders DB
→ readiness-relevant if required for core operation

Redis
→ monitor separately if fallback exists

Recommendation
→ monitor separately if optional
```

---

# 56. If Health Checks Are Designed Badly

A minor dependency outage can become a major service outage.

Example:

```text
Recommendation outage
        ↓
should cause:
recommendations unavailable
```

Bad readiness design:

```text
Recommendation outage
        ↓
Checkout /ready = 503
        ↓
Checkout removed
        ↓
Checkout outage
```

Similarly:

```text
Redis outage
```

should perhaps cause:

```text
latency ↑
DB traffic ↑
```

not:

```text
Checkout unavailable
```

This is why dependency criticality is one of the most important health-check design decisions.

---

# 57. Production Debugging Checklist

When instances suddenly become unhealthy:

```text
1. What changed recently?
   → deployment/configuration/dependency?

2. Why exactly is /ready failing?

3. Is the failing condition truly critical?

4. Are probe settings too aggressive?
   → interval
   → timeout
   → failure threshold
   → recovery threshold

5. Is the health endpoint itself expensive?

6. Are instances flapping?

7. Is a shared dependency causing correlated failures?

8. How much healthy capacity remains?

9. What are real users experiencing?

10. Is the health mechanism amplifying the incident?
```

---

# 58. Interview Framework

When designing health checks:

```text
1. Define what "healthy" means.

2. Separate:
   startup
   liveness
   readiness

3. Identify:
   critical dependencies
   optional dependencies
   performance dependencies

4. Keep checks lightweight.

5. Choose appropriate probe:
   TCP / HTTP

6. Configure:
   interval
   timeout
   failure threshold
   recovery threshold

7. Protect against flapping.

8. Support:
   rolling deployment
   graceful shutdown
   connection draining

9. Consider:
   instance health
   service health
   region health

10. Monitor the health-check mechanism itself.
```

---

# 59. Final Mental Model

```text
STARTUP
"Have I initialized?"

LIVENESS
"Should I keep running?"

READINESS
"Should I receive traffic?"

MONITORING
"How well is the system actually performing?"
```

The core principle:

> A health check is a control signal, not a complete diagnostic system.

It should be:

```text
lightweight
stable
representative
criticality-aware
blast-radius conscious
```

A good health check helps isolate failures.

A badly designed health check can turn a small dependency failure into a service-wide outage.
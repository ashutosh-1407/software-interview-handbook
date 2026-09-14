# Health Checks — Interview Cheat Sheet

## 1. Core Purpose

Health checks provide **control signals** to infrastructure.

```text
Startup
→ Has initialization completed?

Liveness
→ Should this process keep running?

Readiness
→ Should this instance receive traffic?
```

They are not complete monitoring or diagnostic systems.

---

# 2. Startup vs Liveness vs Readiness

### Startup

Protects slow-starting applications.

```text
process starts
→ initialization
→ startup passes
→ normal liveness begins
```

Without it:

```text
slow startup
→ liveness fails too early
→ restart
→ startup again
→ restart loop
```

### Liveness

```text
"Am I fundamentally alive?"
```

Failure may trigger restart.

Avoid tying liveness heavily to external dependencies:

```text
DB outage
→ /live fails everywhere
→ restart storm
```

### Readiness

```text
"Can I perform my critical responsibility?"
```

Failure generally means:

```text
/ready = 503
→ stop routing traffic
```

An application can therefore be:

```text
alive
but
not ready
```

---

# 3. Dependency Rule

Ask:

> If this dependency disappears, can the service still perform its core/useful functionality?

Example:

```text
Checkout

Orders DB       → critical
Redis           → performance optimization
Recommendation  → optional
Payment         → depends on service responsibility
```

Avoid:

```text
ANY dependency unhealthy
→ /ready = 503
```

Prefer:

```text
critical functionality unavailable
→ fail readiness

optional functionality unavailable
→ degrade + monitor
```

---

# 4. Keep Readiness Lightweight

Good readiness:

```text
lightweight
fast
deterministic
representative
criticality-aware
```

Bad:

```text
/ready
→ heavy DB query
→ Payment
→ Redis
→ Recommendation
→ business transaction
```

Example:

```text
1,000 instances
probe every 5 sec
```

A DB query on every probe means:

```text
≈ 200 DB queries/sec
```

just from health checking.

> Health checks should not create significant pressure on the system they are protecting.

---

# 5. Health Check vs Monitoring

```text
Health Check
→ Should traffic be routed here?

Monitoring
→ How well is the system performing?
```

Example:

```text
/ready = 200

but:

latency ↑
queue depth ↑
DB pool saturation ↑
```

So:

```text
ready
≠
performing optimally
```

Correlate health checks with:

```text
traffic
latency
errors
CPU/memory
queues
connection pools
downstream performance
```

---

# 6. TCP vs HTTP

### TCP

```text
Can I connect to port 8080?
```

Proves:

```text
host reachable
port accepting connections
```

But:

```text
TCP :8080 → success
POST /checkout → 500
```

TCP can still report healthy.

### HTTP

```text
GET /ready
```

Allows application-level checks:

```text
critical initialization?
critical state?
critical dependency?
draining?
```

Mental model:

```text
TCP
→ Can I connect?

/live
→ Should I keep running?

/ready
→ Should I receive traffic?
```

---

# 7. False Positive vs False Negative

### False Positive

```text
Health says HEALTHY
Reality is BROKEN
```

Result:

```text
traffic continues going to broken instance
```

### False Negative

```text
Health says UNHEALTHY
Reality can still serve traffic
```

Example:

```text
Redis down
→ Checkout can use DB
→ but /ready fails
→ useful instance removed
```

This can increase blast radius:

```text
optional dependency fails
→ all instances become unready
→ entire service unavailable
```

---

# 8. Health-Check Timing

Important knobs:

```text
interval
→ how often?

timeout
→ how long to wait?

failure threshold
→ failures before removal?

recovery threshold
→ successes before restoration?
```

Example:

```text
interval = 5 sec
failure threshold = 3

rough detection ≈ 15 sec
```

Aggressive settings can cause:

```text
transient issue
→ false health failure
→ healthy instance removed
→ traffic shifts
→ remaining instances overloaded
→ cascading removals
```

---

# 9. Probe Timeout

Suppose:

```text
probe timeout = 100 ms
```

but `/ready` takes:

```text
150 ms
```

Then:

```text
100 ms
→ health checker times out
→ probe fails

150 ms
→ application returns 200
```

The application may be usable, but the health checker already counted a failure.

Too-small probe timeouts can therefore create false negatives.

---

# 10. Flapping / Hysteresis

Flapping:

```text
healthy
unhealthy
healthy
unhealthy
healthy
```

Avoid reacting to every individual probe.

Example:

```text
3 failures
→ remove

multiple successes
→ restore
```

Principle:

> Don't declare failure or recovery from insufficient evidence.

Exact thresholds depend on the system.

---

# 11. Circuit Breaker Connection

```text
Health Check          Circuit Breaker

Healthy               CLOSED
Unhealthy             OPEN
Recovery probing      HALF-OPEN
Restore cautiously    Close cautiously
```

Do not compare numeric thresholds directly.

Both follow:

```text
avoid reacting to transient failure
+
avoid trusting transient recovery
```

---

# 12. Rolling Deployment

```text
new instance
→ startup
→ /live = 200
→ /ready = 503
→ initialization completes
→ /ready = 200
→ LB sends traffic
```

This prevents partially initialized instances from serving users.

---

# 13. Graceful Shutdown

Correct sequence:

```text
begin shutdown
      ↓
mark not ready / deregister
      ↓
stop new traffic
      ↓
drain in-flight requests
      ↓
terminate
```

Important:

```text
active_requests = 0
≠
no new requests can arrive
```

The LB may not have observed `/ready = 503` yet.

So the routing layer must stop assigning new work before termination.

For long-lived connections:

```text
stop new connections
→ drain existing connections
→ bounded grace period
→ terminate
```

---

# 14. Instance vs Region Health

```text
Instance
→ Should this server receive traffic?

Service
→ Is enough healthy capacity available?

Region
→ Should global routing use this region?
```

Example:

```text
100 instances
97 healthy
3 unhealthy
```

Usually:

```text
remove 3
keep region active
```

Do not turn isolated instance failures into regional failover.

---

# 15. Monitor Health Checks

Watch:

```text
healthy/unhealthy instance count
readiness failures
liveness failures
probe latency
health-state transitions
restart count
time to detect
time to recover
```

Also capture failure reasons:

```text
db_unavailable
startup_incomplete
instance_draining
critical_dependency_failure
```

Example:

```text
App B = healthy
```

may look fine, but:

```text
47 health transitions in 10 minutes
```

indicates flapping.

---

# 16. Deployment Debugging

If:

```text
healthy instances ↓
readiness failures ↑

traffic unchanged
CPU normal
memory normal
major dependencies healthy
```

investigate:

```text
deployment diff
readiness logic change
new dependency
probe timeout
threshold changes
specific /ready failure reason
```

Key principle:

> Correlate the deployment change with why readiness is failing.

---

# 17. Classic Redis Incident

New deployment:

```text
Old:
/ready does NOT check Redis

New:
/ready checks Redis
```

Redis is only a cache.

Redis fails:

```text
new instances
→ Redis check fails
→ /ready = 503
→ instances removed
```

But Checkout could:

```text
Redis down
→ fallback to DB
→ latency ↑
→ DB load ↑
→ requests still succeed
```

So Redis should generally be monitored separately rather than controlling readiness.

Immediate response:

```text
pause rollout
confirm failure reason
rollback/fix readiness
restore capacity
monitor DB load + latency
```

---

# 18. Production Debugging Framework

When health failures increase:

```text
1. What changed recently?

2. Why exactly is /ready failing?

3. Is that condition actually critical?

4. Are interval/timeout/thresholds too aggressive?

5. Is /ready itself expensive?

6. Are instances flapping?

7. Is a shared dependency causing failures?

8. How much healthy capacity remains?

9. What are users experiencing?

10. Is the health mechanism increasing blast radius?
```

---

# 19. Common Interview Traps

```text
"Check every dependency in /ready."
→ Wrong if some dependencies are optional.

"DB down means fail /live."
→ May create restart storms.

"One failed probe means remove immediately."
→ Can cause false negatives/flapping.

"/ready = 200 means everything is healthy."
→ No. Only readiness conditions passed.

"No active requests means safe to terminate."
→ Not until new routing has stopped.

"One unhealthy instance means unhealthy region."
→ Wrong scope.
```

---

# 20. 30-Second Interview Answer

> I separate startup, liveness, and readiness because they answer different lifecycle questions. Liveness determines whether the process should continue running, while readiness determines whether an instance should receive traffic. Readiness should be lightweight and depend only on conditions required for critical functionality; otherwise optional dependency failures can unnecessarily remove capacity and increase blast radius. I configure interval, timeout, failure and recovery thresholds to balance fast detection against false failures and flapping. During deployments and shutdowns, readiness works with traffic draining to prevent requests from reaching instances too early or too late. Finally, I monitor health transitions and correlate them with actual request and dependency metrics.

---

# 21. Final Mental Model

```text
STARTUP
→ Have I initialized?

LIVENESS
→ Should I keep running?

READINESS
→ Should I receive traffic?

MONITORING
→ How well am I actually performing?
```

**Golden rule:**

> Health checks should remove truly unusable capacity without becoming a mechanism that creates or amplifies outages.
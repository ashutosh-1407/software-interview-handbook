# Service Discovery — Interview Cheat Sheet

## 1. Core Definition

> **Service Discovery = dynamically finding the current location(s) of a service.**

```text
Checkout
   ↓
"Where is Payment?"
   ↓
Service Discovery
   ↓
[P1, P2, P3]
```

Needed because instances constantly:

```text
scale
restart
crash
move
change IPs
deploy
```

Avoid hardcoded service addresses.

---

## 2. Core Responsibility Split

```text
Service Discovery
→ What instances exist / where are they?

Health Checks
→ Which instances are usable?

Load Balancing
→ Which usable instance gets the request?

Retry
→ Recover from some transient/stale-selection failures.
```

---

## 3. Service Registry

Dynamic directory of service instances:

```text
Payment
├── P1 → 10.0.1.12:8080
├── P2 → 10.0.1.27:8080
└── P3 → 10.0.1.43:8080
```

Lifecycle:

```text
REGISTER
→ "Add me."

DISCOVER
→ "Who is available?"

DEREGISTER
→ "I'm intentionally leaving."

REMOVE
→ Stop advertising the instance.
```

Graceful shutdown:

```text
DEREGISTER → REMOVE
```

Crash:

```text
Crash
→ heartbeat stops
→ TTL expires
→ REMOVE
```

---

## 4. Heartbeat & TTL

```text
P1 ── heartbeat ──► Registry
```

Example:

```text
heartbeat every 10 sec
TTL = 30 sec
```

Trade-off:

```text
Small TTL
→ faster detection
→ more false removals

Large TTL
→ slower detection
→ stale dead instances remain longer
```

Remember:

```text
Heartbeat / TTL
→ Is registration still alive?

Readiness
→ Should this instance receive traffic?
```

**Heartbeat ≠ Readiness**

---

## 5. Registration Models

### Self-Registration

```text
Service
→ register
→ heartbeat
→ deregister
```

More application responsibility.

### Platform-Managed

```text
Service starts
   ↓
Platform / Orchestrator
   ↓
Discovery updated
```

Benefits:

```text
less application code
consistent behavior
separation of concerns
```

---

## 6. Client-Side Discovery

```text
Checkout
   ↓
Registry
   ↓
[P1,P2,P3]
   ↓
Checkout chooses P2
   ↓
P2
```

Caller handles:

```text
discovery + instance selection
```

**Pros:** direct calls, caller control.

**Cons:** duplicated discovery/LB logic across services.

---

## 7. Server-Side Discovery

```text
Checkout
   ↓
LB / Proxy
   ↓
P2
```

Infrastructure handles:

```text
discovery
+
instance selection
+
routing
```

Benefits:

```text
simpler applications
consistent policies
centralized infrastructure
```

Trade-off:

```text
LB / Proxy becomes critical infrastructure
```

---

## 8. DNS-Based Discovery

```text
Checkout
   ↓
payment.internal
   ↓
DNS
```

Possible:

```text
DNS → Load Balancer → Instances
```

or:

```text
DNS → Instances directly
```

There is **no mandatory**:

```text
Registry → DNS → LB
```

architecture.

---

## 9. DNS TTL

```text
Long TTL
→ fewer lookups
→ potentially stale longer

Short TTL
→ fresher state
→ more DNS overhead
```

Classic trade-off:

> **Freshness vs efficiency**

---

## 10. Discovery Caching

Avoid:

```text
Every request
→ Registry lookup
→ Service
```

Prefer:

```text
Registry
   ↓
watch / refresh
   ↓
Cached instance list
   ↓
normal requests
```

Benefits:

```text
lower latency
less registry load
better resilience
```

Cost:

```text
stale topology
```

---

## 11. Control Plane vs Data Plane

```text
CONTROL PLANE

Registry
   ↓
Payment = [P1,P2,P3]
```

```text
DATA PLANE

Checkout
   ↓
actual request
   ↓
Payment
```

Golden idea:

> **A temporary control-plane failure should not unnecessarily stop an already-working data plane.**

---

## 12. Last-Known-Good State

Registry fails:

```text
Registry ❌

Checkout still has:
[P1,P2,P3]
```

Continue temporarily using cached topology.

But:

```text
Last-known-good
= temporary resilience

≠ permanent source of truth
```

Risk:

```text
P3 dies
P4 starts

Cache:
[P1,P2,P3]

Reality:
[P1,P2,P4]
```

---

## 13. Poll vs Push / Watch

### Poll

```text
Client → Registry every N seconds
```

Simple, but:

```text
more polling
+
stale between refreshes
```

### Push / Watch

```text
Client ── watch ──► Registry

Registry ── update ──► Client
```

Fresher and avoids repeated polling.

But requires:

```text
long-lived connection
reconnect logic
recovery/reconciliation
```

---

## 14. Watch Recovery

Danger:

```text
watch breaks
    ↓
P3 removed
P4 added
    ↓
client reconnects
```

Client may have missed updates.

Correct pattern:

```text
Reconnect
   ↓
Fetch/reconcile latest state
OR resume from revision
   ↓
Resume watch
```

---

## 15. Propagation Delay

```text
Registry:
[P1,P2]

Caller cache:
[P1,P2,P3]
```

Registry can be perfectly healthy while callers still have stale state.

This may indicate:

```text
propagation delay
broken watch
polling delay
failed reconciliation
```

---

## 16. Registry High Availability

Avoid:

```text
Single Registry
      ❌
```

Use multiple registry nodes:

```text
R1
R2
R3
```

Two different protections:

```text
Registry HA
→ keeps control plane available

Cached discovery
→ lets data plane survive
  temporary control-plane failure
```

---

## 17. CAP Connection

During a partition:

```text
R1             X            R2

[P1,P2]                   [P1,P2,P3]
                              ↑
                             stale
```

Possible trade-off:

```text
Return stale local state
→ higher availability

Refuse uncertain result
→ stronger consistency
→ lower availability
```

For many discovery workloads, temporary stale topology can be tolerable.

But:

> **Do NOT memorize "Service Discovery = AP."**

It depends on system requirements and implementation.

---

## 18. Stale Discovery Defense

```text
Discovery returns stale P3
          ↓
Health filtering
          ↓
Load balancing
          ↓
runtime failure detection
          ↓
Retry another instance
```

Reliability comes from complementary mechanisms.

---

## 19. Recovery Storm / Thundering Herd

Registry recovers:

```text
50,000 clients
      ↓
reconnect simultaneously
      ↓
Registry overloaded
      ↓
Registry may fail again
```

Use:

```text
Exponential Backoff
+
Jitter
```

Backoff:

```text
reduces retry frequency
```

Jitter:

```text
breaks synchronization
```

---

## 20. Zone-Aware Discovery

Prefer locality:

```text
same zone
   ↓
other zones in same region
   ↓
other region if allowed
```

Benefits:

```text
lower latency
less cross-zone traffic/cost
```

Failover may preserve availability but requires consideration of capacity and required dependencies/state.

---

## 21. Multi-Region Discovery

Normally:

```text
Checkout-US → Payment-US

Checkout-EU → Payment-EU
```

Before cross-region failover consider:

```text
data residency / compliance
latency
required data/state
configuration differences
capacity
failover policy
```

Important:

```text
Service Discovery
→ Where are instances?

Health
→ Are they usable?

Capacity
→ Can destination absorb traffic?

Routing Policy
→ Should traffic go there?
```

Discovery itself does not necessarily know spare capacity.

---

## 22. Service Mesh

```text
Checkout
   ↓
Local Proxy
   ├── Discovery
   ├── Load Balancing
   ├── Retry / Timeout
   ├── Circuit Breaking
   └── Telemetry
   ↓
Payment
```

Remember:

```text
Service Discovery
= capability/problem
  "Where is Payment?"

Service Mesh
= infrastructure layer managing
  service-to-service communication
```

> **Service Discovery may be part of a Service Mesh, but it does not require a Service Mesh.**

---

## 23. Monitoring

Watch:

```text
Registry availability / error rate
Lookup latency
Registered instance count
Registration / deregistration rate
Heartbeat failures
Instance churn
Watch / reconnect failures
Update propagation delay
```

---

## 24. Production Debugging

Problem:

```text
Checkout still sends traffic to P3

P3 was terminated 5 minutes ago.
```

Debug in order:

```text
1. Registry state
   → Does registry still contain P3?

2. Caller discovery cache
   → Does Checkout still contain P3?

3. Propagation
   → Did poll/watch deliver removal?

4. Reconnect/reconciliation
   → Was an update missed?

5. Routing / health
   → Why was stale P3 selectable?

6. Retry
   → Why didn't request recover?
```

Key distinction:

```text
Registry stale
→ registration / heartbeat / replication issue

Registry correct + caller stale
→ propagation / cache / watch issue
```

---

# 30-Second Interview Summary

```text
Service Discovery dynamically maps a logical service
to its current instances.

Instances register and are removed through graceful
deregistration or failure detection such as heartbeat/TTL.

Discovery can be client-side, server-side through a proxy/LB,
or DNS-based.

Discovery state is normally cached or watched rather than
looked up on every request, separating the control plane
from the data plane.

Caching introduces stale-state risk, so health checks,
load balancing, runtime failure detection and retries
provide complementary protection.

At scale, I would also think about registry HA,
push/watch recovery, propagation delay, thundering-herd
recovery, locality-aware routing, multi-region policy,
and discovery monitoring.
```

# One-Line Mental Model

```text
Discovery → WHERE?
Health    → USABLE?
LB        → WHICH ONE?
Retry     → FAILED, TRY AGAIN?
Mesh      → INFRASTRUCTURE THAT MAY IMPLEMENT THESE CONCERNS
```
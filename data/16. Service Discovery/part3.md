# Service Discovery — Part 3: Updates, Failure Handling, Multi-Region, Service Mesh & Monitoring

## 1. How Do Clients Learn About Discovery Changes?

Suppose Checkout currently knows:

```text
Payment → [P1, P2, P3]
```

Then:

```text
P3 dies
```

The registry may quickly update to:

```text
Payment → [P1, P2]
```

But Checkout also needs to learn about that change.

Two common approaches are:

```text
Pull / Polling
Push / Watch
```

---

# 2. Pull / Polling

With polling, the client periodically refreshes discovery information.

```text
Checkout
    │
    │ every 30 sec
    ▼
Registry
    │
    ▼
[P1,P2,P3]
```

If P3 disappears immediately after a refresh, Checkout may continue using stale information until the next poll.

### Trade-off

```text
Frequent polling
→ fresher state
→ more registry traffic

Infrequent polling
→ less registry traffic
→ potentially stale longer
```

At large scale this can become expensive.

For example:

```text
10,000 clients
poll every 5 sec

≈ 2,000 registry requests/sec
```

even if the topology hasn't changed at all.

---

# 3. Push / Watch

Instead of repeatedly asking for changes, Checkout can establish a watch/subscription.

```text
Checkout ───── watch Payment ─────► Registry
```

When P3 disappears:

```text
Registry
   │
   │ "Payment changed"
   ▼
Checkout

[P1,P2,P3]
     ↓
[P1,P2]
```

Advantages:

```text
faster propagation
less repeated polling
updates primarily when state changes
```

Trade-off:

```text
long-lived connections
subscription state
reconnect logic
recovery complexity
```

There may still be keepalive/connection-management traffic even when nothing changes.

---

# 4. Reconnect and Recovery Logic

Suppose Checkout maintains a watch:

```text
Checkout ─────────► Registry
```

The connection breaks:

```text
Checkout ───── X ───── Registry
```

While disconnected:

```text
P3 dies
P4 starts

Old:
[P1,P2,P3]

Current:
[P1,P2,P4]
```

Checkout may have missed both updates.

Simply reconnecting is therefore not always enough.

A safe recovery might be:

```text
Watch breaks
    ↓
Reconnect
    ↓
Fetch/reconcile current state
    ↓
[P1,P2,P4]
    ↓
Resume watch
```

More sophisticated systems can use revisions:

```text
Checkout last saw revision 105

Reconnect:
"Give me changes after revision 105."
```

### Principle

> **After reconnecting, a watcher must ensure it did not permanently miss updates while disconnected.**

---

# 5. Propagation Delay

Even when the registry has correct information, clients may receive it late.

Example:

```text
10:00:00
Registry removes P3

10:00:20
Checkout receives update
```

That 20-second difference is **propagation delay**.

During that interval:

```text
Registry:
[P1,P2]

Checkout:
[P1,P2,P3]
```

So a healthy registry does not automatically mean every caller has fresh discovery state.

---

# 6. Registry Failure

Suppose:

```text
Service Registry ❌

Payment:
P1 ✅
P2 ✅
P3 ✅
```

Checkout already has:

```text
Payment → [P1,P2,P3]
```

Checkout should generally continue temporarily using its **last-known-good discovery state** rather than immediately stopping Payment traffic.

```text
Registry ❌
    ↓
cached discovery
    ↓
[P1,P2,P3]
    ↓
Payment traffic continues
```

Meanwhile Checkout should attempt to restore its registry connection and eventually reconcile its state.

---

# 7. Registry High Availability

Caching protects existing traffic temporarily, but the registry itself should not normally be a single point of failure.

Avoid:

```text
Checkout → Registry R1 → discovery
                ❌
```

Prefer multiple registry nodes:

```text
             Service Registry

        ┌──── R1 ────┐
        │            │
Caller ─┼──── R2 ────┼──► discovery state
        │            │
        └──── R3 ────┘
```

This gives two complementary defenses:

```text
Registry HA
→ keeps control plane available

Last-known-good cache
→ allows data plane to survive
  temporary control-plane failures
```

---

# 8. Registry Partitions and Stale Views

Multiple registry nodes introduce distributed-state problems.

Suppose:

```text
R1          X          R2,R3

[P1,P2]                [P1,P2,P3]
                            ↑
                           stale
```

Depending on system requirements, R1/R2 may continue serving their current views rather than making discovery completely unavailable.

This connects directly to:

```text
CAP
availability
consistency
network partitions
```

For many internal discovery scenarios, stale topology can be tolerable because:

```text
stale instance
    ↓
health detection / routing
    ↓
request failure
    ↓
retry another instance
```

But this is a design trade-off, not a universal rule that every discovery system must be AP.

---

# 9. Recovery Storm / Thundering Herd

Suppose the registry is unavailable and:

```text
50,000 service instances
```

lose their connections.

The registry recovers.

If every instance immediately performs:

```text
reconnect
register
heartbeat
refresh
re-establish watch
```

we can create:

```text
Registry recovers
      ↓
50,000 simultaneous requests
      ↓
Registry overloaded
      ↓
Registry fails again
```

This is a **recovery storm / thundering herd**.

---

# 10. Backoff + Jitter During Recovery

Exponential backoff alone may not solve the problem.

If all 50,000 clients failed together:

```text
1 sec → 50,000 retries
2 sec → 50,000 retries
4 sec → 50,000 retries
8 sec → 50,000 retries
```

They remain synchronized.

Adding **jitter** introduces randomness:

```text
Client A → 3.1 sec
Client B → 4.8 sec
Client C → 2.9 sec
Client D → 5.2 sec
```

Now reconnect traffic is spread across time.

```text
Exponential Backoff
→ reduces retry frequency

Jitter
→ breaks synchronization
```

This connects Service Discovery directly to our Retry/Backoff chapter.

---

# 11. Zone-Aware Discovery

Suppose Payment runs across availability zones:

```text
US Region

Zone A
Payment-A1
Payment-A2

Zone B
Payment-B1
Payment-B2

Zone C
Payment-C1
Payment-C2
```

Checkout running in Zone A may generally prefer:

```text
Checkout-A
    ↓
Payment-A1 / A2
```

rather than immediately making cross-zone calls.

Benefits can include:

```text
lower latency
less cross-zone traffic/cost
```

But locality should not necessarily mean:

```text
ONLY use Zone A
```

If:

```text
Payment-A1 ❌
Payment-A2 ❌
```

while:

```text
Payment-B1 ✅
Payment-B2 ✅
```

routing may fail over to Zone B, assuming policy and capacity allow it.

Trade-offs include:

```text
higher latency
cross-zone traffic/cost
required state/dependency availability
```

A common conceptual preference is:

```text
same zone
   ↓
other zone in same region
   ↓
other region only if explicitly allowed
```

---

# 12. Multi-Region Service Discovery

Now consider:

```text
             Global Application

       US                    EU

Checkout-US            Checkout-EU

Payment-US             Payment-EU
P1 P2 P3               P4 P5 P6
```

Normally:

```text
Checkout-US → Payment-US
Checkout-EU → Payment-EU
```

Discovery/routing may therefore understand metadata such as:

```text
service
region
zone
```

Example:

```text
P1 → region=US, zone=A
P2 → region=US, zone=B

P4 → region=EU, zone=A
P5 → region=EU, zone=B
```

---

# 13. Cross-Region Failover Is Not Automatically Safe

Suppose:

```text
Payment-US ❌

Payment-EU ✅
```

The fact that EU has healthy Payment instances does **not** automatically mean US traffic should fail over there.

Before doing so, consider:

```text
Can the data legally leave the region?

Are there data-residency/compliance requirements?

Does the target region run compatible behavior/configuration?

Does it have access to the required data/state?

Is cross-region latency acceptable?

Does the destination have enough capacity?

Does policy explicitly permit cross-region failover?
```

### Important Responsibility Boundary

Service Discovery may know:

```text
P4 exists
region = EU
zone = A
```

But discovery does not necessarily know:

```text
"EU has enough spare capacity
to absorb all US traffic."
```

Conceptually:

```text
Discovery
→ What endpoints exist?

Health
→ Which endpoints are usable?

Capacity signals
→ Can destination absorb traffic?

Routing / Failover Policy
→ Should traffic actually move there?
```

These capabilities may be integrated by a platform, but they are distinct responsibilities.

---

# 14. Service Mesh

A **Service Mesh** moves common service-to-service networking concerns into infrastructure, commonly through proxies.

Without a mesh:

```text
Checkout Application
├── discovery logic
├── load-balancing logic
├── retry logic
├── timeout logic
└── telemetry logic
```

With a mesh:

```text
Checkout
    ↓
Local Proxy
    ├── Service Discovery
    ├── Load Balancing
    ├── Retry / Timeout
    ├── Circuit Breaking
    └── Telemetry
    ↓
Payment Proxy
    ↓
Payment
```

Checkout can conceptually just say:

```text
"Call Payment."
```

The proxy handles much of the service-to-service networking behavior.

---

# 15. Service Discovery vs Service Mesh

These terms should not be confused.

```text
Service Discovery
= "Where is Payment?"

Service Mesh
= Infrastructure layer for managing
  service-to-service communication.
```

A service mesh can provide/use:

```text
Service Discovery
Load Balancing
Retries
Timeouts
Circuit Breaking
Telemetry
Security
```

Therefore:

> **Service Discovery can be one capability within a Service Mesh, but Service Discovery does not require a Service Mesh.**

---

# 16. Why Use a Service Mesh?

Imagine:

```text
100 services

Python
Java
Go
Node.js
```

Without shared infrastructure, each service might independently implement:

```text
discovery
load balancing
retry
timeouts
telemetry
```

This creates:

```text
duplicated code
inconsistent behavior
tight coupling
harder upgrades
more unrelated networking logic
inside business services
```

A mesh can centralize these concerns and allow networking behavior to evolve more independently.

### Trade-off

The mesh itself becomes critical infrastructure.

```text
Checkout → Proxy ❌ → Payment
```

A broken proxy or bad mesh configuration can disrupt the request path even when Payment is healthy.

---

# 17. Monitoring Service Discovery

Discovery needs its own operational signals.

Important metrics include:

```text
Registry availability / error rate

Registry lookup latency

Registration / deregistration rate

Heartbeat failures

Number of registered instances

Instance churn

Watch / reconnect failures

Update propagation delay
```

These map directly to failure modes.

For example:

```text
Payment instance count:

100
98
72
41
```

could indicate:

```text
heartbeat failure
network problem
deployment issue
registry issue
```

---

# 18. Debugging Stale Discovery

Suppose:

```text
Payment instances: healthy
Registry: healthy
Registry latency: normal

BUT

Checkout sends traffic to P3,
which was terminated 5 minutes ago.
```

First ask:

> **Does the registry still contain P3?**

### Case 1 — Registry Contains P3

```text
Registry:
[P1,P2,P3]

Reality:
[P1,P2]
```

Investigate:

```text
heartbeat / TTL
deregistration
platform removal
registry replication
```

### Case 2 — Registry Is Correct

```text
Registry:
[P1,P2]

Checkout:
[P1,P2,P3]
```

Now investigate:

```text
local discovery cache
polling refresh
watch propagation
broken watch connection
reconnect/recovery logic
```

Only then continue downstream in the debugging sequence:

```text
Why did routing still select P3?

Why didn't health/runtime detection reject it?

Why didn't retry recover?
```

This isolates the failure rather than jumping randomly between components.

---

# 19. Final Integrated Mental Model

```text
                 SERVICE DISCOVERY
                        │
                        ▼
              "Where is Payment?"
                        │
          ┌─────────────┴─────────────┐
          │                           │
      Registry                    DNS / Platform
          │
          ▼
   Payment Instances
     [P1,P2,P3]
          │
          ▼
     Health State
          │
          ▼
   Load Balancing / Routing
          │
          ▼
       Payment
```

Updates can flow through:

```text
Polling
or
Push / Watch
```

Resilience comes from:

```text
Registry HA
+
Last-known-good cache
+
Health-aware routing
+
Retry / Backoff
+
Jitter
```

Locality can influence routing:

```text
same zone
   ↓
same region
   ↓
cross-region if allowed
```

And a Service Mesh may provide much of this networking behavior outside application code.

---

# Part 3 — Interview Takeaways

```text
POLLING
→ Simple periodic refresh.
→ Can create unnecessary registry traffic.

PUSH / WATCH
→ Faster change propagation.
→ Requires reconnect/recovery logic.

PROPAGATION DELAY
→ Registry is correct but clients receive changes late.

LAST-KNOWN-GOOD
→ Allows data path to survive temporary discovery failure.

REGISTRY HA
→ Prevent registry from becoming a single point of failure.

RECOVERY STORM / THUNDERING HERD
→ Many clients reconnect simultaneously after recovery.

BACKOFF + JITTER
→ Spread reconnection traffic over time.

ZONE-AWARE DISCOVERY
→ Prefer nearby instances while preserving failover.

MULTI-REGION DISCOVERY
→ Region failover must consider policy, data, compliance,
  latency and capacity.

SERVICE MESH
→ Infrastructure layer handling common
  service-to-service networking concerns.

MONITORING
→ Registry health, lookup latency, churn,
  heartbeat failures, watch failures and propagation delay.
```

## Golden Principles

> **Discovery tells us what instances exist; it does not by itself guarantee that every discovered instance should receive traffic.**

> **A temporary control-plane failure should not unnecessarily stop a healthy data plane.**

> **Cached discovery improves resilience, but stale state must be expected and mitigated.**

> **Service discovery is one capability that may be provided by a service mesh; the two are not synonymous.**
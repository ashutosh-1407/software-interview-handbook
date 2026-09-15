# Service Discovery — Part 1: Fundamentals, Service Registry & Registration Lifecycle

## 1. Why Service Discovery Exists

In a distributed system, a service rarely runs as a single permanent server.

For example, Payment might currently have:

```text
Payment Service

P1 → 10.0.1.12:8080
P2 → 10.0.1.27:8080
P3 → 10.0.1.43:8080
```

Checkout needs to call Payment:

```text
Checkout
    │
    ▼
Payment
```

The problem is that the physical locations of Payment instances are **dynamic**.

Instances can:

- Scale up during high traffic
- Scale down when traffic drops
- Crash and be replaced
- Restart with a different IP
- Move during deployments
- Be added or removed by an orchestrator

For example:

```text
10:00 AM

Payment:
P1 → 10.0.1.12
P2 → 10.0.1.27
P3 → 10.0.1.43


10:05 AM

P2 crashes
P4 starts

Payment:
P1 → 10.0.1.12
P3 → 10.0.1.43
P4 → 10.0.2.19
```

Checkout should not need a deployment or configuration change every time this happens.

---

## 2. Why Hardcoded Service Addresses Don't Scale

Suppose Checkout contains:

```text
PAYMENT_SERVERS = [
    "10.0.1.12:8080",
    "10.0.1.27:8080",
    "10.0.1.43:8080"
]
```

Now Payment scales:

```text
3 instances
     ↓
10 instances
```

Checkout doesn't automatically know about:

```text
P4
P5
P6
...
P10
```

The new capacity exists, but callers cannot use it.

It becomes even worse when:

```text
P2 crashes
   ↓
P2 replacement gets new IP
   ↓
Checkout still contains old P2 address
```

Hardcoding therefore tightly couples callers to the physical deployment topology of another service.

### Principle

> **Applications should depend on a logical service identity such as `Payment`, rather than maintaining knowledge of individual server locations.**

Service Discovery provides the mechanism for mapping:

```text
Logical service

Payment
   ↓

Current physical locations

[P1, P2, P3]
```

---

## 3. What Service Discovery Actually Answers

At its core:

> **Service Discovery answers: "Where can I currently find this service?"**

For example:

```text
Checkout:
"Where is Payment?"

        ↓

Service Discovery

        ↓

Payment:
P1 → 10.0.1.12:8080
P2 → 10.0.1.27:8080
P3 → 10.0.1.43:8080
```

This allows infrastructure topology to evolve without requiring every caller to know about those changes manually.

---

# 4. Service Discovery vs Health Checks vs Load Balancing

These concepts work closely together, but they answer different questions.

```text
Service Discovery
        ↓
"What Payment instances exist?"

Health Checks
        ↓
"Which instances should receive traffic?"

Load Balancing
        ↓
"Which usable instance gets this request?"
```

Example:

```text
Service Discovery:

Payment → [P1, P2, P3]


Health:

P1 ✅
P2 ❌
P3 ✅


Load Balancing:

[P1, P3]
   ↓
choose P3
```

So a useful mental model is:

```text
DISCOVER
   ↓
FILTER / HEALTH
   ↓
SELECT
   ↓
SEND REQUEST
```

These responsibilities may be implemented by separate components or combined inside infrastructure such as a proxy/service mesh.

### Important

Service Discovery does **not automatically mean**:

```text
Service Discovery
      ↓
Service Registry
      ↓
DNS
      ↓
Load Balancer
```

There are multiple possible discovery architectures.

We will cover those in Part 2.

---

# 5. Service Registry

A common way to implement service discovery is through a **Service Registry**.

A registry is essentially a dynamic directory:

```text
              Service Registry

Payment
├── P1 → 10.0.1.12:8080
├── P2 → 10.0.1.27:8080
└── P3 → 10.0.1.43:8080

Inventory
├── I1 → 10.0.2.11:8080
└── I2 → 10.0.2.18:8080

Orders
├── O1 → 10.0.3.10:8080
├── O2 → 10.0.3.17:8080
└── O3 → 10.0.3.25:8080
```

Instead of callers maintaining hardcoded addresses, the discovery mechanism uses this dynamic information.

Conceptually:

```text
Service Name
     ↓
Service Registry
     ↓
Current Instances
```

For example:

```text
Payment
   ↓
[P1, P2, P3]
```

---

# 6. Service Registry Lifecycle

There are four useful terms to distinguish:

```text
REGISTER
DISCOVER
DEREGISTER
REMOVE
```

The overall lifecycle looks like:

```text
Instance starts
      ↓
   REGISTER
      ↓
Service Registry
      ↓
   DISCOVER
      ↓
Caller uses instance
      ↓
Instance leaves
      ↓
DEREGISTER / REMOVE
```

Let's separate them carefully.

---

## 7. REGISTER — Adding an Instance

Suppose Payment currently has:

```text
Payment → [P1, P2, P3]
```

Traffic increases and a new instance starts:

```text
P4 → 10.0.2.19:8080
```

P4 needs to become discoverable.

```text
P4 starts
    ↓
REGISTER
    ↓
Service Registry

Payment:
[P1, P2, P3, P4]
```

Conceptually, registration means:

> **"I am an instance of Payment and can be reached at this location."**

The registry may store more than an IP address.

Conceptually:

```text
service = Payment
instance = P4
address = 10.0.2.19
port = 8080
region = US
zone = B
```

Metadata can later help with locality-aware routing and other policies.

---

# 8. DISCOVER — Finding Instances

Now Checkout needs Payment.

Conceptually:

```text
Checkout
    ↓
"Where is Payment?"
    ↓
Discovery mechanism
    ↓
[P1, P2, P3, P4]
```

This operation is **discovery**.

However, an important nuance is:

> **Checkout does not necessarily call the Service Registry directly.**

There are multiple models.

### Client-Side Discovery

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

### Server-Side Discovery

```text
Checkout
    ↓
Stable LB / Proxy
    ↓
Infrastructure discovers Payment
    ↓
P2
```

### DNS-Based Discovery

```text
Checkout
    ↓
payment.internal
    ↓
DNS
    ↓
Payment endpoint(s)
```

So:

```text
DISCOVER
```

means obtaining the current service location(s), not necessarily making a literal registry API call from application code.

---

# 9. DEREGISTER — Graceful Departure

Suppose P2 is being intentionally shut down during a deployment.

P2 has an opportunity to tell the discovery system:

```text
"I'm leaving."
```

Conceptually:

```text
P2 begins shutdown
       ↓
DEREGISTER
       ↓
Registry stops advertising P2
```

Before:

```text
Payment → [P1, P2, P3]
```

After:

```text
Payment → [P1, P3]
```

New callers should no longer discover P2.

This is the **graceful path**.

---

# 10. REMOVE — When the Instance Cannot Deregister

Now consider a crash:

```text
Payment → [P1, P2, P3]

P2 💥
```

P2 cannot execute:

```text
DEREGISTER
```

because the process is already dead.

Without another mechanism, the registry might continue advertising:

```text
Payment → [P1, P2, P3]
                ↑
               dead
```

Callers could then attempt:

```text
Checkout
    ↓
P2
    ↓
connection refused / timeout
```

The discovery system therefore needs a way to eventually **remove stale entries**.

For example:

```text
P2 crashes
    ↓
heartbeats stop
    ↓
TTL expires
    ↓
Registry determines P2 is gone
    ↓
REMOVE P2
```

Now:

```text
Payment → [P1, P3]
```

### Important Terminology

```text
REGISTER
→ "Add me."

DISCOVER
→ "Where are the instances?"

DEREGISTER
→ "I'm intentionally leaving."

REMOVE
→ Stop advertising an instance.
```

Deregistration normally results in removal too.

The distinction is useful because:

```text
Graceful shutdown
→ instance can DEREGISTER

Unexpected crash
→ instance cannot deregister
→ registry/platform eventually REMOVES it
```

---

# 11. The Stale Entry Problem

Suppose:

```text
Registry:

Payment → [P1, P2, P3]
```

P2 crashes at:

```text
10:00:00
```

but the registry doesn't immediately know.

For some period:

```text
Reality:

[P1, P3]


Registry:

[P1, P2, P3]
     ↑
    stale
```

This is a **stale discovery entry**.

If Checkout receives that list:

```text
Checkout
    ↓
selects P2
    ↓
connection failure / timeout
```

This introduces an important trade-off:

```text
Remove instances very aggressively
        ↓
faster failure detection
BUT
temporary network problems may cause
healthy instances to be removed


Remove instances slowly
        ↓
fewer false removals
BUT
dead instances remain discoverable longer
```

We saw essentially the same type of trade-off in Health Checks:

> **Failure detection must balance detection speed against false positives.**

---

# 12. Heartbeats

One common solution is for registered instances to periodically send a **heartbeat**.

```text
P1 ─── heartbeat ───► Registry
P2 ─── heartbeat ───► Registry
P3 ─── heartbeat ───► Registry
```

Conceptually:

```text
P1:
"I'm still here."

10 sec later:
"I'm still here."

10 sec later:
"I'm still here."
```

As long as the registry continues receiving the heartbeat, the registration remains valid.

---

# 13. TTL — Time To Live

Heartbeats are commonly combined with a **TTL**.

Example:

```text
Heartbeat interval = 10 seconds
TTL                = 30 seconds
```

Normal operation:

```text
0s      heartbeat
10s     heartbeat
20s     heartbeat
30s     heartbeat
```

Now P2 crashes:

```text
0 sec
last heartbeat

10 sec
no heartbeat

20 sec
no heartbeat

30 sec
TTL expires
      ↓
P2 considered unavailable/stale
      ↓
P2 removed
```

This handles the case where an instance cannot explicitly deregister.

---

# 14. Heartbeat / TTL Trade-off

Suppose we choose:

```text
TTL = 2 seconds
```

Failure detection becomes fast.

But even a temporary network interruption could cause:

```text
heartbeat delayed
      ↓
TTL expires
      ↓
healthy P2 removed
```

This creates **false removal / false failure detection**.

On the other hand:

```text
TTL = 5 minutes
```

reduces sensitivity to brief interruptions, but:

```text
P2 crashes
    ↓
potentially advertised for too long
```

Therefore:

```text
Small TTL
→ faster detection
→ greater sensitivity
→ more false removals

Large TTL
→ slower detection
→ stale dead instances remain longer
```

A common approach is to tolerate multiple missed heartbeats before declaring the instance gone.

---

# 15. Heartbeat Is Not Readiness

This distinction is easy to miss.

Suppose:

```text
Payment P1

Process running        ✅
Heartbeat working      ✅
Database unavailable   ❌
```

P1 might still successfully tell the registry:

```text
"I'm alive."
```

But it might not actually be capable of processing Payment requests correctly.

Therefore:

```text
Heartbeat / TTL
→ Is this registration still alive/present?

Readiness
→ Should this instance receive application traffic?
```

They are related but not equivalent.

A heartbeat should not automatically be interpreted as:

```text
"Everything required to serve traffic is healthy."
```

This connects directly to our Health Checks chapter.

---

# 16. Self-Registration

One registration model is **self-registration**.

The application itself owns its discovery lifecycle:

```text
Payment starts
     ↓
Payment registers itself
     ↓
Payment sends heartbeats
     ↓
Payment eventually deregisters
```

Conceptually:

```text
Payment P1
    │
    │ REGISTER
    ▼
Registry

Payment P1
    │
    │ HEARTBEAT
    ▼
Registry

Payment P1 shutting down
    │
    │ DEREGISTER
    ▼
Registry
```

### Advantages

The application has direct control over its registration behavior.

### Disadvantages

Every service may need discovery-specific logic.

Imagine:

```text
50 services

Python services
Java services
Go services
Node.js services
```

Each might need code for:

```text
registration
heartbeat
deregistration
retry
registry communication
```

That creates duplication and operational complexity.

---

# 17. Platform-Managed Registration

Another approach is to let infrastructure manage registration.

```text
Payment P1 starts
       ↓
Orchestrator / Platform detects P1
       ↓
Discovery information updated
```

When P1 disappears:

```text
P1 terminates
      ↓
Platform notices
      ↓
Discovery information updated
```

The application doesn't necessarily need to understand the registry protocol.

Conceptually:

```text
Application:
"I am Payment."

Infrastructure:
"I'll manage where you are and advertise you."
```

---

# 18. Why Platform-Managed Registration Can Be Attractive

Consider:

```text
100 services
```

Instead of requiring every team to correctly implement:

```text
register()
heartbeat()
deregister()
recover_registry_connection()
...
```

the platform provides a consistent lifecycle.

Benefits include:

```text
Less application code

Less duplication

Consistent registration behavior

Separation of responsibilities

Infrastructure can evolve independently
of application business logic
```

For example, changing discovery infrastructure should ideally not require:

```text
modify 100 services
      ↓
test 100 services
      ↓
deploy 100 services
```

Platform-managed discovery helps isolate that infrastructure concern.

---

# 19. When Self-Registration Still Makes Sense

Platform-managed registration is not automatically superior.

If the environment doesn't provide a capable orchestrator/platform, the service may need to manage registration itself.

Therefore:

```text
Modern managed/orchestrated environment
→ platform-managed registration often attractive

Simpler/custom environment
→ self-registration may be reasonable
```

The architecture depends on the infrastructure available.

---

# 20. Failure Scenario

Suppose:

```text
Payment:
P1 ✅
P2 💥
P3 ✅
```

But the registry still contains:

```text
[P1, P2, P3]
```

A strong system should not depend only on graceful deregistration because crashes are inherently ungraceful.

Instead:

```text
P2 crashes
    ↓
no DEREGISTER
    ↓
heartbeats stop
    ↓
TTL expires
    ↓
P2 removed
```

And even during the stale interval, other mechanisms may help:

```text
stale P2 discovered
       ↓
runtime health / LB may reject it
       ↓
or connection fails
       ↓
retry may select another instance
```

This is an important recurring system-design principle:

> **Reliability comes from multiple complementary mechanisms rather than assuming one component will perfectly prevent every failure.**

---

# Part 1 — Interview Takeaways

```text
SERVICE DISCOVERY
→ Maps logical service identity to current locations.

SERVICE REGISTRY
→ Dynamic directory of service instances.

REGISTER
→ Add an instance to discovery.

DISCOVER
→ Obtain available service locations.

DEREGISTER
→ Gracefully announce that an instance is leaving.

REMOVE
→ Stop advertising an instance.

HEARTBEAT
→ Periodic signal that registration is still alive.

TTL
→ Maximum period registration can survive without renewal.

STALE ENTRY
→ Registry advertises an instance that is no longer valid.

SELF-REGISTRATION
→ Application manages its own discovery lifecycle.

PLATFORM-MANAGED REGISTRATION
→ Infrastructure manages the lifecycle.
```

## Core Relationships

```text
Service Discovery
→ WHERE is Payment?

Health / Readiness
→ SHOULD this Payment instance receive traffic?

Load Balancing
→ WHICH usable Payment instance gets the request?
```

## Lifecycle

```text
                 REGISTER
                    ↓
             Service Registry
                    │
                    │ DISCOVER
                    ▼
                 Caller
                    │
                    ▼
              Service Instance
                    │
          ┌─────────┴─────────┐
          │                   │
      Graceful             Unexpected
      shutdown               crash
          │                   │
     DEREGISTER          heartbeat stops
          │                   │
          │                TTL expires
          │                   │
          └─────────┬─────────┘
                    ↓
                  REMOVE
```

## Golden Principle

> **Service Discovery decouples a service's logical identity from the constantly changing physical locations of its instances.**
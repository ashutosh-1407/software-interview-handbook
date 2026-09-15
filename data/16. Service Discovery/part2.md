# Service Discovery — Part 2: Discovery Models, DNS, Caching & Stale State

## 1. How Does a Caller Actually Discover a Service?

From Part 1, the registry may know:

```text
Payment
├── P1 → 10.0.1.12:8080
├── P2 → 10.0.1.27:8080
└── P3 → 10.0.1.43:8080
```

Now Checkout needs to call Payment.

The next design question is:

> **Who performs discovery and who chooses the Payment instance?**

There are several architectures:

```text
1. Client-Side Discovery

2. Server-Side Discovery
   through LB / Proxy

3. DNS-Based Discovery
```

These are alternatives/patterns.

Do **not** memorize Service Discovery as a mandatory chain:

```text
Registry → DNS → Load Balancer
```

That is not universally how discovery works.

---

# 2. Client-Side Discovery

In client-side discovery, the calling application participates directly in discovery.

```text
              Service Registry

Payment → [P1, P2, P3]
               ▲
               │
            discover
               │
           Checkout
               │
          chooses P2
               │
               ▼
              P2
```

The sequence is:

```text
1. Checkout asks:
   "Where is Payment?"

2. Registry returns:
   [P1, P2, P3]

3. Checkout selects an instance.

4. Checkout calls that instance directly.
```

Therefore Checkout is responsible for both:

```text
Discovery
+
at least part of load balancing / endpoint selection
```

For example:

```text
Registry
   ↓
[P1,P2,P3]
   ↓
Checkout chooses P2
   ↓
Checkout → P2
```

---

# 3. Advantages of Client-Side Discovery

Once Checkout knows the instances, it can call them directly.

```text
Checkout ─────────────► P2
```

There is no dedicated routing proxy required between the services for every request.

Potential advantages:

```text
Direct service-to-service call

Potentially lower routing overhead

Caller has direct control over
instance-selection behavior
```

But that control introduces complexity.

---

# 4. Disadvantages of Client-Side Discovery

Suppose the organization has:

```text
100 services

Python
Java
Go
Node.js
```

Each caller may need logic for:

```text
registry communication
discovery caching
instance selection
load balancing
stale endpoint handling
reconnection
retry behavior
```

Now discovery becomes duplicated across many applications.

For example:

```text
Checkout.py
├── business logic
├── discovery logic
├── LB logic
└── registry recovery logic

Orders.java
├── business logic
├── discovery logic
├── LB logic
└── registry recovery logic

Inventory.go
├── business logic
├── discovery logic
├── LB logic
└── registry recovery logic
```

Changing the discovery mechanism could require changes across many services.

### Trade-off

```text
Client-Side Discovery

+ direct calls
+ caller controls routing
+ potentially less infrastructure hop

- more application complexity
- duplicated logic
- harder consistency across languages/services
- discovery changes may require application changes
```

---

# 5. Server-Side Discovery

Instead of making Checkout perform discovery, we can put a routing component between Checkout and Payment.

For example:

```text
Checkout
    │
    ▼
Stable Internal LB / Proxy
    │
    ├── P1
    ├── P2
    └── P3
```

Checkout only needs a stable logical destination:

```text
payment.internal
```

The infrastructure handles:

```text
discover Payment instances
        ↓
determine usable instances
        ↓
select one
        ↓
route request
```

Conceptually:

```text
Checkout
    │
    │ "Call Payment"
    ▼
LB / Proxy
    │
    │ discovers / maintains
    │ Payment backend list
    ▼
[P1,P2,P3]
    │
    ▼
choose P2
    │
    ▼
P2
```

---

# 6. Important: The LB Doesn't Need to Query the Registry Per Request

A bad mental model would be:

```text
Every Checkout request
        ↓
LB
        ↓
Registry lookup
        ↓
choose instance
```

That would unnecessarily put registry lookups directly into every application request.

Instead, the LB/proxy can maintain discovery state:

```text
Registry
   │
   │ watch / refresh
   ▼
LB cached backend list

[P1,P2,P3]
```

Normal requests then use that state:

```text
Checkout
    ↓
LB
    ↓
P2
```

This reduces discovery overhead and makes temporary registry failures less likely to immediately break application traffic.

---

# 7. Advantages of Server-Side Discovery

The application can remain simpler:

```text
Checkout:
"Call Payment"
```

instead of:

```text
Checkout:
1. Query registry
2. Cache endpoints
3. Choose endpoint
4. Detect stale endpoint
5. Handle registry reconnect
6. Call Payment
```

This provides:

```text
Centralized discovery/routing behavior

Consistent load-balancing policies

Less discovery code inside applications

Easier infrastructure evolution

Better separation of responsibilities
```

For example, changing:

```text
Round Robin
     ↓
Least Connections
```

may happen in the routing infrastructure instead of requiring changes to many applications.

---

# 8. Server-Side Discovery Trade-off

The routing layer becomes important infrastructure.

```text
Checkout
    ↓
Proxy ❌
    ↓
Payment
```

Even if Payment is perfectly healthy, a broken proxy can prevent Checkout from reaching it.

Therefore:

> **Moving discovery out of applications reduces application complexity, but the routing infrastructure itself must be highly available.**

There may also be:

```text
an additional network hop
additional infrastructure
operational complexity
```

So server-side discovery is not "free"; it moves complexity from application code into infrastructure.

---

# 9. Client-Side vs Server-Side Discovery

```text
CLIENT-SIDE

Checkout
   ↓
Registry
   ↓
[P1,P2,P3]
   ↓
Checkout chooses
   ↓
P2
```

vs.

```text
SERVER-SIDE

Checkout
   ↓
LB / Proxy
   ↓
discover / select
   ↓
P2
```

### Comparison

| Concern | Client-Side | Server-Side |
|---|---|---|
| Discovery logic | Caller | Infrastructure |
| Instance selection | Caller | LB / Proxy |
| Application complexity | Higher | Lower |
| Direct call | Usually yes | Usually through intermediary |
| Policy consistency | Harder across many clients | Easier to centralize |
| Infrastructure dependency | Lower | Proxy/LB becomes critical |
| Multi-language duplication | Higher | Lower |

### Interview Principle

> **Client-side discovery moves intelligence into callers; server-side discovery moves it into routing infrastructure.**

---

# 10. DNS-Based Service Discovery

Another common mechanism is DNS.

Instead of Checkout knowing:

```text
10.0.1.12
10.0.1.27
10.0.1.43
```

it calls:

```text
payment.internal
```

DNS resolves that logical service name.

```text
Checkout
    │
    ▼
payment.internal
    │
    ▼
DNS
    │
    ▼
Payment destination(s)
```

The application can use a normal hostname instead of understanding a custom service-registry API.

---

# 11. DNS Can Resolve in Different Ways

DNS-based discovery does not imply one specific topology.

### Model A — DNS Resolves to a Load Balancer

```text
Checkout
    ↓
payment.internal
    ↓
DNS
    ↓
Payment LB
    ↓
[P1,P2,P3]
```

Here:

```text
DNS
→ finds the stable LB

LB
→ manages/selects Payment instances
```

---

### Model B — DNS Resolves Directly to Service Instances

DNS could instead return multiple addresses:

```text
payment.internal
        ↓
DNS
        ↓
P1
P2
P3
```

Then:

```text
Checkout
   ↓
one of the returned instances
```

There may be **no dedicated load balancer** in this architecture.

This distinction is important.

Do not automatically assume:

```text
DNS → LB
```

---

# 12. DNS Caching

DNS responses are commonly cached.

Suppose:

```text
payment.internal
        ↓
[P1,P2,P3]

TTL = 60 seconds
```

Checkout or its DNS resolver can reuse that information instead of performing another lookup for every request.

This improves efficiency.

But now consider:

```text
t = 0

DNS returns:
[P1,P2,P3]


t = 1 sec

P2 crashes
```

The cached result may still contain P2.

For some period:

```text
Cached DNS:
[P1,P2,P3]

Reality:
[P1,P3]
```

This is stale discovery information.

---

# 13. DNS TTL Trade-off

Suppose:

```text
TTL = 60 seconds
```

Advantages:

```text
fewer DNS lookups
less DNS infrastructure load
better caching efficiency
```

Disadvantage:

```text
changes may take longer to propagate
```

Now suppose:

```text
TTL = 1 second
```

The discovery information becomes fresher, but callers/resolvers perform much more frequent DNS resolution.

Therefore:

```text
Long TTL
→ efficient
→ potentially stale longer

Short TTL
→ fresher
→ more DNS lookup overhead
```

This is another recurring distributed-system trade-off:

> **Freshness vs efficiency.**

---

# 14. Endpoint vs Instance

If DNS returns:

```text
10.0.1.12:8080
```

technically that address is an **endpoint**.

In our Payment example, it corresponds to a Payment **instance**.

So both terms may appear:

```text
Service Instance
P1

Endpoint
10.0.1.12:8080
```

When discussing routing among P1/P2/P3, saying **instance** is usually clearer.

---

# 15. Discovery Information Should Usually Be Cached

Suppose Checkout receives:

```text
5,000 requests/sec
```

and Payment topology is:

```text
[P1,P2,P3]
```

It makes little sense to do:

```text
Request 1 → Registry → Payment
Request 2 → Registry → Payment
Request 3 → Registry → Payment
...
Request 5000 → Registry → Payment
```

The topology is unlikely to change between every request.

This creates:

```text
unnecessary network hop
registry load
additional latency
strong dependency on registry availability
```

Instead:

```text
Registry
   ↓
refresh discovery state
   ↓
Checkout cache

Payment → [P1,P2,P3]
```

Normal requests can use:

```text
Checkout
    ↓
cached Payment list
    ↓
Payment
```

---

# 16. Control Plane vs Data Plane

This gives us an important architecture distinction.

### Control Plane

Service discovery/configuration tells Checkout:

```text
"Payment currently exists at P1, P2 and P3."
```

Conceptually:

```text
Service Registry
       │
       │ discovery information
       ▼
    Checkout
```

This is **control-plane information**.

---

### Data Plane

The actual business request is:

```text
Checkout
    │
    │ POST /payment
    ▼
Payment
```

This is the **data path / data plane**.

A resilient design tries to avoid:

```text
Control-plane failure
        ↓
Immediate data-plane failure
```

when the data plane already has enough information to continue operating.

---

# 17. Why Registry Lookup Per Request Is Dangerous

Consider:

```text
Every Checkout request
       ↓
Service Registry
       ↓
Payment instance
       ↓
Payment
```

Now the registry fails:

```text
Registry ❌
```

Even though:

```text
P1 ✅
P2 ✅
P3 ✅
```

Checkout cannot reach them because every request depends on the registry.

We have transformed:

```text
Service Discovery outage
```

into:

```text
Payment outage
```

even though Payment itself is healthy.

---

# 18. Last-Known-Good Discovery State

Instead, Checkout can retain its last valid discovery result:

```text
Last-known-good state:

Payment → [P1,P2,P3]
```

Now:

```text
Registry ❌

BUT

Checkout
    ↓
cached [P1,P2,P3]
    ↓
Payment
```

Existing traffic can continue temporarily.

This is a powerful resilience mechanism:

> **A temporary control-plane outage should not unnecessarily destroy an already-working data path.**

---

# 19. But Cached Discovery Can Become Stale

Caching isn't free.

Suppose Checkout has:

```text
[P1,P2,P3]
```

while the registry is unavailable.

Then:

```text
P3 dies
P4 starts
```

Reality becomes:

```text
[P1,P2,P4]
```

Checkout still knows:

```text
[P1,P2,P3]
```

Two problems appear.

### Problem 1 — Dead Instance

Checkout may still attempt:

```text
P3 ❌
```

causing:

```text
connection refused
timeout
```

### Problem 2 — New Capacity Is Invisible

P4 exists:

```text
P4 ✅
```

but Checkout doesn't know about it.

Traffic remains concentrated on:

```text
P1
P2
```

which could increase load on those instances.

---

# 20. Last-Known-Good Is a Temporary Resilience Mechanism

Therefore:

```text
Registry unavailable
       ↓
continue with last-known-good state
       ↓
do NOT assume state remains correct forever
       ↓
keep attempting registry recovery
       ↓
refresh/reconcile when registry returns
```

The principle is:

```text
Last-known-good state

= temporary resilience

≠ permanent source of truth
```

---

# 21. How Other Components Mitigate Stale Discovery

Suppose Checkout still knows:

```text
[P1,P2,P3]
```

but P3 is dead.

Several mechanisms we've already studied can reduce the impact.

### Health-Aware Routing

```text
Discovery says:
P3 exists

BUT

Health check:
P3 ❌

LB avoids P3
```

### Runtime Failure Detection

If there is no separate active health-checking LB:

```text
Checkout → P3
             ↓
      connection fails
```

The caller/routing layer can temporarily mark that endpoint unusable.

### Retry

```text
Checkout → P3 ❌
              ↓
            retry
              ↓
             P1 ✅
```

So:

```text
Service Discovery
→ gives topology

Health Checks
→ filter unusable instances

Load Balancing
→ chooses an instance

Retry
→ handles some transient/stale-selection failures
```

These mechanisms complement each other.

---

# 22. Stale State in a Distributed Registry

The registry itself may be distributed.

```text
Registry A  ◄────►  Registry B
```

Initially:

```text
A:
Payment → [P1,P2,P3]

B:
Payment → [P1,P2,P3]
```

P3 dies.

Registry A learns:

```text
A:
[P1,P2]
```

But before the update reaches B, a network partition occurs:

```text
Registry A       X       Registry B

[P1,P2]                  [P1,P2,P3]
                              ↑
                             stale
```

Now different callers can receive different discovery views.

This connects Service Discovery directly to our **CAP Theorem** discussion.

---

# 23. Availability vs Stronger Consistency

During the partition, Registry B has two broad choices.

### Option A — Continue Answering

```text
Registry B
    ↓
[P1,P2,P3]
```

P3 might be stale.

But callers can still potentially reach:

```text
P1 ✅
P2 ✅
```

and other mechanisms may mitigate P3.

---

### Option B — Refuse to Answer

Registry B says:

```text
"I cannot guarantee my state is current,
so I won't return anything."
```

Now callers depending on B cannot discover:

```text
P1
P2
```

even though those instances are healthy.

---

# 24. Service Discovery and CAP

For many internal service-discovery scenarios, temporarily stale discovery information may be preferable to making discovery unavailable.

Why?

```text
Stale list:
[P1,P2,P3]

P1/P2 still usable
P3 failure may be mitigated
```

versus:

```text
No discovery result

P1/P2 effectively unreachable
through this discovery path
```

So availability can often be highly valuable.

However:

> **Do not memorize "Service Discovery = AP."**

The correct consistency/availability trade-off depends on:

```text
implementation
failure consequences
routing semantics
type of metadata
system requirements
```

The interview-quality statement is:

> **Many discovery systems can tolerate temporarily stale topology information because health checks, runtime failure detection and retries can mitigate stale instances, but the required consistency model depends on the system.**

---

# 25. Registry State vs Caller Cache

These are two different places where stale state can exist.

### Stale Registry

```text
Registry B:

Payment → [P1,P2,P3]
                 ↑
                stale
```

Checkout asks B and receives stale information.

### Stale Caller Cache

The registry itself may already be correct:

```text
Registry:
[P1,P2]
```

but Checkout still has:

```text
Checkout cache:
[P1,P2,P3]
```

These require different debugging paths.

```text
Wrong registry state
→ investigate registration / heartbeat /
  replication / registry consistency

Correct registry + wrong caller state
→ investigate cache refresh /
  polling / watch propagation
```

This distinction becomes very important during production debugging.

---

# Part 2 — Interview Takeaways

```text
CLIENT-SIDE DISCOVERY
→ Caller obtains instances and chooses one.

SERVER-SIDE DISCOVERY
→ LB/proxy performs discovery and routing.

DNS DISCOVERY
→ Logical hostname resolves to service destination(s).

DNS → LB
is possible.

DNS → instances directly
is also possible.

There is no mandatory:
Registry → DNS → LB chain.
```

## Caching

```text
Registry
    ↓
discovery refresh
    ↓
Local / routing cache
    ↓
normal requests
```

Benefits:

```text
lower lookup overhead
lower latency
less registry load
control-plane failure tolerance
```

Cost:

```text
stale topology
```

---

## Control Plane vs Data Plane

```text
CONTROL PLANE

Registry
   ↓
"Payment = [P1,P2,P3]"


DATA PLANE

Checkout
   ↓
actual request
   ↓
Payment
```

### Principle

> **Do not unnecessarily make every data-plane request depend on a control-plane lookup.**

---

## Last-Known-Good State

```text
Registry ❌
    ↓
use cached [P1,P2,P3]
    ↓
existing traffic can continue
```

But:

```text
cached discovery
= temporary resilience

not permanent truth
```

---

## Stale Discovery Defense

```text
Stale endpoint
      ↓
Health-aware routing
      ↓
Runtime failure detection
      ↓
Retry / alternate instance
```

No single mechanism guarantees perfect protection.

---

## CAP Connection

```text
Network Partition

Stronger consistency
→ refuse uncertain discovery
→ availability may suffer

Higher availability
→ return current local view
→ may be stale
```

> **For many service-discovery workloads, slightly stale topology can be preferable to complete discovery unavailability—but this is a design trade-off, not a universal AP rule.**

---

## Core Mental Model

```text
                  SERVICE DISCOVERY

              "Where is Payment?"
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
   Client-Side     Server-Side      DNS
    Discovery       Discovery     Discovery
         │             │             │
         └─────────────┼─────────────┘
                       ▼
               Payment Instances
                  [P1,P2,P3]

                       +
                       │
              Cached Discovery
                       │
                       ▼
             Last-Known-Good State

                       +
                       │
        Health Checks / Load Balancing / Retry

                       ↓

               Resilient Routing
```

## Golden Principle

> **Service discovery should keep callers aware of changing service topology without unnecessarily putting the discovery control plane into every application's critical request path.**
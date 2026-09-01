# Load Balancer — Part 1
## Fundamentals, L4 vs L7, and Routing Strategies

---

# 1. Why Do We Need a Load Balancer?

Start with:

```text
Users
  ↓
Application Server
  ↓
Database
```

As traffic grows:

```text
50 req/sec
→ 500 req/sec
→ 50,000+ req/sec
```

one server eventually hits limits:

```text
CPU
Memory
Network
Concurrent connections
```

It is also a **single point of failure**:

```text
Server crashes
→ application unavailable
```

Instead, horizontally scale:

```text
             ┌→ Server A
Users → LB ──┼→ Server B
             └→ Server C
```

The load balancer decides which healthy backend receives each request. fileciteturn16file1L40-L63 fileciteturn16file1L79-L97

---

# 2. Load Balancer = Scalability + Resilience

A load balancer is not only for scaling.

### Scalability

```text
1 server
↓
10 servers
↓
100 servers
```

Traffic can be distributed across instances.

### Resilience

Suppose:

```text
Server A ✅
Server B ❌
Server C ✅
```

The load balancer removes B from rotation:

```text
             ┌→ A ✅
Users → LB ──┤
             └→ C ✅
```

So:

> **A load balancer removes the application's dependency on a single application instance.**

It provides:

```text
horizontal scalability
high availability
failure isolation
traffic management
zero-downtime deployments
```

This scalability + resilience distinction is an important senior-level interview point. fileciteturn16file1L107-L137 fileciteturn16file0L32-L42

---

# 3. Core Responsibilities

A production load balancer primarily handles:

```text
Traffic Distribution
        +
Health Monitoring
        +
Failover
```

Example:

```text
Request 1 → A
Request 2 → B
Request 3 → C
```

If B fails:

```text
B removed from routing pool

future traffic
→ A / C
```

This lets healthy servers continue serving users while failed instances recover. fileciteturn16file1L138-L163

---

# 4. Where Does the Load Balancer Sit?

A simple architecture:

```text
Users
  ↓
DNS
  ↓
Load Balancer
  ↓
┌─────┬─────┬─────┐
A     B     C
  ↓
Database / Cache
```

Large systems often use multiple layers:

```text
Users
  ↓
Geo DNS
  ↓
Global Load Balancer
  ↓
Regional Load Balancer
  ↓
Application Servers
```

We'll cover the multi-region architecture deeply in Part 3. fileciteturn16file1L164-L181

---

# 5. Layer 4 Load Balancing

Layer 4 operates at the **transport layer**.

It routes using information such as:

```text
TCP / UDP
IP Address
Port
```

Example:

```text
Client
  ↓
10.0.0.10:443
  ↓
L4 Load Balancer
  ↓
Backend Server
```

Advantages:

```text
very fast
low latency
high throughput
```

Because it does not need to understand HTTP content.

Examples from the handbook:

```text
AWS Network Load Balancer
HAProxy TCP mode
```

fileciteturn16file1L182-L201

---

# 6. Layer 7 Load Balancing

Layer 7 understands the **application protocol**, such as HTTP/HTTPS.

It can inspect:

```text
URL / path
headers
cookies
hostname
HTTP method
```

Therefore it can perform content-based routing.

Example:

```text
/payments
    ↓
Payment Service

/images/*
    ↓
Image Service
```

Or:

```text
/api/v1/makePayment
→ Payment servers

/api/v1/addToCart
→ Cart servers
```

Advantages:

```text
path-based routing
header-based routing
cookie-based routing
authentication integration
```

Examples from the handbook:

```text
AWS Application Load Balancer
NGINX
Envoy
```

fileciteturn16file1L202-L236

---

# 7. L4 vs L7

| L4 | L7 |
|---|---|
| Transport layer | Application layer |
| TCP / UDP | HTTP / HTTPS |
| IP + port | URL, headers, cookies, host |
| Faster / lower latency | More routing intelligence |
| High throughput | Content-aware routing |

Mental model:

```text
L4
→ "Where should this connection go?"

L7
→ "What is this HTTP request asking for,
   and where should it go?"
```

### When to choose L4

Prefer when:

```text
very high throughput
low latency
TCP/UDP traffic
HTTP inspection unnecessary
```

### When to choose L7

Prefer when:

```text
path-based routing
header/cookie routing
service routing
HTTP-aware behavior
```

A large architecture may use **both at different layers**. fileciteturn16file1L237-L257

---

# 8. Routing Algorithms

Once the LB has multiple healthy servers:

```text
A
B
C
```

it still needs to decide:

> **Which server should receive the next request?**

Different workloads require different algorithms.

---

# 9. Round Robin

Requests rotate sequentially:

```text
Request 1 → A
Request 2 → B
Request 3 → C
Request 4 → A
Request 5 → B
```

Good when:

```text
servers have similar capacity
+
requests have similar cost
```

Problem:

If one request takes:

```text
50 ms
```

and another:

```text
10 seconds
```

Round Robin does not account for that difference.

fileciteturn16file1L258-L268

---

# 10. Least Connections

Route new traffic to the server with the fewest active connections.

Example:

```text
A → 150 active connections
B → 20 active connections
C → 100 active connections

Next request → B
```

Useful when:

```text
request durations vary
```

because slow requests naturally keep connections open longer.

This was also the reasoning used in our earlier **slow-server scenario**: requests accumulate on the slower server, so Least Connections naturally shifts new work elsewhere. The handbook specifically records this reasoning as strong, while noting that production systems may additionally consider response time and queue length. fileciteturn16file1L266-L275 fileciteturn16file1L464-L470

---

# 11. Weighted Round Robin

Not every backend necessarily has equal capacity.

Example:

```text
Server A
64 CPU
weight = 5

Server B
16 CPU
weight = 1
```

A receives proportionally more traffic.

Useful for:

```text
heterogeneous servers
different instance sizes
gradual traffic migration
```

The core idea is:

```text
more capacity
→ higher weight
→ more traffic
```

fileciteturn16file1L278-L286

---

# 12. Least Response Time

A server can technically be alive while performing terribly.

Example:

```text
A → 95 ms
B → 105 ms
C → 8,000 ms
```

Even if C still returns successful responses, routing more traffic to it can make the system worse.

A latency-aware strategy can shift traffic toward faster servers.

```text
Healthy
≠
Performing well
```

This distinction becomes important for production health handling in Part 2. fileciteturn16file1L290-L297 fileciteturn16file0L43-L57

---

# 13. IP Hash

Hash the client IP:

```text
hash(client_ip)
      ↓
Backend Server
```

The same client tends to map to the same backend.

Useful for:

```text
session affinity
```

But tying users to particular application servers reduces flexibility, so modern systems often prefer externalizing session state instead.

We'll cover this with sticky sessions in Part 2. fileciteturn16file1L287-L289

---

# 14. Choosing the Routing Algorithm

Quick mental model:

```text
Similar servers + similar requests
→ Round Robin

Different server capacities
→ Weighted Round Robin

Long / variable request durations
→ Least Connections

Performance varies significantly
→ Least Response Time

Need affinity
→ IP Hash / sticky routing
```

There is no universally best algorithm.

The choice depends on:

```text
request duration
server capacity
connection lifetime
latency
session requirements
```

---

# 15. Why Not Just DNS Round Robin?

Could DNS simply return:

```text
A
B
C
```

and distribute clients?

Yes, but DNS and load balancers solve different problems.

DNS is useful for:

```text
service discovery
regional endpoint selection
```

A load balancer provides more dynamic:

```text
traffic routing
health monitoring
failure handling
load-aware decisions
```

The major problem is DNS caching.

Suppose DNS gives a client:

```text
Server B
```

Then B fails.

The client or resolver may continue using the cached DNS result.

A load balancer can continuously monitor B and stop routing new requests to it much faster.

So:

```text
DNS
→ Where is the service / region?

Load Balancer
→ Which healthy backend should handle this request?
```

fileciteturn16file0L13-L25

---

# 16. Senior-Level Framing

Weak interview answer:

> "A load balancer distributes traffic."

Better:

> **A load balancer is a traffic-management layer that distributes requests across multiple instances, detects failures, supports horizontal scaling and deployments, and removes dependency on any single application server.**

At senior level, the important question isn't merely:

```text
Do I know what a load balancer is?
```

It is:

```text
Why do I need it?

What failure does it protect against?

Which routing strategy fits my workload?

L4 or L7?

What trade-offs am I introducing?
```

That design-decision framing is explicitly emphasized in the senior-engineer addendum. fileciteturn16file0L137-L145

---

# Part 1 Interview Takeaways

```text
Load Balancer
→ scalability + resilience + traffic management
```

```text
L4
→ TCP/UDP
→ IP + port
→ fast / high throughput
```

```text
L7
→ HTTP-aware
→ URL/header/cookie routing
→ more flexible
```

```text
Round Robin
→ similar servers/workloads

Weighted Round Robin
→ different capacities

Least Connections
→ variable request durations

Least Response Time
→ performance-aware routing

IP Hash
→ affinity
```

```text
DNS
→ discover/select endpoint or region

Load Balancer
→ dynamically select healthy backend
```

```text
Healthy
≠
Performing well
```

**Core principle:**

> A load balancer removes dependency on a single application instance and intelligently distributes traffic across healthy backends, improving scalability, availability, and resilience.
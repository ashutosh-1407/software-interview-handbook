# Load Balancer — Interview Cheat Sheet

---

## 1. Why Load Balancer?

```text
Users
  ↓
Load Balancer
  ↓
A   B   C
```

A load balancer provides:

```text
Traffic Distribution
Scalability
Resilience
Health Monitoring
Failover
Zero-Downtime Deployments
```

> **It removes the application's dependency on a single application instance.**

fileciteturn16file1L89-L97

---

## 2. Scalability vs Resilience

```text
Scalability
→ distribute traffic across more servers

Resilience
→ failed server removed
→ traffic redirected to healthy servers
```

So:

```text
Load Balancer
= Scaling + Resilience + Traffic Management
```

---

## 3. L4 vs L7

### Layer 4

```text
TCP / UDP
IP + Port

→ faster
→ lower latency
→ high throughput
```

### Layer 7

```text
HTTP / HTTPS

Understands:
URL
Headers
Cookies
Hostname
HTTP Method
```

Allows:

```text
/payments → Payment Service
/images   → Image Service
```

Memory:

```text
L4 → connection/transport aware
L7 → application/HTTP aware
```

fileciteturn16file1L182-L202 fileciteturn16file1L215-L240

---

## 4. Routing Algorithms

```text
Round Robin
→ similar servers + similar requests

Weighted Round Robin
→ different server capacities

Least Connections
→ variable/long request durations

Least Response Time
→ route away from slow servers

IP Hash
→ session affinity
```

fileciteturn16file1L258-L268 fileciteturn16file1L278-L296

---

## 5. Health ≠ Performance

Dangerous assumption:

```text
/health → 200 OK
→ everything is fine ❌
```

Example:

```text
/health       → 200 OK
response time → 8 sec
```

Monitor:

```text
Error Rate
Latency
Active Connections
Queue Depth
Resource Utilization
```

> **A server can be alive but operationally degraded.**

fileciteturn16file0L43-L57

---

## 6. Slow Server

```text
A → 100 ms
B → 120 ms
C → 8 sec
```

Possible strategies:

```text
Least Connections
→ requests accumulate on C
→ new traffic shifts elsewhere

Least Response Time
→ explicitly favor faster servers
```

Also watch:

```text
latency
queue depth
active connections
error rate
```

fileciteturn16file1L408-L417

---

## 7. Health Check + Failover

```text
A ✅
B ❌
C ✅
```

LB:

```text
detect B failure
↓
remove B from pool
↓
route to A/C
```

When B recovers:

```text
passes health checks
↓
return to pool
```

---

## 8. DNS vs Load Balancer

```text
DNS
→ discover/select endpoint or region

Load Balancer
→ select healthy backend dynamically
```

DNS limitation:

```text
DNS responses cached
→ failed endpoint may remain cached
```

LB:

```text
continuous health monitoring
+
dynamic routing
```

fileciteturn16file0L13-L25

---

## 9. Sticky Sessions

```text
User X
→ Server A
→ Server A
→ Server A
```

Useful when session state lives locally.

But:

```text
uneven traffic
poor elasticity
harder failover
```

Prefer when possible:

```text
Stateless App Servers
        ↓
Redis / Distributed Session Store
```

Then:

```text
any server can handle any request
```

fileciteturn16file1L301-L322

---

## 10. WebSockets

WebSockets are long-lived connections:

```text
Client
  ↕
LB
  ↕
Server A
```

The established connection remains associated with its backend.

If A crashes:

```text
existing connection breaks
→ client reconnects
→ LB chooses healthy backend
```

For many long-lived connections:

```text
Least Connections
```

can be useful for balancing connection load.

fileciteturn16file1L403-L407

---

## 11. TLS Termination

```text
HTTPS
  ↓
Load Balancer
  ↓
HTTP / Internal TLS
  ↓
Backends
```

Benefits:

```text
centralized certificates
reduced TLS work on backends
```

Trade-off:

```text
internal traffic must remain appropriately secured
```

fileciteturn16file1L329-L349

---

## 12. LB Itself Can Be a SPOF

Bad:

```text
Users
 ↓
ONE LB ❌
 ↓
Healthy Servers
```

Solutions:

### Active-Passive

```text
LB1 active
LB2 standby

LB1 fails
→ LB2 takes over
```

### Active-Active

```text
       ┌→ LB1
Users ─┤
       └→ LB2
```

Both serve traffic.

fileciteturn16file1L354-L369

---

## 13. Global Load Balancing

Typical large-scale architecture:

```text
Users
  ↓
Geo DNS
  ↓
Global LB
  ↓
Regional LB
  ↓
Service LB
  ↓
Application Servers
```

Mental model:

```text
Geo DNS
→ choose region

Global LB
→ regional traffic distribution/failover

Regional LB
→ backend distribution

Service LB
→ service-instance routing
```

fileciteturn16file0L82-L108

---

## 14. Failure Hierarchy

```text
Server failure
→ remove backend

AZ failure
→ shift to healthy AZ

LB failure
→ active-active/passive failover

Region failure
→ global routing to healthy region
```

Think:

```text
Failure Isolation
+
Blast Radius Reduction
```

---

## 15. Zero-Downtime Deployment

```text
A B C

remove A from traffic
↓
deploy A
↓
health check
↓
return A
↓
repeat for B/C
```

Load balancing enables rolling deployments without taking down the entire application.

fileciteturn16file0L35-L42

---

## 16. Connection Draining

Before terminating a backend:

```text
stop NEW requests
↓
allow existing requests/connections to finish
↓
terminate
```

Especially important for:

```text
long requests
persistent connections
WebSockets
```

Memory:

```text
Drain
→ no new work
→ finish existing work
```

---

## 17. Load Balancer Doesn't Create Capacity

If:

```text
A overloaded
B overloaded
C overloaded
```

changing routing cannot solve:

```text
Total Demand > Total Capacity
```

May need:

```text
Horizontal Scaling
Caching
Rate Limiting
Backpressure
Capacity Planning
```

Always identify the actual bottleneck.

---

## 18. Production Monitoring

Watch:

```text
Request Rate
Latency
Error Rate

Backend Health
Active Connections
Queue Depth
Resource Utilization

Traffic Distribution
LB Saturation
```

Useful debugging signals:

```text
One server gets too much traffic
→ weights / affinity / routing issue

200 OK but high latency
→ degraded backend

All servers overloaded
→ capacity problem

LB saturated
→ scale LB layer
```

The source emphasizes latency, errors, connections, queue depth, and resource utilization when judging backend health. fileciteturn16file0L45-L57

---

# Common Interview Traps

```text
❌ Load Balancer is only for scaling

✅ Scalability + resilience +
   failure isolation + traffic management
```

```text
❌ /health = 200 means healthy

✅ Health ≠ performance
```

```text
❌ Always use Round Robin

✅ Choose algorithm based on workload
```

```text
❌ Sticky sessions are always the solution

✅ Prefer externalized state when possible
```

```text
❌ One powerful LB is enough

✅ LB layer itself must be HA/scalable
```

```text
❌ DNS Round Robin replaces LB

✅ DNS discovery/routing and dynamic
   LB traffic management solve different problems
```

These are also explicitly highlighted as senior-level mistakes in the addendum. fileciteturn16file0L32-L42 fileciteturn16file0L70-L81

---

# Senior Interview Decision Framework

When adding a Load Balancer, answer:

```text
1. WHY?
   → scalability + resilience

2. WHERE?
   → global / regional / service

3. L4 OR L7?
   → throughput vs HTTP-aware routing

4. WHICH ALGORITHM?
   → workload characteristics

5. HEALTH?
   → failure + degradation detection

6. STATE?
   → sticky vs external session store

7. FAILURE?
   → server / AZ / LB / region

8. SCALE?
   → prevent LB bottleneck

9. OPERATIONS?
   → monitoring + deployments
```

---

# 30-Second Interview Answer

> **A load balancer is a traffic-management layer that distributes requests across healthy backend instances, improving both horizontal scalability and resilience. I would choose L4 when I primarily need high-throughput transport-level routing and L7 when I need HTTP-aware routing such as paths or headers. The routing algorithm depends on the workload—for example Round Robin for similar requests, Least Connections for variable-duration requests, or weighted routing for unequal server capacity. In production I'd also consider health and latency, session state, WebSockets, TLS termination, load-balancer HA, and multi-region failover.**

---

# Final Mental Model

```text
LOAD BALANCER

WHY
├── Scalability
├── Resilience
├── Failover
└── Traffic Management

TYPE
├── L4 → TCP/IP
└── L7 → HTTP-aware

ROUTING
├── Round Robin
├── Weighted
├── Least Connections
├── Least Response Time
└── IP Hash

HEALTH
├── Health Checks
├── Latency
├── Errors
├── Connections
└── Queue Depth

STATE
├── Sticky Sessions
└── External Session Store

FAILURES
├── Server
├── AZ
├── LB
└── Region

GLOBAL
Geo DNS
→ Global LB
→ Regional LB
→ Service LB
→ Servers
```

> **One sentence to remember: A load balancer is not just a request distributor—it is a highly available traffic-management layer that scales capacity, detects unhealthy backends, isolates failures, and routes users to the right healthy infrastructure.**
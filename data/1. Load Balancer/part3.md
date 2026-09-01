# Load Balancer — Part 3
## Global Architecture, Scaling, Monitoring, and Senior-Level Design

---

# 1. Production Load Balancing Is Multi-Layered

Large systems rarely depend on one load balancer.

A typical architecture:

```text
Users
  ↓
Geo DNS
  ↓
Global Load Balancer
  ↓
┌───────────────────────────┐
│                           │
US Region               EU Region
   ↓                         ↓
Regional LB               Regional LB
   ↓                         ↓
API Servers              API Servers
```

At even larger scale:

```text
Users
  ↓
Geo DNS
  ↓
Global Load Balancer
  ↓
Regional Load Balancer
  ↓
Service Load Balancer
  ↓
Application Servers
```

Each layer solves a different routing problem. fileciteturn16file0L82-L108

---

# 2. Responsibility of Each Layer

```text
Geo DNS
→ choose appropriate/nearby region

Global LB
→ distribute/fail over traffic across regions

Regional LB
→ distribute traffic across regional backends

Service LB
→ route traffic to service instances
```

Mental model:

```text
Global routing
→ Which region?

Regional routing
→ Which backend/service?
```

This layering also prevents one load balancer from handling all traffic in a massive system. fileciteturn16file1L435-L447

---

# 3. Multi-Region Routing

Suppose traffic is:

```text
US   → 35%
EU   → 30%
Asia → 35%
```

A single US deployment would cause:

```text
higher latency for distant users
larger regional blast radius
limited disaster recovery
```

Instead:

```text
                 Users
                   ↓
                Geo DNS
          ┌────────┼────────┐
          ↓        ↓        ↓
         US       EU      Asia
          ↓        ↓        ↓
         LB       LB       LB
          ↓        ↓        ↓
       Servers  Servers  Servers
```

The source's global-load-balancing model uses Geo DNS to select a nearby region followed by a regional LB and application servers. fileciteturn16file1L418-L434

---

# 4. Region Failure

Suppose:

```text
US ✅
EU ❌
Asia ✅
```

A global routing layer can redirect traffic away from the failed region:

```text
EU traffic
   ↓
Global routing
   ↓
US / Asia
```

But this requires enough spare capacity elsewhere.

So regional failover planning must consider:

```text
remaining capacity
cross-region latency
data availability
regional dependencies
```

The attached senior design exercise explicitly expects discussion of server, availability-zone, and region failures. fileciteturn16file0L154-L180

---

# 5. Availability-Zone Failure

Within a region:

```text
Region
│
├── AZ-1
│   └── Servers
│
├── AZ-2
│   └── Servers
│
└── AZ-3
    └── Servers
```

If AZ-1 fails:

```text
AZ-1 ❌
AZ-2 ✅
AZ-3 ✅
```

traffic should continue through healthy capacity in the remaining zones.

The design goal is:

```text
Server failure
→ local failover

AZ failure
→ zone-level failover

Region failure
→ cross-region failover
```

---

# 6. Avoiding the Load Balancer as a Bottleneck

A design like:

```text
Millions of users
       ↓
    ONE LB
       ↓
thousands of servers
```

simply moves the bottleneck from the application tier to the LB.

Large systems therefore use:

```text
multiple LB instances
+
multiple routing layers
+
regional distribution
```

Example:

```text
Geo DNS
↓
Global LBs
↓
Regional LBs
↓
Service LBs
↓
Application Servers
```

The handbook explicitly uses this layered design for systems handling very high request rates. fileciteturn16file1L435-L447

---

# 7. Scaling the Backend Pool

Suppose:

```text
A → 80% CPU
B → 85% CPU
C → 90% CPU
```

The application tier needs more capacity:

```text
A B C
  +
D E F
```

The LB allows new instances to join the routing pool after they become healthy.

Conceptually:

```text
scale out
↓
start instances
↓
pass health checks
↓
add to LB pool
↓
traffic distributed
```

This is how the LB enables horizontal scalability.

---

# 8. Scaling Down Safely

Removing a server should not necessarily mean immediately killing it.

Better flow:

```text
remove/drain from LB
↓
stop new requests
↓
allow in-flight work to finish
↓
terminate instance
```

This is especially important for:

```text
long-running requests
persistent connections
WebSockets
```

Conceptually:

```text
Drain
→ stop NEW traffic
→ finish EXISTING work
```

---

# 9. Choosing L4, L7, or Both

The senior design exercise explicitly asks:

```text
L4?
L7?
Both?
Why?
```

fileciteturn16file0L154-L168

### L4

Choose when:

```text
very high throughput
very low latency
TCP/UDP routing
HTTP awareness unnecessary
```

### L7

Choose when:

```text
path routing
header routing
authentication integration
service-specific routing
HTTP-aware policies
```

### Both

Large architectures may use:

```text
L4
→ high-performance connection distribution

L7
→ application-aware service routing
```

The correct interview answer depends on the workload rather than declaring one universally superior.

---

# 10. Choosing a Routing Strategy

The senior design exercise also expects justification between:

```text
Round Robin
Least Connections
Least Response Time
Weighted Routing
```

fileciteturn16file0L169-L180

Quick decision tree:

```text
Servers roughly equal?
    ↓ yes
Round Robin

Different capacities?
    ↓
Weighted Routing

Request durations vary?
    ↓
Least Connections

Some servers degrade/slow down?
    ↓
Least Response Time
or performance-aware routing
```

Senior-level answer:

> **Choose the algorithm based on workload characteristics, not by defaulting to Round Robin.**

---

# 11. Monitoring the Load Balancer

A production LB should expose enough information to answer:

```text
Is traffic balanced?

Are servers healthy?

Is one server overloaded?

Is the LB itself saturated?

Are users experiencing latency/errors?
```

Useful signals include the metrics emphasized by the attached chapter:

```text
response latency
error rate
active connections
queue depth
resource utilization
backend health
```

fileciteturn16file0L45-L57

---

# 12. Detecting Uneven Traffic

Suppose:

```text
A → 10K req/sec
B → 11K req/sec
C → 50K req/sec
```

Ask:

```text
Why is C receiving more traffic?
```

Possible design areas to inspect:

```text
routing algorithm
weights
session affinity
connection lifetime
backend capacity
```

Sticky sessions in particular can create uneven traffic distribution, one of the explicit drawbacks in the handbook. fileciteturn16file1L314-L321

---

# 13. Detecting a Degraded Backend

Suppose:

```text
A:
health = 200
latency = 100 ms

B:
health = 200
latency = 120 ms

C:
health = 200
latency = 8 sec
```

Do not conclude:

```text
All servers healthy.
```

Instead:

```text
C is alive
but degraded
```

Investigate:

```text
latency
connections
queue depth
errors
resource utilization
```

and shift traffic appropriately. fileciteturn16file1L408-L417

---

# 14. Zero-Downtime Deployment

A load balancer enables rolling deployment:

```text
A B C
```

Deploy A:

```text
remove A
→ B/C serve traffic
→ deploy A
→ health check
→ add A back
```

Then repeat for B and C.

This avoids:

```text
stop entire application
→ deploy
→ restart
```

and is one reason load balancing is also an **operational capability**, not just a traffic-distribution mechanism. fileciteturn16file0L5-L12

---

# 15. Failure Hierarchy

A senior design should reason about failures at multiple levels:

```text
Server
↓
Availability Zone
↓
Load Balancer
↓
Region
```

### Server failure

```text
health check
→ remove server
→ redirect traffic
```

### AZ failure

```text
shift traffic to healthy zones
```

### LB failure

```text
active-active / active-passive
```

### Region failure

```text
global routing
→ healthy region
```

The goal is to reduce the **blast radius** of each failure.

---

# 16. Load Balancer Doesn't Fix Everything

A load balancer can distribute traffic, but it cannot create backend capacity.

Suppose:

```text
A overloaded
B overloaded
C overloaded
```

Moving requests around does not solve:

```text
total demand > total capacity
```

You may need:

```text
horizontal scaling
caching
rate limiting
backpressure
capacity planning
```

Similarly:

```text
database down
```

cannot be fixed merely by adding more application servers behind the LB.

Senior interviews expect reasoning about the actual bottleneck rather than automatically adding load balancers.

---

# 17. Common Interview Mistakes

### Mistake 1

```text
"Load balancers are only for scaling."
```

Better:

```text
scalability
+
availability
+
failure isolation
+
traffic management
+
deployment support
```

fileciteturn16file0L32-L42

---

### Mistake 2

```text
"/health returned 200,
therefore server is healthy."
```

Better:

```text
health
+
latency
+
errors
+
connections
+
queue depth
+
resource utilization
```

fileciteturn16file0L43-L57

---

### Mistake 3

```text
"Use sticky sessions."
```

without discussing the trade-off.

Better:

```text
Sticky sessions
→ simple affinity

BUT
→ uneven load
→ poor elasticity
→ harder failover
```

Prefer externalized state where appropriate. fileciteturn16file0L70-L81

---

### Mistake 4

```text
"Round Robin."
```

without considering workload.

Better:

```text
similar workloads → Round Robin
variable duration → Least Connections
different capacity → Weighted
degraded servers → latency-aware routing
```

---

### Mistake 5

```text
"Use a load balancer."
```

without asking:

```text
What if the LB fails?
```

The load-balancing layer itself must be highly available.

---

# 18. Senior Interview Framework

When introducing a load balancer in a design, explain:

```text
1. WHY
   scalability + resilience

2. WHERE
   global / regional / service layer

3. TYPE
   L4 / L7 / both

4. ROUTING
   RR / weighted / least connections / latency

5. HEALTH
   failure + degradation detection

6. STATE
   sticky vs externalized sessions

7. FAILURE
   server / AZ / LB / region

8. SCALE
   avoid LB becoming bottleneck

9. OPERATIONS
   deployments + monitoring
```

This moves the answer from:

```text
"We need a load balancer."
```

to:

> **"We need a highly available traffic-management layer with routing and health policies chosen for the workload and failure model."**

That distinction—understanding the design decision rather than merely knowing the component—is the central senior-engineer framing in the addendum. fileciteturn16file0L137-L145

---

# 19. 30–45 Second Interview Answer

> **A load balancer sits between clients and backend instances and distributes traffic across healthy servers. It improves both horizontal scalability and resilience by removing dependency on a single application instance and automatically failing traffic away from unhealthy backends. Depending on the workload, I'd choose L4 for high-throughput transport-level routing or L7 when I need HTTP-aware routing. The routing strategy could be Round Robin, weighted, Least Connections, or latency-aware based on workload characteristics. At scale, I'd make the load-balancing layer itself highly available and use multiple layers—global, regional, and service-level—with health monitoring and failover across servers, zones, and regions.**

---

# Part 3 Interview Takeaways

Architecture:

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

Failure hierarchy:

```text
Server failure
→ backend failover

AZ failure
→ zone failover

LB failure
→ active-active/passive

Region failure
→ global failover
```

Scaling:

```text
More application capacity
→ add healthy backends

Massive traffic
→ distribute LB layer itself
```

Monitoring:

```text
latency
errors
connections
queue depth
resource utilization
backend health
```

Senior mindset:

```text
Don't just say:
"Use a Load Balancer."

Explain:
WHY
+
WHERE
+
L4/L7
+
ROUTING
+
HEALTH
+
STATE
+
FAILURES
+
SCALE
```

**Core principle:**

> At senior level, load balancing is not simply distributing requests—it is designing a highly available traffic-management layer that controls routing, isolates failures, supports scaling and deployments, and limits the blast radius of infrastructure failures.
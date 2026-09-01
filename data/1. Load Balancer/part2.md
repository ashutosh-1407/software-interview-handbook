# Load Balancer — Part 2
## Health Checks, Slow Servers, Sessions, WebSockets, TLS, and Failure Handling

---

# 1. Health Checks

A load balancer should route traffic only to healthy backends.

It periodically checks servers:

```text
LB
├── Server A ✅
├── Server B ✅
└── Server C ❌
```

A simple health check might be:

```text
GET /health

200 OK
→ keep server in pool

timeout / failure
→ remove server from pool
```

Once C is removed:

```text
new requests
→ A / B
```

This provides automatic failover. fileciteturn16file1L138-L163

---

# 2. Health ≠ Performance

A common mistake is:

```text
/health → 200 OK
→ server must be healthy
```

Consider:

```text
Server C:

/health       → 200 OK
response time → 8 seconds
```

Technically alive:

```text
yes
```

Operationally healthy:

```text
probably not
```

Production systems should also consider:

```text
latency
error rate
active connections
queue depth
resource utilization
```

So:

> **Liveness alone does not tell us whether a server can handle production traffic effectively.**

fileciteturn16file0L43-L57

---

# 3. Handling a Slow Server

Suppose:

```text
A → 100 ms
B → 120 ms
C → 8 sec
```

C still returns `200 OK`, so a simple health check may leave it in rotation.

Possible responses include:

```text
Least Connections
Least Response Time
latency-aware health signals
queue-depth monitoring
```

With Least Connections, slow requests remain active longer:

```text
C
→ requests accumulate
→ active connections increase
→ fewer new requests routed to C
```

Least Response Time can more directly shift traffic away from a high-latency server.

The goal is not necessarily to immediately declare C dead.

It is to:

```text
reduce traffic to degraded backend
→ prevent overload
→ protect user latency
```

The handbook explicitly recommends considering response time, active connections, queue depth, and error rate for this scenario. fileciteturn16file1L408-L417

---

# 4. Failover

Suppose:

```text
A ✅
B ❌
C ✅
```

The LB detects B's failure and stops sending new traffic there:

```text
             ┌→ A
Users → LB ──┤
             └→ C
```

When B recovers and passes the required health checks, it can be returned to the routing pool.

This is why a load balancer is a **resilience component**, not merely a scaling component. fileciteturn16file1L146-L163

---

# 5. Load Balancer + Deployments

Suppose we want to deploy a new application version.

Instead of:

```text
stop all servers
→ deploy
→ restart
→ downtime
```

we can remove instances from rotation gradually:

```text
A B C
```

Take A out:

```text
LB → B C

deploy A
health check A
return A
```

Then repeat for B and C.

Conceptually:

```text
remove from traffic
→ deploy
→ verify health
→ return to pool
```

This enables rolling / zero-downtime deployments, one of the operational benefits highlighted by the source. fileciteturn16file0L35-L42

---

# 6. Sticky Sessions

Suppose session state lives inside application memory.

First request:

```text
User
 ↓
Server A

session created on A
```

Next request:

```text
User
 ↓
Server B

B doesn't have session
→ user appears logged out
```

Sticky sessions solve this by repeatedly routing the user to the same backend:

```text
User X
→ Server A
→ Server A
→ Server A
```

This is also called:

```text
session affinity
```

fileciteturn16file1L301-L321

---

# 7. Sticky Session Trade-offs

Sticky sessions are convenient, but introduce coupling:

```text
User X
→ Server A
```

Now Server A becomes special for that user.

Problems:

```text
uneven traffic distribution
poor elasticity
harder failover
```

If A crashes:

```text
User X's local session state
→ potentially lost
```

So sticky sessions solve a state-management problem but reduce scalability and flexibility. fileciteturn16file0L70-L81

---

# 8. Prefer Externalizing Session State

A more scalable design:

```text
             ┌→ Server A ─┐
User → LB ───┼→ Server B ─┼→ Redis / Session Store
             └→ Server C ─┘
```

Now session state does not belong to one application server.

Any server can handle the next request:

```text
Request 1 → A
Request 2 → C
Request 3 → B
```

All can access the shared session state.

Therefore:

```text
Prefer stateless application servers
+
external session storage
```

when practical. fileciteturn16file1L314-L322

---

# 9. WebSockets

WebSockets create **long-lived connections**.

Unlike normal HTTP:

```text
request
→ response
→ connection/request finishes
```

a WebSocket may remain connected:

```text
Client
↔
Server A
```

for minutes or hours.

The load balancer therefore needs to support long-lived connections and keep the established connection associated with its backend. The handbook describes this as requiring connection affinity/stickiness or equivalent behavior. fileciteturn16file1L403-L407

---

# 10. WebSocket Failure

Suppose:

```text
Client
↔
LB
↔
Server A
```

A crashes.

The existing WebSocket connection is broken.

The LB cannot magically move the already-established connection to B.

Typically:

```text
connection breaks
→ client reconnects
→ LB selects healthy backend
→ new connection established
```

This is an important distinction:

```text
Load balancer
→ routes connections

It does not make an existing
broken connection survive a backend crash.
```

---

# 11. WebSockets and Least Connections

Because WebSockets are long-lived:

```text
Round Robin
```

may not accurately represent backend load over time.

Example:

```text
A → 10,000 active WebSockets
B → 2,000
C → 1,500
```

A connection-aware routing strategy can account for active connection counts.

This follows naturally from the handbook's use of Least Connections when request/connection durations vary. fileciteturn16file1L266-L275

---

# 12. TLS Termination

HTTPS requires encryption/decryption.

Option 1:

```text
HTTPS
  ↓
API Server
```

Every backend handles TLS.

Option 2:

```text
HTTPS
  ↓
Load Balancer
  ↓
HTTP / Internal TLS
  ↓
API Servers
```

The LB performs **TLS termination**.

Benefits:

```text
centralized certificate management
less TLS work on backend servers
```

Trade-off:

```text
traffic after termination must still
be appropriately protected
```

The handbook specifically notes backend CPU reduction and easier certificate management, with internal-network security as the trade-off. fileciteturn16file1L329-L349

---

# 13. What If the Load Balancer Fails?

A single load balancer creates another SPOF:

```text
Users
  ↓
LB ❌
  ↓
A B C
```

The application servers may all be healthy, but users cannot reach them.

So production systems make the **load-balancing layer itself highly available**. fileciteturn16file1L354-L369

---

# 14. Active-Passive Load Balancers

```text
Users
  ↓
LB1 Active
  ↓
Servers

LB2 Standby
```

If LB1 fails:

```text
LB1 ❌
 ↓
LB2 takes over
```

Advantage:

```text
simple failover model
```

Trade-off:

```text
standby capacity normally isn't
actively serving traffic
```

The source presents active-passive as one approach to removing the LB SPOF. fileciteturn16file1L354-L363

---

# 15. Active-Active Load Balancers

Multiple LBs serve traffic simultaneously:

```text
           ┌→ LB1 ─┐
Users ─────┤       ├→ API Servers
           └→ LB2 ─┘
```

Both are active.

Benefits:

```text
higher availability
traffic distribution across LBs
better utilization
```

If one fails:

```text
remaining LB
→ continues serving traffic
```

fileciteturn16file1L363-L369

---

# 16. Failure Isolation

A useful senior-level way to think about the LB is:

```text
Backend failure
       ↓
detect
       ↓
remove from routing
       ↓
redirect traffic
       ↓
contain failure
```

Without this:

```text
one bad server
→ users continue reaching it
→ visible failures
```

With it:

```text
one bad server
→ isolated
→ healthy capacity continues serving
```

This is why the senior addendum describes the LB as providing not just scaling, but also **failure isolation and high availability**. fileciteturn16file0L32-L42

---

# 17. Critical vs Optional Capabilities

### Critical

For most production systems:

```text
traffic distribution
health checks
failover
LB high availability
```

### Workload-dependent

```text
sticky sessions
TLS termination
L7 routing
weighted routing
WebSocket support
```

The right feature set depends on the workload.

---

# 18. Failure Scenarios to Discuss in Interviews

### Backend crashes

```text
health check fails
→ remove backend
→ redirect traffic
```

### Backend becomes slow

```text
latency / connections / queue depth increase
→ reduce traffic
```

### LB crashes

```text
active-passive failover
OR
active-active capacity
```

### Stateful backend crashes

```text
sticky-session user loses affinity/state
→ reason to externalize state
```

### WebSocket backend crashes

```text
existing connection breaks
→ client reconnects
→ healthy backend selected
```

---

# Part 2 Interview Takeaways

```text
Health
≠
Performance
```

```text
/health = 200
but latency = 8 sec

→ server can still be degraded
```

Watch:

```text
latency
error rate
active connections
queue depth
resource utilization
```

Slow server:

```text
Least Connections
and/or
Least Response Time
→ shift traffic away
```

Sessions:

```text
Sticky sessions
→ simple affinity
→ weaker elasticity/failover

Better when possible:
stateless app servers
+
external session store
```

WebSockets:

```text
long-lived connection
→ connection stays with backend

backend failure
→ connection breaks
→ reconnect
```

TLS:

```text
Client HTTPS
→ LB terminates TLS
→ backend traffic
```

LB availability:

```text
Single LB
→ SPOF

Active-Passive
or
Active-Active
→ HA
```

Deployments:

```text
remove instance
→ deploy
→ health check
→ return to pool
```

**Core principle:**

> A production load balancer must distinguish healthy from degraded backends, isolate failures, manage connection/state requirements, and itself be highly available so that one infrastructure failure does not take down otherwise healthy application capacity.
# Chapter 2: Caching

# Part 3 – Production Problems & Advanced Caching

---

# 2.35 Cache Stampede

## What is Cache Stampede?

A Cache Stampede occurs when a popular cache entry expires and many concurrent requests attempt to fetch the same data from the database simultaneously.

Example:

```text
                Redis

      product:iPhone17

         TTL Expires
              │
              ▼

      10,000 Concurrent Requests

              │
              ▼

           Cache MISS

              │
              ▼

        10,000 Database Queries
```

Instead of executing one database query, thousands of identical queries are executed.

---

## Why Is This Dangerous?

The database performs identical work repeatedly.

Resources wasted include:

- CPU
- Database connections
- Memory
- Network bandwidth

Instead of one query, thousands of identical queries execute simultaneously.

---

## Solution 1 – Request Coalescing

Allow only one request to query the database.

```text
10,000 Requests

↓

One Request

↓

Database

↓

Update Redis

↓

Remaining Requests Read Cache
```

Advantages:

- Only one database query
- Excellent database protection

Disadvantages:

- Waiting requests experience slightly higher latency

---

## Solution 2 – Distributed Lock

In a distributed application, a normal mutex only protects a single application process.

Instead, applications acquire a distributed lock before querying the database.

```text
Application

↓

Acquire Distributed Lock

↓

Database

↓

Update Redis

↓

Release Lock
```

Other requests wait until the lock is released.

---

## Solution 3 – Stale-While-Revalidate (SWR)

Instead of blocking requests, serve slightly stale data while refreshing the cache in the background.

```text
Request

↓

Serve Existing Cache

↓

Background Refresh

↓

Update Cache
```

Suitable for:

- Product catalog
- Restaurant listings
- News articles

Not suitable for:

- Banking
- Payments
- Financial balances

---

## Solution 4 – Cache Warming

Populate popular cache entries before users request them.

Example:

Before an Apple product launch:

- Product details
- Images
- Pricing
- Availability

are loaded into Redis before traffic begins.

---

## Production Debugging Checklist

Before proposing a solution, investigate:

- Is only one key affected?
- Did the key recently expire?
- Was the key manually invalidated?
- Is Redis healthy?
- Is the database unusually slow?
- Has traffic recently increased?
- Is this a popular object?

Always identify the root cause before selecting a mitigation.

---

# 2.36 Cache Penetration

## What is Cache Penetration?

Cache Penetration occurs when requests repeatedly query data that does not exist.

Example:

```text
GET /product/999999999
```

Redis:

```text
MISS
```

Database:

```text
Product Not Found
```

Every future request repeats exactly the same process.

---

## Why Is This Dangerous?

Suppose a malicious client continuously requests invalid IDs.

Redis cannot help because the key never exists.

The database receives every request.

---

## Solution 1 – Input Validation

Reject malformed requests before they reach Redis.

Example:

```http
GET /product?id=abcxyz
```

Immediately return:

```http
400 Bad Request
```

Redis is never contacted.

---

## Solution 2 – Null Caching

Store the fact that the object does not exist.

```text
Redis

product:999999999

↓

NULL
```

Future requests return immediately without querying the database.

Null entries should use a short TTL.

---

## Solution 3 – Bloom Filter

A Bloom Filter quickly determines whether a key could possibly exist.

If the answer is:

```text
Definitely No
```

Return immediately.

If the answer is:

```text
Maybe
```

Continue with Redis.

Bloom Filters eliminate many unnecessary database queries.

---

# 2.37 Cache Avalanche

## What is Cache Avalanche?

Suppose one million cache entries all expire simultaneously.

```text
1 Million Keys

↓

Same TTL

↓

Expire Together

↓

Millions of Cache Misses

↓

Database Overload
```

Unlike Cache Stampede:

- Stampede affects one hot key.
- Avalanche affects many keys.

---

## Solution 1 – Random TTL

Instead of:

```text
Every Key

↓

1 Hour
```

Use:

```text
58 min

61 min

63 min

57 min
```

Expiration is spread across time.

Random TTL reduces the size of traffic spikes.

---

## Solution 2 – Cache Warming

Reload frequently accessed objects before users request them.

---

## Solution 3 – Multi-Level Cache

Even if Redis misses,

the application may still serve the request from its own memory.

---

# Stampede vs Penetration vs Avalanche

| Problem | Cause | Primary Solutions |
|---------|-------|-------------------|
| Stampede | One hot key expires | Request Coalescing, Distributed Lock, SWR |
| Penetration | Non-existent data | Input Validation, Null Cache, Bloom Filter |
| Avalanche | Many keys expire | Random TTL, Cache Warming, Multi-Level Cache |

---

# 2.38 Hot Keys

## What is a Hot Key?

A Hot Key is a cache entry receiving significantly more traffic than every other key.

Example:

| Key | Requests/sec |
|-----|-------------:|
| product:iPhone17 | 2,000,000 |
| product:MacBook | 15,000 |
| Others | <1000 |

Even with perfect Consistent Hashing,

one Redis node becomes overloaded.

---

## Why Consistent Hashing Cannot Solve It

Consistent Hashing distributes keys evenly.

It does **not** distribute traffic evenly.

Popularity cannot be predicted by a hashing algorithm.

---

## Solution 1 – Replicate Hot Keys

Instead of storing:

```text
product:iPhone17
```

Store multiple replicas.

```text
product:iPhone17:1

↓

Redis1
```

```text
product:iPhone17:2

↓

Redis2
```

```text
product:iPhone17:3

↓

Redis3
```

The application distributes read requests across replicas.

Possible routing strategies include:

- Load Balancer
- Deterministic Hashing
- Round Robin
- Geographic Routing

The appropriate strategy depends on workload and consistency requirements.

---

## Trade-Off

Read performance improves significantly.

However,

every update must update every replica.

Read scalability increases.

Write complexity also increases.

---

## Solution 2 – Local Application Cache

Each application server maintains a small in-memory cache.

```text
Application

↓

Local Cache

↓

Redis

↓

Database
```

Repeated requests handled by the same application server never reach Redis.

---

## Solution 3 – CDN

Static resources such as:

- Images
- CSS
- JavaScript
- Videos

should be served directly from a CDN.

These requests never reach Redis.

---

## Layered Defense

Large-scale systems combine multiple layers.

```text
Browser Cache

↓

CDN

↓

Application Cache

↓

Replicated Redis Keys

↓

Database
```

Each layer absorbs part of the traffic before it reaches the next.

---

# 2.39 Multi-Level Cache

## Why Do We Need Another Cache?

Redis is extremely fast.

However,

every Redis request still requires:

- Network communication
- Serialization
- TCP overhead

For extremely hot objects,

even Redis becomes unnecessary.

---

## Architecture

```text
Client

↓

Application

↓

Application Memory

↓

Redis

↓

Database
```

The application first checks its own memory.

If the object exists,

Redis is never contacted.

---

## Advantages

- Lowest latency
- Reduces Redis traffic
- Improves scalability
- Excellent for read-heavy workloads

---

## Disadvantages

Every application server now owns its own cache.

Keeping hundreds of application servers synchronized becomes difficult.

---

## Keeping Local Cache Consistent

Common approaches include:

### Time-To-Live (TTL)

Each local cache entry expires after a short duration.

Simple but allows temporary stale data.

---

### Event-Driven Invalidation

When data changes:

```text
Update Database

↓

Update Redis

↓

Publish Event

↓

Invalidate Local Cache

↓

Next Request Reloads Cache
```

Often implemented using:

- Redis Pub/Sub
- Kafka
- RabbitMQ

---

## Suitable Data

Good candidates:

- Product catalog
- Configuration
- Feature flags
- Product metadata

Poor candidates:

- Bank balances
- Frequently changing inventory
- Real-time counters

---

# Key Takeaways

- Cache Stampede affects one hot key.
- Cache Avalanche affects many keys.
- Cache Penetration affects non-existent keys.
- Hot Keys overload individual Redis nodes despite balanced key distribution.
- Multi-Level Cache reduces Redis traffic but increases invalidation complexity.
- Every additional cache layer improves performance while increasing consistency challenges.

---

# Business Perspective

Before selecting any production mitigation, ask:

- What is the actual bottleneck?
- Is the workload read-heavy or write-heavy?
- Can stale data be tolerated?
- Is the problem caused by one key or many keys?
- Is the issue caused by traffic, memory, CPU, or poor cache strategy?

Technology should always follow business requirements and production observations.

---

**End of Part 3**
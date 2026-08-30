# Chapter 2: Caching

> **Goal**
>
> Learn how caching improves system performance, how different caching strategies work, common production problems, and how to design resilient cache architectures for large-scale distributed systems.

---

# 2.1 Why Do We Need Cache?

Imagine an e-commerce application where users frequently request product details.

Without a cache, every request follows the same path.

```text
                Client
                   │
                   ▼
          Application Server
                   │
                   ▼
               Database
```

Although databases are reliable and durable, they are also the slowest component in the request path.

Typical latency:

| Component | Approximate Latency |
|-----------|--------------------:|
| Application Memory | Nanoseconds |
| Redis | 1–5 ms |
| Database | 10–100+ ms |

Now imagine:

- 1 million users
- 90% request the same product
- Product information rarely changes

Without a cache, the database executes the same query repeatedly.

The database becomes the bottleneck.

---

# 2.2 What is a Cache?

A cache is a fast temporary storage layer placed between the application and the database.

```text
                Client
                   │
                   ▼
          Application Server
                   │
                   ▼
                 Redis
              (Cache Layer)
                   │
           Cache Miss Only
                   ▼
                Database
```

The first request retrieves data from the database and stores it in Redis.

Subsequent requests are served directly from the cache.

---

# 2.3 Benefits of Caching

## Lower Latency

Memory is significantly faster than disk.

Users receive responses much more quickly.

---

## Higher Throughput

Instead of handling every request, the database serves only cache misses.

The cache absorbs the majority of the traffic.

---

## Better Scalability

Applications can support significantly more concurrent users without continuously scaling the database.

---

## Reduced Database Load

The database performs fewer identical queries.

This leaves more resources available for write operations and complex analytical queries.

---

# 2.4 What Should We Cache?

Good candidates include:

- Product metadata
- Product catalog
- User profiles
- Configuration
- Feature flags
- Frequently viewed reports

Poor candidates include:

- Bank balances
- Frequently changing inventory counts
- Live stock prices
- Rapidly changing counters

---

# 2.5 Characteristics of Good Cache Data

Generally, cached data should be:

- Frequently accessed
- Expensive to compute
- Expensive to retrieve
- Small enough to fit comfortably in memory
- Relatively stable

---

# 2.6 Cache Lifecycle

Every cached object follows the same lifecycle.

```text
Request

↓

Cache Lookup

↓

Hit?
      │
      ├── Yes
      │      │
      │      ▼
      │  Return Response
      │
      └── No
             │
             ▼
       Query Database
             │
             ▼
       Store in Cache
             │
             ▼
       Return Response
```

---

# 2.7 Cache Hit

A cache hit occurs when the requested data already exists in Redis.

```text
Client

↓

Application

↓

Redis

↓

Data Found

↓

Return Response
```

Advantages:

- Lowest latency
- No database access
- Higher throughput
- Better scalability

---

# 2.8 Cache Miss

A cache miss occurs when the requested data does not exist in Redis.

```text
Client

↓

Application

↓

Redis

↓

MISS

↓

Database

↓

Store in Redis

↓

Return Response
```

The first request is slower.

Future requests become significantly faster.

---

# 2.9 Cache Hit Ratio

One of the most important production metrics.

Formula:

```text
Cache Hits
------------------------
Hits + Misses
```

Example:

```text
Hits = 950

Misses = 50
```

Hit Ratio:

```text
950 / (950 + 50)

=

95%
```

Higher hit ratios generally indicate a healthier cache.

---

# 2.10 Cache Invalidation

Caching introduces a new challenge.

Suppose Redis contains:

```text
Price = $999
```

The database updates the price:

```text
Price = $1099
```

Redis still returns:

```text
$999
```

Users now receive stale data.

This process of ensuring cached data reflects the latest source of truth is called **Cache Invalidation**.

---

## Time-To-Live (TTL)

Every cache entry expires after a configured duration.

Example:

```text
TTL = 5 minutes
```

Advantages:

- Automatic
- Simple
- Easy to implement

Disadvantages:

- Users may temporarily receive stale data.

---

## Explicit Invalidation

Whenever data changes:

```text
Database Updated

↓

Delete Redis Key

↓

Next Read Repopulates Cache
```

Advantages:

- Better consistency
- Fresh data after update

Disadvantages:

- Additional implementation complexity

---

# 2.11 Cache Eviction

Redis has limited memory.

Eventually memory becomes full.

To insert new data, Redis must remove existing data.

This process is called **Cache Eviction**.

---

## Least Recently Used (LRU)

Evicts the object that has not been accessed for the longest time.

Example:

```text
Current Cache

A
B
C
D

Access A

Insert E

↓

Evict B
```

Useful when recently accessed objects are likely to be accessed again.

---

## Least Frequently Used (LFU)

Evicts the object accessed the fewest number of times.

Example:

| Key | Access Count |
|------|-------------:|
| A | 100 |
| B | 80 |
| C | 2 |

Insert D

↓

Evict C

Useful when popular objects remain popular for long periods.

---

# 2.12 Cache Pollution

Not every cached object deserves memory.

Examples:

- One-time analytics queries
- Temporary reports
- Data written but never read

These objects occupy valuable cache space while evicting frequently used data.

This phenomenon is called **Cache Pollution**.

Choosing an appropriate caching strategy helps reduce cache pollution.

---

# 2.13 Choosing a Cache Strategy

The correct strategy depends on:

- Read-to-write ratio
- Data freshness requirements
- Latency requirements
- Consistency requirements
- Business requirements

There is no universally correct strategy.

---

# 2.14 Cache-Aside (Lazy Loading)

The application controls the cache.

## Read Flow

```text
Application

↓

Redis

↓

MISS

↓

Database

↓

Redis

↓

Return Response
```

## Write Flow

```text
Update Database

↓

Delete Redis Key
```

The next read repopulates the cache.

### Advantages

- Simple
- Memory efficient
- Avoids cache pollution
- Excellent for read-heavy systems

### Disadvantages

- First read after invalidation is slower
- Can suffer from Cache Stampede under high concurrency

### Typical Use Cases

- Product catalog
- User profiles
- Restaurant listings
- News articles

---

# 2.15 Write-Through Cache

Every write updates both the database and the cache.

```text
Application

↓

Database

↓

Redis
```

### Advantages

- Strong consistency
- Fast reads after updates

### Disadvantages

- Every write performs two operations
- Increased write latency
- Can introduce cache pollution

### Typical Use Cases

- Banking
- Financial systems
- Critical configuration

---

# 2.16 Write-Back Cache

Writes are stored in the cache first.

The database is updated asynchronously.

```text
Application

↓

Redis

↓

Return Success

↓

Background Worker

↓

Database
```

### Advantages

- Extremely fast writes
- Reduced database load
- High throughput

### Disadvantages

- Potential data loss if cache fails before flushing
- Operational complexity

### Typical Use Cases

- View counters
- Analytics
- Logging
- Metrics
- Telemetry

---

# 2.17 Write-Around Cache

Writes bypass the cache.

```text
Application

↓

Database
```

The cache is populated only after the first read.

### Advantages

- Prevents cache pollution
- Lower cache memory usage
- Efficient for write-heavy systems

### Disadvantages

- First read after every write is slower

### Typical Use Cases

- Warehouse scans
- Inventory updates
- Internal reports
- Audit logs

---

# 2.18 Choosing the Right Strategy

| Requirement | Recommended Strategy |
|-------------|----------------------|
| Read-heavy workload | Cache-Aside |
| Strong consistency | Write-Through |
| Extremely high write throughput | Write-Back |
| Write-heavy, infrequent reads | Write-Around |

---

# Business Perspective

Never choose a caching strategy first.

Always begin by asking:

- What is the read-to-write ratio?
- Is the system read-heavy or write-heavy?
- How fresh must the data be?
- Can stale data be tolerated?
- Is latency or correctness more important?
- What is the business impact of stale data?

The business requirements determine the correct strategy—not the technology.

---

**End of Part 1**
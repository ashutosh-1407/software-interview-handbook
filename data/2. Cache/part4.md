# Chapter 2: Caching

# Part 4 – Monitoring, Operations & Interview Guide

---

# 2.40 Monitoring & Observability

A cache is only useful if it is healthy.

In production, nobody tells you:

> "Your cache has a stampede."

Instead, they report:

> "The application is slow."

It is the engineer's responsibility to identify the root cause using metrics.

---

# 2.41 Cache Hit Ratio

The most important cache metric.

Formula:

```text
Hits
--------------------
Hits + Misses
```

Example:

```text
Hits = 950

Misses = 50

Hit Ratio = 95%
```

A sudden drop often indicates a cache-related issue.

Possible causes include:

- Cache invalidation bug
- Cache eviction
- Cache restart
- Cache avalanche
- Incorrect caching strategy
- Recent deployment

---

# 2.42 Redis Latency

Redis should respond within a few milliseconds.

Suppose average latency changes from:

```text
2 ms

↓

45 ms
```

Possible causes:

- CPU saturation
- Large objects
- Network congestion
- Cross-region traffic
- Expensive Redis commands

Always investigate latency together with CPU and traffic.

---

# 2.43 Memory Usage

Monitor:

- Total memory
- Used memory
- Memory growth
- Available memory

Example:

```text
Memory

63.8 GB / 64 GB
```

This indicates the cache is approaching capacity.

Eventually Redis will begin evicting data.

---

# 2.44 Evictions

Redis evicts cache entries when memory becomes full.

Example:

```text
Evictions / minute

0

↓

5,000
```

Possible causes:

- Memory pressure
- Cache pollution
- Incorrect eviction policy
- Unexpected workload

Heavy evictions often reduce cache hit ratio.

---

# 2.45 CPU Utilization

High CPU indicates Redis is struggling to process requests.

Possible causes include:

- Hot keys
- Large objects
- Heavy traffic
- Expensive Redis commands

CPU alone is not enough.

Always correlate it with:

- Hit ratio
- Memory
- Latency
- Database traffic

---

# 2.46 Hot Key Detection

One of the most valuable production dashboards.

Example:

| Key | Requests/sec |
|------|-------------:|
| product:iPhone17 | 2,000,000 |
| warehouse:Shenzhen | 500,000 |
| product:MacBook | 25,000 |

Hot keys explain situations where:

- Memory looks healthy
- Cache hit ratio looks healthy
- One Redis node reaches 100% CPU

---

# 2.47 Database Query Rate

Sometimes the database tells the story before Redis does.

Example:

```text
Database Queries/sec

100

↓

15,000
```

Possible causes:

- Cache Stampede
- Cache Avalanche
- Cache disabled
- Cache invalidation bug
- Cold cache after restart

---

# 2.48 Production Debugging Checklist

When users report:

> "The application is slow."

Do not immediately propose a solution.

Instead, investigate systematically.

```text
1. Did traffic increase?

↓

2. Cache hit ratio healthy?

↓

3. Redis latency healthy?

↓

4. Redis CPU healthy?

↓

5. Memory pressure?

↓

6. Evictions increasing?

↓

7. Database traffic increasing?

↓

8. Hot key?

↓

9. Recent deployment?

↓

10. Recent configuration change?
```

The goal is to identify the bottleneck before selecting a solution.

---

# 2.49 Choosing the Correct Solution

Different bottlenecks require different solutions.

| Observation | Likely Bottleneck | Possible Solution |
|-------------|-------------------|-------------------|
| Memory almost full | Capacity | Increase cache capacity |
| CPU near 100% | Throughput | Scale horizontally |
| One Redis node overloaded | Hot Key | Replicate hot key |
| Low cache hit ratio | Cache strategy | Improve caching strategy |
| High latency for distant users | Geography | Regional Redis / CDN |

Always identify the bottleneck first.

---

# 2.50 Critical vs Optional Features

Understanding which features are essential helps prioritize system behavior during failures.

## Critical Features

Examples:

- Authentication
- Payments
- Inventory updates
- Banking transactions
- Order placement

These features prioritize correctness over latency.

---

## Optional Features

Examples:

- Product recommendations
- Recently viewed items
- Trending products
- Popular searches
- Personalized feeds

These features may be temporarily disabled during high load to keep critical functionality available.

---

# 2.51 If Cache Fails

Suppose Redis suddenly becomes unavailable.

The application may still function, but performance changes dramatically.

Consequences:

- Increased database traffic
- Higher latency
- Reduced throughput
- Possible database overload
- Increased infrastructure cost

Mitigation strategies:

- Read replicas
- Rate limiting
- Graceful degradation
- Circuit breakers
- Temporary feature reduction

Business requirements determine which features should remain available.

---

# 2.52 Business Impact

Caching is not only a technical optimization.

It directly affects business outcomes.

A healthy cache provides:

- Lower response time
- Better user experience
- Higher customer satisfaction
- Lower infrastructure cost
- Better scalability

Poor cache design can lead to:

- Website outages
- Slow checkout
- Lost sales
- Poor customer experience

Caching decisions should therefore be driven by business priorities rather than technology alone.

---

# 2.53 Common Interview Scenarios

## Scenario 1

Redis CPU reaches 100%.

Memory usage is normal.

Database usage is normal.

Possible causes:

- Hot key
- Large objects
- High request throughput
- Expensive Redis commands

---

## Scenario 2

Database traffic suddenly increases.

Redis CPU remains normal.

Possible causes:

- Cache Stampede
- Cache Avalanche
- Low cache hit ratio
- Cache invalidation bug

---

## Scenario 3

Cache hit ratio drops from:

```text
95%

↓

50%
```

Possible causes:

- Cache restart
- Frequent evictions
- Poor cache strategy
- Recent deployment
- Cache invalidation issue

---

# 2.54 Mental Model

When solving cache problems, avoid thinking:

> "Which cache technology should I use?"

Instead think:

```text
Business Requirement

↓

Traffic Pattern

↓

Consistency Requirement

↓

Identify Bottleneck

↓

Choose Architecture

↓

Choose Technology
```

Technology is the final step—not the first.

---

# Chapter Summary

Throughout this chapter we learned:

- Why caching is necessary
- Cache lifecycle
- Cache hit and miss
- Cache invalidation
- Cache eviction
- Cache pollution
- Cache-Aside
- Write-Through
- Write-Back
- Write-Around
- Distributed Cache
- Consistent Hashing
- Virtual Nodes
- Cache Stampede
- Cache Penetration
- Cache Avalanche
- Hot Keys
- Multi-Level Cache
- Monitoring
- Production debugging

---

# Key Takeaways

1. Caching improves performance by reducing database load.

2. Every caching strategy introduces different trade-offs.

3. Every additional cache layer increases performance while increasing invalidation complexity.

4. Consistency requirements determine the appropriate cache strategy.

5. Always identify the production bottleneck before selecting a solution.

6. Real production systems combine multiple techniques rather than relying on a single optimization.

7. Business requirements should always drive architectural decisions.

---

# Final Thoughts

Caching is one of the most impactful optimizations in distributed systems.

However, caching is not simply about making applications faster.

It is about balancing:

- Performance
- Consistency
- Cost
- Scalability
- Operational Complexity

The best cache architecture is not the one using the most sophisticated technology.

It is the one that satisfies the business requirements while remaining simple, reliable, and easy to operate.

---

**End of Chapter 2 – Caching**
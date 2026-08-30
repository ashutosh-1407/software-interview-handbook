# Cache Interview Cheat Sheet

> **Purpose**
>
> A quick revision guide to skim through before a System Design interview.

---

# 1. Why Cache?

## Benefits

- Reduce latency
- Reduce database load
- Increase throughput
- Improve scalability
- Improve user experience

---

# 2. Good Candidates for Caching

✅ Product Catalog

✅ User Profile

✅ Configuration

✅ Feature Flags

✅ Product Metadata

---

Avoid:

❌ Bank Balances

❌ Frequently Changing Inventory

❌ Real-time Counters

❌ Stock Prices

---

# 3. Cache Lifecycle

```text
Request

↓

Redis

↓

Hit?
    │
    ├── Yes → Return
    │
    └── No
           │
           ▼
      Database

           │
           ▼
      Store Cache

           │
           ▼
        Return
```

---

# 4. Cache Metrics

Most Important:

- Cache Hit Ratio
- Redis Latency
- CPU Usage
- Memory Usage
- Evictions
- Database Queries/sec
- Top Hot Keys

---

# 5. Cache Eviction

## LRU

Least Recently Used

Best when recently used objects are likely to be reused.

---

## LFU

Least Frequently Used

Best when popular objects remain popular.

---

# 6. Cache Strategies

## Cache Aside

Read:

Redis → Database → Cache

Write:

Database → Delete Cache

✅ Read-heavy

✅ Avoids Cache Pollution

---

## Write Through

Write:

Database + Cache

✅ Strong Consistency

❌ Slower Writes

---

## Write Back

Write:

Cache → Background → Database

✅ Extremely Fast Writes

❌ Possible Data Loss

---

## Write Around

Write:

Database Only

Read populates Cache

✅ Prevents Cache Pollution

❌ First Read is Slow

---

# 7. Cache Pollution

Occurs when:

- Data is written
- Never read
- Still occupies cache memory

Write-Around helps reduce cache pollution.

---

# 8. Distributed Cache

Used when:

- Memory Full
- CPU High
- Need Horizontal Scaling

---

# 9. Consistent Hashing

Purpose:

Reduce data movement when Redis nodes change.

Instead of:

```
hash(key) % N
```

Use:

Logical Hash Ring

Benefits:

- Minimal key movement
- Faster scaling
- Better availability

---

# 10. Virtual Nodes

Purpose:

Improve load balancing.

Instead of:

One position per Redis node

Use:

Multiple virtual positions.

Benefits:

- Better distribution
- Easier scaling
- Smaller migrations

---

# 11. Cache Stampede

One hot key expires.

Thousands of requests hit Database.

Solutions:

- Request Coalescing
- Distributed Lock
- Stale While Revalidate
- Cache Warming

---

# 12. Cache Penetration

Requesting data that doesn't exist.

Solutions:

- Input Validation
- Null Cache
- Bloom Filter

---

# 13. Cache Avalanche

Many keys expire simultaneously.

Solutions:

- Random TTL
- Cache Warming
- Multi-Level Cache

---

# 14. Hot Keys

One key receives massive traffic.

Consistent Hashing cannot solve this.

Solutions:

- Replicate Hot Keys
- Local Application Cache
- CDN

---

# 15. Multi-Level Cache

```text
Browser

↓

CDN

↓

Application Cache

↓

Redis

↓

Database
```

Benefits:

- Lowest latency
- Reduced Redis traffic

Trade-off:

Harder cache invalidation.

---

# 16. Cache Invalidation

Options:

- TTL
- Explicit Delete
- Pub/Sub
- Event Driven

Remember:

Every additional cache layer increases invalidation complexity.

---

# 17. Production Debugging Checklist

When application becomes slow:

- Traffic Increased?
- Cache Hit Ratio?
- Redis Latency?
- Redis CPU?
- Memory Usage?
- Evictions?
- Database Queries?
- Hot Key?
- Recent Deployment?
- Recent Config Change?

Never jump directly to a solution.

---

# 18. Production Bottlenecks

| Observation | Likely Cause | Solution |
|-------------|--------------|----------|
| Memory Full | Capacity | Increase Cache Capacity |
| CPU High | Throughput | Add Redis Nodes |
| One Node CPU High | Hot Key | Replicate Key |
| Hit Ratio Low | Cache Strategy | Improve Cache |
| High Latency | Geography | Regional Cache / CDN |

---

# 19. Business Questions to Ask

- Read-to-write ratio?
- Read-heavy or write-heavy?
- Can stale data be tolerated?
- Strong or eventual consistency?
- Latency or correctness?
- Current bottleneck?
- Business impact?

Always ask these before proposing an architecture.

---

# 20. Important Trade-offs

| Choice | Trade-off |
|----------|-----------|
| Cache Aside | First read slower |
| Write Through | Slower writes |
| Write Back | Risk of data loss |
| Write Around | First read slower |
| Local Cache | Harder invalidation |
| Hot Key Replication | More write complexity |
| More Cache Layers | More invalidation complexity |

---

# 21. Golden Rules

✔ Understand the business requirement first.

✔ Identify the bottleneck before selecting a solution.

✔ Every optimization introduces a trade-off.

✔ Technology is the last decision, not the first.

✔ Design for failures, not only for happy paths.

✔ Think in layers.

✔ There is no universally correct cache strategy.

---

# Common Apple Interview Questions

- Why do we need caching?
- Cache Aside vs Write Through?
- When would you use Write Back?
- Explain Cache Stampede.
- Explain Cache Avalanche.
- Explain Cache Penetration.
- Why Consistent Hashing?
- Why Virtual Nodes?
- Hot Key vs Hot Partition?
- How would you monitor Redis?
- What metrics would you track?
- How do you invalidate cache?
- How do you scale Redis?
- How would you debug a production cache issue?
- What questions would you ask before choosing a cache strategy?

---

# One Sentence Summary

> Cache improves performance by reducing database load, but every cache introduces trade-offs around consistency, invalidation, scalability, and operational complexity.
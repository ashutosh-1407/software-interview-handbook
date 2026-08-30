# Chapter 2: Caching

# Part 2 – Distributed Cache

---

# 2.19 Why Do We Need a Distributed Cache?

Suppose our application initially has a single Redis server.

```text
                Application
                     │
                     ▼
                  Redis
                     │
                     ▼
                  Database
```

Initially:

- 1 million users
- 20 GB cache
- Low latency

Everything works well.

---

As the application grows:

- More users
- More products
- More sessions
- More cached objects

Eventually Redis reaches:

```text
Memory = 64 GB / 64 GB
```

or

```text
CPU = 100%
```

A single Redis server is no longer sufficient.

We need to scale horizontally.

---

# 2.20 Distributed Cache

Instead of one Redis server:

```text
             Application
                  │
                  ▼
      ┌───────────┼───────────┐
      ▼           ▼           ▼
   Redis1      Redis2      Redis3
```

Each Redis server stores only a subset of the data.

Benefits:

- Larger total memory
- Higher throughput
- Better fault tolerance
- Horizontal scalability

---

# 2.21 How Do We Decide Where Data Goes?

Suppose we have three Redis servers.

```text
Redis1

Redis2

Redis3
```

When storing:

```text
product:123
```

How do we know which Redis server should store it?

We need a partitioning strategy.

---

# 2.22 Naive Partitioning

One simple approach is:

```text
hash(key) % number_of_servers
```

Example:

```text
hash(product123) % 3

=

Redis2
```

Simple.

Fast.

Works well...

until the number of servers changes.

---

# 2.23 The Problem with Naive Hashing

Suppose we initially have:

```text
3 Redis Servers
```

The mapping is:

```text
hash(key) % 3
```

Now traffic increases.

We add another Redis server.

```text
4 Redis Servers
```

The mapping becomes:

```text
hash(key) % 4
```

Unfortunately,

almost every key now maps to a different Redis server.

Example:

```text
Before

hash(product123) % 3

↓

Redis2
```

```text
After

hash(product123) % 4

↓

Redis4
```

Almost every cached object moves.

---

# Why Is This Bad?

Redis suddenly becomes almost empty.

Every request becomes:

```text
MISS

↓

Database
```

Until Redis warms up again.

Consequences:

- Database overload
- Cache Stampede
- Increased latency
- Poor user experience

---

# 2.24 Consistent Hashing

Consistent Hashing solves this problem.

Instead of hashing into buckets,

both servers and keys are placed onto a logical ring.

Example:

```text
                Redis1

         KeyA              Redis2

     KeyD                     KeyB

                Redis3

             KeyC
```

Each key belongs to the first server encountered while moving clockwise.

---

# 2.25 Reading the Ring

Suppose:

```text
Key A
```

Moving clockwise:

```text
KeyA

↓

Redis1
```

Therefore:

```text
KeyA

↓

Redis1
```

Similarly,

```text
KeyB

↓

Redis2
```

```text
KeyC

↓

Redis3
```

```text
KeyD

↓

Redis1
```

---

# 2.26 What Happens When a Server Fails?

Suppose:

```text
Redis2
```

fails.

Only the keys previously owned by Redis2 move.

They now belong to:

```text
Redis3
```

Every other key remains exactly where it was.

This is a huge improvement over modulo hashing.

---

# 2.27 Adding a New Server

Initially:

```text
Redis1

Redis2

Redis3
```

Later:

```text
Redis4
```

is added.

Only the keys between:

```text
Previous Server

↓

Redis4
```

move.

Everything else stays where it was.

Instead of moving nearly every key,

only a small portion of the data moves.

---

# Benefits of Consistent Hashing

- Minimal data movement
- Faster scaling
- Better availability
- Reduced cache warm-up time
- Lower database load after scaling

---

# 2.28 Is Consistent Hashing Perfect?

No.

Imagine this ring:

```text
Redis1

                Redis2


Redis3
```

Redis2 owns a much larger portion of the ring.

Result:

- More keys
- More requests
- Higher CPU

Traffic becomes unbalanced.

---

# 2.29 Virtual Nodes

Instead of placing each physical Redis server only once,

place it multiple times.

Example:

```text
Redis1-A
Redis1-B
Redis1-C

Redis2-A
Redis2-B
Redis2-C

Redis3-A
Redis3-B
Redis3-C
```

The ring now becomes:

```text
Redis1A

Redis2A

Redis3A

Redis1B

Redis2B

Redis3B

Redis1C

Redis2C

Redis3C
```

Each physical server owns many small regions instead of one large region.

---

# Benefits of Virtual Nodes

Instead of one large imbalance,

traffic becomes much more evenly distributed.

Advantages:

- Better load balancing
- Better fault tolerance
- Easier horizontal scaling
- Smaller data movement during scaling

---

# 2.30 Adding a New Server with Virtual Nodes

Suppose:

```text
Redis4
```

is added.

Instead of inserting one position,

we insert:

```text
Redis4-A

Redis4-B

Redis4-C
```

Many small regions move to Redis4.

Instead of one large migration,

many tiny migrations occur.

The resulting load distribution is much more balanced.

---

# 2.31 Why Not Create Millions of Virtual Nodes?

Virtual nodes improve balance,

but they also introduce overhead.

Each virtual node requires metadata.

Too many virtual nodes lead to:

- Increased memory usage
- More metadata management
- Longer rebalancing operations
- Higher operational complexity

Choose a reasonable number based on cluster size.

---

# 2.32 Regional Redis Clusters

Global applications often deploy Redis close to users.

Example:

```text
US

↓

Redis Cluster (US)
```

```text
Europe

↓

Redis Cluster (Europe)
```

```text
Asia

↓

Redis Cluster (Asia)
```

Benefits:

- Lower latency
- Reduced cross-region traffic
- Better user experience
- Higher resilience

Whether regional clusters are needed depends on traffic distribution.

For example:

| Region | Traffic |
|---------|---------:|
| US | 90% |
| Europe | 5% |
| Asia | 5% |

A single regional cluster may be sufficient.

However:

| Region | Traffic |
|---------|---------:|
| US | 35% |
| Europe | 30% |
| Asia | 35% |

Regional Redis clusters become much more attractive.

---

# 2.33 Horizontal vs Vertical Scaling

## Vertical Scaling

Increase the size of an existing Redis server.

Advantages:

- Simple
- No repartitioning

Disadvantages:

- Hardware limits
- Expensive
- Single point of failure

---

## Horizontal Scaling

Add additional Redis servers.

Advantages:

- Nearly unlimited scalability
- Better fault tolerance
- Better throughput

Disadvantages:

- More operational complexity
- Requires partitioning strategy

Large distributed systems almost always scale horizontally.

---

# 2.34 Key Takeaways

- A distributed cache improves scalability and throughput.
- Naive hashing causes massive data movement when cluster size changes.
- Consistent Hashing minimizes data movement.
- Virtual Nodes improve load balancing.
- Regional Redis clusters reduce latency for global users.
- Horizontal scaling is generally preferred for large-scale systems.

---

# Business Perspective

Before choosing a distributed cache architecture, ask:

- Is the bottleneck memory or CPU?
- Is traffic concentrated in one region?
- Is the workload read-heavy or write-heavy?
- How frequently will the cluster scale?
- How much data movement is acceptable during scaling?

The architecture should solve the actual bottleneck rather than introducing unnecessary complexity.

---

**End of Part 2**
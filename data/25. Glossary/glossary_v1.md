# System Design Glossary --- Version 1

## Essential Terms for Senior Software Engineer Interviews

This glossary is a concise reference for the System Design Study
Outline. It focuses on definitions and distinctions that are useful in
senior-level system design interviews.

------------------------------------------------------------------------

# 1. Fundamentals

**Scalability** --- A system's ability to handle increasing workload by
adding resources or improving resource utilization.

**Vertical Scaling** --- Increasing the resources of one machine, such
as CPU or memory.

**Horizontal Scaling** --- Adding more machines or instances to
distribute workload.

**Availability** --- The degree to which a system is operational and
accessible when needed.

**Reliability** --- The ability of a system to continue functioning
correctly over time.

**Fault Tolerance** --- The ability to continue providing an acceptable
level of service despite component failures.

**Latency** --- The time taken to complete an operation, such as an API
request.

**Throughput** --- The amount of work processed per unit of time, such
as requests per second.

**Bottleneck** --- The component or resource that limits overall system
performance.

**Single Point of Failure (SPOF)** --- A component whose failure can
cause the entire system or a critical function to fail.

**SLO (Service-Level Objective)** --- A measurable target for service
performance or reliability, such as an availability or latency target.

**Trade-off** --- A design decision that improves one property at the
expense of another.

------------------------------------------------------------------------

# 2. Load Balancing

**Load Balancer** --- Distributes incoming traffic across multiple
servers or instances.

**L4 Load Balancing** --- Routes traffic using transport-layer
information, such as IP addresses and ports.

**L7 Load Balancing** --- Routes traffic using application-layer
information, such as HTTP paths, headers, or hostnames.

**Health Check** --- A probe used to determine whether a server or
service should receive traffic.

**Round Robin** --- Distributes requests sequentially across available
servers.

**Least Connections** --- Routes traffic toward the server with the
fewest active connections.

**Sticky Session** --- Attempts to send a client's requests to the same
server across multiple requests.

**Reverse Proxy** --- An intermediary that receives client requests and
forwards them to backend services.

**Failover** --- Switching to a healthy replacement when a component
fails.

**Connection Draining** --- Stops sending new requests to a server being
removed from service while allowing existing connections or in-flight
work to finish.

------------------------------------------------------------------------

# 3. Caching

**Cache** --- Stores frequently accessed data closer to the consumer to
reduce latency and load on the source.

**Cache Hit** --- The requested data is found in the cache.

**Cache Miss** --- The requested data is absent and must be retrieved
elsewhere.

**Cache Hit Ratio** --- The proportion of cache lookups served by the
cache: `cache hits / total cache lookups`.

**Cache-Aside** --- The application checks the cache first and loads
data from the source on a miss, usually populating the cache afterward.

**Write-Through** --- Writes update the cache and underlying data store
as part of the write path.

**Write-Back** --- Writes are initially accepted by the cache and
propagated to the underlying store later.

**Write-Around** --- Writes bypass the cache, so subsequent reads may
need to fetch data from the source.

**Cache Invalidation** --- Removing or updating cached data when it is
no longer valid.

**TTL (Time-to-Live)** --- The period after which cached data expires.

**Cache Stampede** --- Many requests simultaneously attempt to
regenerate the same missing or expired cache entry.

**Cache Avalanche** --- Many cache entries expire or become unavailable
around the same time, creating a surge against the source.

**Hot Key** --- A cache key receiving disproportionately high traffic.

**Cache Warming** --- Preloading frequently accessed data before a
traffic spike or after a restart.

**Stale-While-Revalidate (SWR)** --- Serving a cached value that may be
stale while refreshing it asynchronously.

**Eviction Policy** --- Determines which entries are removed when cache
space is limited, such as least recently used (LRU).

**Distributed Cache** --- A cache shared across multiple application
instances, often through a separate service such as Redis.

------------------------------------------------------------------------

# 4. Replication and Sharding

**Replication** --- Maintaining copies of data on multiple nodes to
improve availability, resilience, or read capacity.

**Primary-Replica Architecture** --- A model in which a primary handles
designated writes and replicas receive copies of its data.

**Replication Lag** --- The delay between an update on the primary and
its visibility on a replica.

**Strong Consistency** --- A consistency guarantee under which reads
observe completed writes according to the system's specified ordering
guarantees.

**Eventual Consistency** --- Replicas may temporarily disagree but
converge if updates stop and propagation succeeds.

**Read Scaling** --- Increasing read capacity by distributing reads
across suitable replicas or caches.

**Sharding** --- Splitting data into partitions distributed across
multiple nodes.

**Shard Key** --- The field or combination of fields used to decide
which shard stores a record.

**Hot Shard** --- A partition that receives disproportionately high
traffic or stores disproportionately large amounts of data.

**Rebalancing** --- Redistributing data or workload across nodes to
restore a more appropriate balance.

**Read-After-Write Consistency** --- A guarantee that a client can
observe its own completed write when it subsequently reads the relevant
data.

**Key distinction:** Replication copies data; sharding partitions data.
A system can use both.

------------------------------------------------------------------------

# 5. Messaging and Asynchronous Systems

**Message Queue** --- Stores messages for consumers to process,
decoupling producers from consumers.

**Producer** --- A component that publishes messages.

**Consumer** --- A component that reads and processes messages.

**Broker** --- Infrastructure that accepts, stores, and delivers
messages.

**Asynchronous Processing** --- Accepting work without requiring the
caller to wait for the entire operation to finish.

**Event Streaming** --- Publishing a stream of events that consumers can
process, often with the ability to replay retained events.

**Event** --- A record that something happened, such as `OrderPlaced`.

**Event-Driven Architecture (EDA)** --- An architecture in which
components communicate or trigger work through events.

**Consumer Group** --- Consumers that coordinate to process a stream or
queue's work. Distribution semantics depend on the platform.

**Partition** --- An independently managed portion of a stream or
dataset that can support parallel processing.

**Offset** --- A position identifying a record within a partitioned
event stream.

**Consumer Lag** --- The amount of stream data a consumer has not yet
processed.

**Backpressure** --- Slowing producers or reducing intake when consumers
cannot keep up.

**Dead-Letter Queue (DLQ)** --- A destination for messages that cannot
be processed successfully under configured retry rules.

**Message Ordering** --- The ordering guarantee under which messages are
delivered or processed. It may apply only within a queue, key, or
partition.

**At-Least-Once Delivery** --- Messages are delivered one or more times,
so consumers must tolerate duplicates.

**At-Most-Once Delivery** --- Messages are delivered zero or one time,
so failures can result in lost processing opportunities.

**Exactly-Once Semantics** --- A guarantee scoped to a particular
processing system or transaction boundary. Exactly-once business effects
generally require additional coordination or idempotency.

------------------------------------------------------------------------

# 6. Distributed Systems and Coordination

## Distributed Locks

**Distributed Lock** --- Coordinates access to a shared resource across
multiple processes or machines.

**Mutual Exclusion** --- Ensures that no more than one valid owner
enters a protected critical section at a time.

**Lease** --- A lock granted for a limited period, after which ownership
expires unless renewed.

**Fencing Token** --- An ordered token used to identify ownership
generations. The protected resource must validate it to reject stale
owners.

## Leader Election and Consensus

**Leader Election** --- Selecting one node to coordinate an activity or
act as the designated leader.

**Split Brain** --- A failure state in which multiple nodes incorrectly
believe they are the authoritative leader or owner.

**Quorum** --- A required subset of nodes whose agreement or
participation is sufficient for a protocol's specified decision.

**Consensus** --- A protocol that enables distributed nodes to agree on
a value or sequence of decisions despite certain failures.

**Raft** --- A consensus algorithm that uses leader election and
replicated logs to maintain an agreed sequence of state changes.

**Term / Epoch** --- A logical generation used to distinguish leadership
periods or ownership generations and reject stale information.

**Idempotent Operation** --- An operation that can be repeated without
changing the intended result beyond the initial application.

## Consistent Hashing

**Consistent Hashing** --- Maps keys and nodes onto a hash space so
adding or removing nodes typically remaps only a subset of keys.

**Hash Function** --- Maps an input, such as a key, to a hash value used
for routing or distribution.

**Hash Ring** --- A conceptual circular hash space used by some
consistent-hashing implementations.

**Virtual Nodes (Vnodes)** --- Multiple logical positions assigned to
each physical node to improve distribution and balance.

**Partition Skew** --- Uneven distribution of records or requests across
partitions.

## CAP Theorem and Consistency

**CAP Theorem** --- During a network partition, a distributed system
cannot guarantee both linearizable consistency and availability for
every request in the formal CAP sense.

**Consistency (CAP)** --- In CAP discussions, a strong, single-copy
consistency guarantee, not every possible form of consistency.

**Availability (CAP)** --- Every request to a non-failing node receives
a response, although that response need not contain the latest data.

**Partition Tolerance** --- Continuing to operate despite communication
failures that divide nodes into groups unable to communicate.

**Network Partition** --- A communication failure that prevents parts of
a distributed system from exchanging messages reliably.

**Linearizability** --- A consistency model in which each operation
appears to take effect atomically at a point between invocation and
completion, while respecting real-time ordering.

------------------------------------------------------------------------

# 7. Reliability and Resilience

## Circuit Breaker

**Circuit Breaker** --- Stops or limits calls to a dependency that is
failing, allowing it time to recover.

**Closed State** --- The circuit allows normal calls.

**Open State** --- The circuit rejects or bypasses calls to the failing
dependency.

**Half-Open State** --- The circuit permits limited test calls to
determine whether the dependency has recovered.

## Retry and Backoff

**Retry** --- Repeating an operation after a failure or unsuccessful
response.

**Exponential Backoff** --- Increasing the delay between retries after
repeated failures.

**Jitter** --- Adding randomness to retry delays to reduce synchronized
retry bursts.

**Timeout** --- The maximum duration a caller waits for an operation
before treating it as unsuccessful.

**Rate Limiter** --- Controls how frequently a user, client, tenant, or
service can perform an operation.

**Load Shedding** --- Deliberately rejecting or dropping work to protect
a system when demand exceeds safe processing capacity.

**Graceful Degradation** --- Preserving core functionality while
temporarily reducing nonessential functionality during overload or
failure.

## Health Checks

**Health Check** --- A probe used to assess whether a component is
functioning sufficiently to receive work or continue running.

**Liveness Probe** --- Checks whether a process is alive enough to
continue running. Failure may trigger a restart.

**Readiness Probe** --- Checks whether an instance is ready to receive
traffic. An instance can be alive but not ready.

**Service Discovery** --- Mechanisms through which services locate
available instances of other services.

**Service Registry** --- A store or service that tracks available
service instances and their network locations.

------------------------------------------------------------------------

# 8. Data and Storage Systems

## Distributed Cache

**Distributed Cache** --- A cache shared across multiple application
instances, typically accessed over a network.

**Cache Invalidation** --- Removing or updating cached data when it is
no longer valid.

**Cache Stampede** --- Many requests simultaneously regenerate the same
missing or expired entry.

## Object Storage

**Object Storage** --- Stores data as objects, typically with metadata
and an object identifier. Common uses include files, images, backups,
and large data artifacts.

**Object Key** --- The identifier used to locate an object within a
storage namespace or bucket.

**Metadata** --- Descriptive information about an object, such as
content type, size, owner, or creation time.

**Durability** --- The degree to which stored data survives failures or
restarts.

## Search Engine

**Search Index** --- A data structure optimized for retrieving documents
or records matching search terms or filters.

**Inverted Index** --- Maps terms to the documents containing them,
enabling efficient text retrieval.

**Full-Text Search** --- Finding documents based on their textual
content rather than only exact field values.

**Relevance Ranking** --- Scoring and ordering search results based on
how well they match a query.

**Indexing** --- Processing source data into structures that support
efficient retrieval.

**Eventual Index Consistency** --- The search index may lag behind the
source database, so recent changes may not immediately appear in search
results.

## Bloom Filter

**Bloom Filter** --- A space-efficient probabilistic data structure used
to test whether an item may be present in a set.

**False Positive** --- A Bloom filter says an item may exist even though
it does not.

**False Negative** --- A standard Bloom filter does not produce false
negatives when correctly used and maintained under its normal
assumptions.

**Key distinction:** A Bloom filter can say "definitely absent" or
"possibly present"; it cannot confirm presence on its own.

------------------------------------------------------------------------

# 9. Correctness and Request Processing

**Idempotency** --- Repeating an operation produces the same intended
result as performing it once.

**Idempotency Key** --- An identifier used to recognize retries of the
same logical operation.

**Duplicate Request** --- A repeated request that may otherwise cause
the same business action to happen more than once.

**Deduplication** --- Detecting repeated messages or requests and
avoiding duplicate processing within the defined scope.

**At-Least-Once Processing** --- Processing may be attempted more than
once, so handlers should be designed to tolerate duplicates when
possible.

**Race Condition** --- A correctness issue caused by concurrent
operations interacting in an unsafe order.

**Atomicity** --- The guarantee that an operation happens as one
indivisible unit within the relevant transaction or coordination
boundary.

**Transaction** --- A group of operations treated as one unit according
to a storage system's transaction guarantees.

**Optimistic Concurrency Control** --- Allows operations to proceed
assuming conflicts are uncommon, then checks whether underlying data
changed before committing.

**Compare-and-Swap (CAS)** --- Updates a value only if it still matches
an expected value, helping prevent lost updates.

------------------------------------------------------------------------

# 10. Quick Distinctions

  -----------------------------------------------------------------------
  Concepts                            Difference
  ----------------------------------- -----------------------------------
  Vertical vs. horizontal scaling     Bigger machine vs. more machines

  Availability vs. reliability        Accessible now vs. correct
                                      operation over time

  Replication vs. sharding            Copy data vs. split data

  Cache-aside vs. write-through       Populate on read miss vs. update
                                      cache as part of write path

  Queue vs. event stream              Often distributes work vs. retains
                                      events for replay and multiple
                                      consumers

  At-least-once vs. at-most-once      Duplicates possible vs. messages or
                                      work can be missed

  Distributed lock vs. leader         Coordinate resource ownership
  election                            vs. select a coordinator

  Consistency vs. availability under  Strong ordering guarantee
  CAP                                 vs. responding during a partition

  Retry vs. circuit breaker           Try again vs. limit calls to an
                                      unhealthy dependency

  Liveness vs. readiness              Should the process keep running?
                                      vs. should it receive traffic?

  Rate limiter vs. load shedding      Enforce a usage policy vs. protect
                                      the system from overload

  Idempotency vs. atomicity           Repeated action has the same
                                      intended effect vs. operation is
                                      indivisible
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 11. The 25 Terms to Know Cold

1.  **Horizontal scaling** --- Add more instances.
2.  **Load balancer** --- Distribute traffic.
3.  **Cache invalidation** --- Keep cached data appropriately fresh.
4.  **Cache stampede** --- Many requests regenerate the same entry.
5.  **Replication lag** --- Replicas may not contain the latest update.
6.  **Sharding** --- Split data across partitions.
7.  **Hot key** --- One key receives disproportionate traffic.
8.  **Message queue** --- Decouple producers and consumers.
9.  **Consumer lag** --- A consumer is behind the available stream or
    queue work.
10. **Backpressure** --- Slow intake when downstream processing cannot
    keep up.
11. **At-least-once delivery** --- Duplicates are possible.
12. **Idempotency** --- Repetition does not duplicate the intended
    effect.
13. **Distributed lock** --- Coordinate ownership of shared resources.
14. **Fencing token** --- Reject stale owners at the protected resource.
15. **Leader election** --- Select a coordinator.
16. **Quorum** --- Required subset of participants.
17. **Consensus** --- Agree on a decision despite supported failures.
18. **Consistent hashing** --- Reduce remapping when nodes change.
19. **CAP theorem** --- Partition-time trade-off between strong
    consistency and availability.
20. **Circuit breaker** --- Stop calls to an unhealthy dependency.
21. **Exponential backoff** --- Increase retry delays.
22. **Rate limiter** --- Control admission rate.
23. **Bloom filter** --- Test possible membership efficiently.
24. **Inverted index** --- Map search terms to matching documents.
25. **SLO** --- Measurable reliability or performance target.

------------------------------------------------------------------------

# 12. How to Use This Glossary in Interviews

For each important term, practice explaining:

1.  **Definition:** What does it mean?
2.  **Use case:** What problem does it solve?
3.  **Trade-off or failure mode:** What limitation must be considered?

**Example --- Why use a message queue?**

"A message queue decouples producers from consumers, buffers temporary
bursts, and supports asynchronous processing. However, it introduces
delivery semantics, consumer lag, retries, ordering considerations, and
possible duplicate processing, so consumers may need idempotency."

**Final mental model:** System design is about choosing the right
component, understanding its guarantees, identifying what happens when
it fails, and explaining why its trade-offs fit the requirements.

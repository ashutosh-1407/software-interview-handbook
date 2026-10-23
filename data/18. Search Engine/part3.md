# Search Engine — Part 3: Indexing, Freshness & Consistency

## 1. Why Does a Search Index Need Updates?

A search engine typically maintains its own index rather than querying the primary database for every search.

This improves search performance, but it creates a new problem: **how do we keep the search index synchronized with the database?**

Consider an e-commerce platform.

A product initially has this data:

```text
Product ID: 123
Name: Sony Headphones
Price: $100
```

The product is stored in the database and indexed by the search engine.

Later, the price changes to $80.

```text
Database:
Price = $80

Search Index:
Price = $100
```

The database has the latest value, but the search index is stale.

This can cause two problems:

1. The user sees an outdated price.
2. A price filter may return incorrect results. For example, a search for products under $90 might exclude this product.

The database and search index are separate systems, so updating one does not automatically guarantee that the other is updated.

### Architecture

```text
Application
    |
    v
Database (Source of Truth)
    |
    v
Index Synchronization
    |
    v
Search Index
```

The synchronization mechanism ensures that database changes eventually reach the search index.

**Principle:** The database is authoritative; the search index is a derived representation optimized for searching.

---

## 2. Synchronous Indexing

With synchronous indexing, the application waits for the search index update as part of the user-facing operation.

### Example

A user adds a new product.

```text
User
  |
  v
Application
  |
  +----> Database: Save Product
  |
  +----> Search Engine: Index Product
  |
  v
Return Response
```

The application waits for both operations to complete before returning a successful response.

### Advantages

- The product can become searchable immediately after the indexing operation completes.
- The application has direct feedback about whether the indexing operation succeeded.
- There may be less indexing delay between a successful operation and search visibility.

### Disadvantages

**Higher latency**

Suppose:
- Database update: 50 ms.
- Search index update: 300 ms.

The user request may take approximately 350 ms, excluding other overhead.

**Tighter coupling**

The application now depends on the search engine during the user-facing operation.

If the search engine becomes slow, the request becomes slower.

**Availability impact**

Suppose the database update succeeds but the search engine is unavailable.

The application may fail to complete the request even though the product was successfully saved.

This can create an ambiguous outcome: the user sees an error, but the product exists in the database.

### When is synchronous indexing appropriate?

Consider it when immediate search visibility is important and the additional latency and dependency are acceptable.

However, synchronous indexing alone does not guarantee atomic consistency between the database and search index. A failure between the two operations can still leave them inconsistent.

**Principle:** Synchronous indexing can reduce indexing delay but increases request latency and couples the user-facing operation to the search engine.

---

## 3. Asynchronous Indexing

With asynchronous indexing, the application saves the data and schedules indexing work for background processing.

A queue or event stream can decouple the user-facing operation from the indexing worker.

### Architecture

```text
                 Application
                      |
                      v
                  Database
                      |
                      v
                Event / Queue
                      |
                      v
                Indexing Worker
                      |
                      v
                 Search Index
```

The application does not need to wait for the search index to finish updating before responding to the user.

### Example

A user changes a product's price from $100 to $80.

1. The application updates the database.
2. An event describing the change is made available to the indexing pipeline.
3. The application returns success after the required durable operations complete.
4. A background worker consumes the event.
5. The worker updates the search index.

During the interval between steps 1 and 5, search results may still show the old price.

### Advantages

- Lower user-facing latency.
- Reduced dependency between user requests and search indexing.
- Background workers can process indexing tasks independently.
- Indexing throughput can be scaled separately from the application.

### Disadvantages

- Search results may temporarily be stale.
- Indexing failures require retries and recovery.
- Events may be delivered more than once.
- Events may arrive out of order.
- The application needs reliable event publication and processing.

### Synchronous versus asynchronous indexing

| Aspect | Synchronous | Asynchronous |
|---|---|---|
| User-facing latency | Often higher | Usually lower |
| Search freshness | Can be immediate after indexing completes | May be delayed |
| Dependency | Search engine affects request completion | Search engine can often fail independently |
| Failure handling | Must handle partial success | Requires durable events and background recovery |
| Complexity | Coordination within the request | Queueing, retries, ordering, and recovery |

### How should we choose?

The decision depends primarily on:
- Freshness requirements.
- User-facing latency requirements.
- The impact of search-engine failures.
- Operational complexity.

A write-heavy workload may benefit from asynchronous indexing, but write volume alone doesn't determine the correct design.

**Principle:** Prefer asynchronous indexing when temporary staleness is acceptable and decoupling indexing from user requests provides meaningful benefits.

---

## 4. Eventual Consistency and Index Freshness

Asynchronous indexing commonly introduces a period during which the database and search index disagree.

This is an example of eventual consistency.

### What does eventual consistency mean?

After an update, different representations of the data may temporarily disagree. If updates are successfully propagated and processing catches up, the representations should eventually converge.

For example:

```text
Time T1:
Database price = $100
Search index price = $100

Time T2:
Database price = $80
Search index price = $100

Time T3:
Database price = $80
Search index price = $80
```

The search index is stale at T2 but catches up at T3.

### What determines freshness?

Index freshness depends on factors such as:
- How quickly changes are published.
- Queue backlog.
- Worker processing throughput.
- Search engine availability.
- Retry delays.
- Indexing and refresh behavior.

A healthy asynchronous system should monitor how long updates take to become searchable.

### Near-real-time indexing

Many search engines support near-real-time indexing: updates become searchable after a short delay rather than necessarily being visible immediately after the indexing operation.

Near-real-time describes indexing latency. Eventual consistency describes a consistency guarantee.

They are related, but they are not interchangeable concepts.

### Business requirements determine acceptable staleness

Consider different product attributes:

**Product description**

A short delay before a new description becomes searchable may be acceptable.

**Product price**

A stale price can produce misleading results or incorrect filtering.

**Inventory availability**

Stale inventory information can cause users to see products that are no longer available.

The acceptable freshness requirement depends on the business impact.

**Principle:** Define a freshness target based on business requirements rather than assuming every field needs the same consistency guarantee.

---

## 5. Routing Fresh Queries to the Database

Sometimes the search index cannot be trusted to provide sufficiently fresh results.

One option is to route affected queries to the database while indexing catches up.

### Example

A product's price changes from $100 to $80.

The database is correct, but the search index still contains $100.

A user searches for products under $90.

If the search engine relies exclusively on its stale index, the product may be excluded from the results.

Simply retrieving the current price for products already returned by the search engine does not solve this problem: the product might never have been selected as a candidate.

### Approach A: Route affected searches to the database

```text
User Query
    |
    v
Application
    |
    v
Is Search Index Fresh Enough?
    |
    +---- Yes ----> Search Engine
    |
    +---- No -----> Database Fallback
```

This is a conceptual architecture. The application needs a reliable way to determine which data or queries are affected by stale indexing.

### Advantages

- Can provide fresher results for affected queries.
- Avoids making every write wait for search indexing.

### Disadvantages

- Database queries may be more expensive than search-index queries.
- The database can become overloaded if too many requests fall back.
- Translating complex search behavior into database queries may be difficult.
- Determining which queries are affected adds complexity.

A practical implementation may route only affected queries or data to the database rather than redirecting all search traffic.

---

## 6. Merging Recent Database Changes into Search Results

Another option is to combine search-index results with recent changes that haven't been indexed yet.

### Architecture

```text
                 Search Query
                      |
             +--------+--------+
             |                 |
             v                 v
        Search Index      Recent Changes
             |                 |
             +--------+--------+
                      |
                      v
                Merge Results
                      |
                      v
                 Re-rank Results
                      |
                      v
                 Return Results
```

### Example

The search index contains:

```text
Product 123
Price = $100
```

A recent change contains:

```text
Product 123
Price = $80
```

For a query filtering products under $90, the system must use the updated price when determining eligibility.

It cannot merely replace the displayed price after retrieving the old search results.

### What must the system handle?

A correct merge strategy must account for:
- Newly added products.
- Updated products.
- Deleted products.
- Changed filter attributes.
- Duplicate documents from both sources.
- Correct ranking and pagination.

For example, if a product was deleted in the database but remains in the search index, the merge process must prevent the deleted product from appearing.

Similarly, a newly added product must be considered even though it doesn't yet exist in the search index.

### Trade-off

Merging recent changes can improve freshness without making every write synchronous.

However, it introduces significant complexity in candidate retrieval, filtering, deduplication, ranking, and pagination.

**Principle:** Freshness workarounds must correct candidate selection and filtering, not merely update fields in the final response.

---

## 7. Reliable Event Publication: The Transactional Outbox

Asynchronous indexing depends on reliable event publication.

Consider this implementation:

```text
1. Update database.
2. Publish indexing event.
```

What happens if the database update succeeds but the application crashes before publishing the event?

The product is updated, but no indexing event is published. The search index may remain stale indefinitely.

Reversing the order creates a different problem: an event could be published even though the database transaction subsequently fails.

### Transactional Outbox pattern

The Transactional Outbox addresses this dual-write problem.

Instead of independently updating the database and publishing an event, the application writes the business data and an outbox record in the same database transaction.

```text
Application
    |
    v
Database Transaction
    |
    +---- Update Product
    |
    +---- Insert Outbox Event
    |
    v
Transaction Commits
    |
    v
Outbox Publisher
    |
    v
Event / Queue
    |
    v
Indexing Worker
    |
    v
Search Index
```

### Example

A product's price changes to $80.

Within one transaction:

1. Update the product row.
2. Insert an outbox event describing the update.
3. Commit the transaction.

A separate publisher reads the outbox and publishes the event.

If the transaction fails, neither the product update nor the outbox record commits.

If the application crashes after the transaction commits, the outbox record remains available for later publication.

### Important limitation

The outbox does not automatically provide exactly-once delivery.

The publisher may publish an event successfully and crash before marking it as published. It may publish the same event again after restarting.

Therefore, consumers should be prepared to process duplicate events safely.

**Principle:** The Transactional Outbox reliably connects database transactions to asynchronous event publication, while consumers still need duplicate-safe processing.

---

## 8. Retrying Failed Indexing Operations

Even with reliable event publication, indexing workers can fail.

For example:

```text
Event:
Product 123 updated to $80
```

The worker attempts to update the search index, but the search engine is temporarily unavailable.

The event should not simply be discarded.

### Retry strategy

A common strategy is bounded exponential backoff with jitter.

Conceptually:

```text
Attempt 1 → Fail
Wait      → Short delay

Attempt 2 → Fail
Wait      → Longer delay

Attempt 3 → Fail
Wait      → Longer delay
```

Exponential backoff increases the delay between attempts.

Jitter adds randomness to reduce the chance that many workers retry simultaneously.

The system should also have a maximum retry count or another bounded retry policy.

### Why not retry continuously?

If the search engine is overloaded, immediate retries may add even more traffic and make the problem worse.

Retries should be bounded and coordinated with the system's recovery behavior.

### Dead Letter Queue (DLQ)

After repeated failures, an event may be moved to a Dead Letter Queue.

A DLQ allows operators to:
- Inspect failed events.
- Identify persistent errors.
- Correct the underlying problem.
- Replay events when appropriate.

### Example

```text
Event Queue
    |
    v
Indexing Worker
    |
    +---- Success ----> Acknowledge Event
    |
    +---- Failure ----> Retry
                           |
                           v
                    Retry Limit Reached
                           |
                           v
                          DLQ
```

### Important operational detail

Replaying a DLQ event should be done carefully.

If newer updates have already been applied, replaying an older event without ordering protection could overwrite newer data.

**Principle:** Use bounded retries and a DLQ for recovery, but also make indexing operations duplicate-safe and protect against out-of-order events.

---

## 9. Out-of-Order Events and Version Numbers

Asynchronous workers may process events in a different order from the order in which updates occurred.

Consider a product's price:

```text
Version 1: $100
Version 2: $80
Version 3: $70
```

The intended final price is $70.

However, suppose workers process the events in this order:

```text
Version 3: $70
Version 1: $100
Version 2: $80
```

If every event blindly overwrites the search index, the final price could incorrectly become $80.

This is an out-of-order processing problem.

### Solution: Version-based checks

Associate each update with a monotonically increasing version number.

The indexing operation should apply an update only if its version is newer than the version already stored.

Conceptually:

```text
Incoming version > Indexed version
    |
    +---- Yes ----> Apply Update
    |
    +---- No -----> Ignore Stale Update
```

### Example

The search index currently contains:

```text
Version = 3
Price = $70
```

An older event arrives:

```text
Version = 1
Price = $100
```

Since version 1 is older than version 3, the worker rejects the update.

The indexed price remains $70.

### Why must the version check be atomic?

Suppose two workers process versions 2 and 3 concurrently.

Both read the current indexed version as 1.

Worker A decides version 2 is newer.

Worker B decides version 3 is newer.

If the check and update are not coordinated, Worker A might write version 2 after Worker B has written version 3.

The final result would be stale.

Therefore, the version comparison and update must be atomic, or the indexing system must otherwise guarantee that an older update cannot overwrite a newer one.

The exact implementation depends on the search engine's update and concurrency capabilities.

**Principle:** Version numbers prevent stale events from overwriting newer data only when version checks and updates are applied safely under concurrency.

---

## 10. Idempotency in Indexing Workers

Queues may deliver the same event more than once.

For example:

1. A worker updates the search index.
2. The search engine successfully applies the update.
3. The worker crashes before acknowledging the event.
4. The queue delivers the event again.

If the operation isn't duplicate-safe, repeated delivery could create problems.

### Make indexing operations idempotent

An operation is idempotent when repeating it produces the same intended final state as applying it once.

For example, setting Product 123's indexed price to $80 is naturally compatible with duplicate processing, provided older versions cannot overwrite newer ones.

However, an operation that blindly increments a value or creates a new document without stable identity may not be duplicate-safe.

### Combine idempotency with versioning

Idempotency handles duplicate processing.

Version checks handle out-of-order updates.

They solve related but distinct problems.

| Mechanism | Problem addressed |
|---|---|
| Idempotency | Duplicate events |
| Version checks | Stale or out-of-order updates |
| Transactional Outbox | Reliable publication of database changes |
| Retries | Temporary processing failures |
| DLQ | Repeatedly failing events |

**Principle:** Reliable asynchronous indexing needs duplicate-safe processing and protection against stale updates; retries alone are insufficient.

---

## Part 3: Quick Revision

| Concept | Key takeaway |
|---|---|
| Search index freshness | How current indexed data is relative to the source |
| Synchronous indexing | Wait for indexing as part of the user-facing operation |
| Asynchronous indexing | Process index updates in the background |
| Eventual consistency | Representations may temporarily disagree but can converge |
| Near-real-time indexing | Changes become searchable after a short delay |
| Database fallback | Route affected queries to authoritative data when needed |
| Result merging | Combine indexed results with recent changes |
| Transactional Outbox | Commit business changes and outbox events in one transaction |
| Exponential backoff | Increase delay between retry attempts |
| Jitter | Randomize retry delays |
| DLQ | Isolate repeatedly failing events for inspection and recovery |
| Event ordering | Updates may be processed in a different order from creation |
| Version checks | Prevent older updates from overwriting newer versions |
| Idempotent processing | Duplicate events produce the same intended final state |

### Five principles to remember

1. The database is authoritative; the search index is a derived representation.
2. Choose synchronous or asynchronous indexing based on freshness, latency, and failure requirements.
3. Use the Transactional Outbox to prevent losing events between database commits and event publication.
4. Use bounded retries and a DLQ to recover from repeated indexing failures.
5. Combine idempotency with safe version checks to handle duplicate and out-of-order events.
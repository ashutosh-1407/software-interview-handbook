# System Design Handbook — Search Engine Cheat Sheet

**Purpose:** Interview revision  
**Coverage:** Search fundamentals, ranking, matching, indexing, consistency, reliability, sharding, and replication.

---

## 1. Search Fundamentals

### Why use a dedicated search engine?

A database is optimized for authoritative data storage and structured queries. A search engine is optimized for full-text retrieval, relevance ranking, and search-specific features.

Use a dedicated search engine when requirements include:
- Full-text search across large document collections.
- Relevance-based ranking.
- Typo tolerance and synonyms.
- Autocomplete and search-as-you-type.
- Complex text matching and filtering.

**Core principle:** The database is the source of truth; the search index is a derived representation optimized for searching.

### Inverted index

An inverted index maps each term to the documents containing it.

Example:

```text
Document 1: wireless headphones
Document 2: wireless speakers
Document 3: noise cancelling headphones

Inverted Index:
wireless   -> [1, 2]
headphones -> [1, 3]
speakers   -> [2]
noise      -> [3]
cancelling -> [3]
```

- **Document:** The indexed entity.
- **Term:** A searchable token.
- **Posting list:** The documents associated with a term.
- **Inverted index:** The structure mapping terms to documents.

**Trade-off:** Faster retrieval, at the cost of index storage and maintenance.

---

## 2. Relevance and Ranking

Finding matching documents and ranking them are separate problems.

### TF-IDF

- **TF (Term Frequency):** How frequently a term appears in a document.
- **IDF (Inverse Document Frequency):** How informative a term is across the document collection.
- Common terms are less useful for distinguishing documents than rare terms.

Simplified expression:

`TF-IDF = TF × IDF`

### BM25

A widely used ranking function that considers:
- Term frequency.
- Term rarity.
- Document-length normalization.

Long documents should not automatically rank higher simply because they contain more words.

### Field weighting

Different fields can have different ranking importance.

Example:

```text
Product name  -> High weight
Brand         -> High/medium weight
Category      -> Medium weight
Description   -> Lower weight
```

The correct weights depend on the product and user intent.

**Interview principle:** Matching determines which documents qualify; ranking determines their order.

---

## 3. Text Analysis

### Tokenization
Splits text into searchable tokens.

Example:

`"Wireless Noise-Cancelling Headphones"`

Possible tokens:

`["wireless", "noise", "cancelling", "headphones"]`

### Stemming
Reduces related word forms to an approximate common root.

- Improves recall across word variations.
- Can introduce false matches if words are over-normalized.

### Synonyms
Allow related or equivalent terms to match.

Example: `laptop` and `notebook computer`.

| Approach | Advantage | Trade-off |
|---|---|---|
| Query-time expansion | Easier to change query behavior | Can increase query complexity |
| Index-time expansion | Can make related terms searchable through the index | Changes may require reindexing or index updates |

**Important:** Index-time and query-time analysis must be compatible.

**Interview principle:** Improving recall can reduce precision.

---

## 4. Advanced Matching

| Technique | Purpose | Example |
|---|---|---|
| Exact matching | Match a specific term or value | `headphones` |
| Prefix matching | Match terms beginning with a prefix | `head` → `headphones` |
| Substring matching | Match text appearing within a string | `phone` → `headphones` |
| Autocomplete | Suggest likely completions | `wireless hea...` |
| Fuzzy matching | Tolerate spelling errors | `hedphones` → `headphones` |
| Synonym expansion | Match related terms | `laptop` → `notebook computer` |

### Edit distance

Measures the number of string-edit operations needed to transform one string into another.

Fuzzy matching can improve recall, but broad candidate expansion increases latency and may reduce precision.

### Search-as-you-type

Useful controls:
- Debounce keystrokes.
- Set a minimum input length.
- Limit returned suggestions.
- Rank results appropriately.
- Ignore stale responses to older queries.

**Interview distinction:**
- Prefix matching handles incomplete words.
- Fuzzy matching handles approximate spelling.
- Synonyms handle related meaning.

### Precision versus recall

- **Precision:** Of the returned documents, how many are relevant?
- **Recall:** Of all relevant documents, how many were retrieved?

More aggressive matching can improve recall while reducing precision.

---

## 5. Indexing: Synchronous vs. Asynchronous

### Synchronous indexing

```text
Application
   |
   +----> Database Update
   |
   +----> Search Index Update
   |
   v
Response
```

**Advantages**
- Can reduce the delay before changes become searchable.
- The application receives immediate feedback from the indexing operation.

**Disadvantages**
- Adds user-facing latency.
- Couples request completion to the search engine.
- A failure between updates can leave the database and index inconsistent.

Synchronous indexing does not automatically provide an atomic transaction across the database and search engine.

### Asynchronous indexing

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

**Advantages**
- Lower user-facing latency.
- Independent scaling of indexing workers.
- Better isolation from search-engine failures.

**Disadvantages**
- Temporary stale results.
- Event delivery and processing complexity.
- Duplicate and out-of-order events.
- Need for retries and recovery.

| Requirement | Consideration |
|---|---|
| Immediate search visibility | Minimize indexing delay; account for refresh behavior |
| Low write latency | Asynchronous indexing may be preferable |
| Search-engine outage isolation | Asynchronous processing provides better decoupling |
| Strict freshness requirements | May require additional consistency mechanisms |

---

## 6. Freshness and Consistency

### Eventual consistency

The database and search index may temporarily disagree but should converge if updates are reliably propagated and successfully processed.

### Near-real-time indexing

Changes become searchable after a short delay rather than necessarily immediately after indexing.

These terms are related but not interchangeable:
- **Near-real-time** describes indexing latency.
- **Eventual consistency** describes a consistency guarantee.

### Indexing lag versus replica lag

**Indexing lag:**
The database has changed, but the update has not reached the searchable index.

**Replica lag:**
One copy of the search index has updated, but another copy has not caught up.

### Handling stale results

**Option A: Database fallback**
- Route affected queries to authoritative data.
- Improves freshness.
- Can increase database load and query complexity.

**Option B: Merge recent changes**
- Combine indexed results with recent unindexed changes.
- Requires correct filtering, deduplication, ranking, and pagination.

**Critical pitfall:** Updating a displayed price after retrieval does not recover a product excluded by stale filtering.

Example:

```text
Database price = $80
Indexed price  = $100

Query: products under $90
```

The product may be excluded by the stale index before the application gets a chance to update its displayed price.

**Interview principle:** Freshness mechanisms must correct candidate selection and filtering, not just displayed fields.

---

## 7. Reliable Indexing and Failure Recovery

### Transactional Outbox

Problem:

```text
1. Update database.
2. Publish event.
```

If the application crashes between the two steps, the database update may succeed while the event is never published.

Solution:

```text
Database Transaction
    |
    +---- Update Business Data
    |
    +---- Insert Outbox Event
    |
    v
Commit
    |
    v
Outbox Publisher
    |
    v
Queue
    |
    v
Indexing Worker
```

Both the business update and outbox record are committed in one database transaction.

**The Outbox prevents this dual-write failure window but does not guarantee exactly-once delivery.**

### Retries, backoff, and jitter

- **Retry:** Attempt a failed operation again.
- **Exponential backoff:** Increase the delay between attempts.
- **Jitter:** Randomize retry delays to reduce synchronized retry storms.
- **Bounded retries:** Limit attempts or otherwise bound retry behavior.
- **DLQ (Dead Letter Queue):** Isolate repeatedly failing events for investigation and recovery.

Retries should not continue aggressively during an outage.

### Duplicate and out-of-order events

Consider price updates:

```text
Version 1 -> $100
Version 2 -> $80
Version 3 -> $70
```

If version 3 is applied first, versions 1 and 2 must not overwrite it later.

| Mechanism | Problem solved |
|---|---|
| Transactional Outbox | Reliable publication of committed changes |
| Retry/backoff | Transient processing failures |
| DLQ | Persistent processing failures |
| Idempotency | Duplicate event delivery |
| Version checks | Stale or out-of-order updates |
| Atomic version check and update | Concurrent stale-overwrite races |

**Important:** Idempotency does not automatically prevent out-of-order updates. The version comparison and update must be safe under concurrency.

---

## 8. Search Sharding

Sharding distributes the search index across multiple machines.

```text
             Search Index
                  |
         +--------+--------+
         |        |        |
         v        v        v
      Shard 1  Shard 2  Shard 3
```

Each shard stores a portion of the indexed documents.

### Benefits
- Distributed storage.
- Parallel query execution.
- Increased aggregate capacity.
- Distributed indexing workload.

### Trade-offs
- Network overhead.
- Query fan-out.
- Coordination and result-merging costs.
- More complex operations.
- Greater exposure to slow-shard latency.

**Interview principle:** More shards do not automatically mean faster searches.

### Distributed query execution

```text
User Query
    |
    v
Query Coordinator
    |
    +----------+----------+
    |          |          |
    v          v          v
 Shard 1     Shard 2     Shard 3
    |          |          |
    +----------+----------+
               |
               v
       Merge Candidates
               |
               v
       Global Result Set
```

Steps:
1. Receive the query.
2. Fan out to relevant shards.
3. Search locally.
4. Collect candidates and scores.
5. Merge candidates.
6. Produce the global ranking.
7. Return the requested results.

**Important:** Shard-local rankings do not automatically produce the correct global ranking. Scoring behavior and candidate selection matter.

---

## 9. Slow Shards and Partial Results

Suppose a query contacts four shards:

| Shard | Response time |
|---|---:|
| Shard 1 | 30 ms |
| Shard 2 | 35 ms |
| Shard 3 | 40 ms |
| Shard 4 | 900 ms |

If the coordinator waits for all shards, the slowest shard may dominate the total latency.

### Mitigation
- Set an overall query deadline.
- Use per-shard timeouts.
- Investigate expensive queries and resource saturation.
- Identify uneven data distribution.
- Return partial results when the product permits incomplete results.

### Partial results

**Advantages**
- Lower latency.
- Continued functionality during some failures.

**Disadvantages**
- Missing documents.
- Potentially incorrect global top results.
- Incomplete ranking or result counts.

Partial results are a business trade-off, not automatically correct behavior.

**Interview principle:** Timeouts limit the impact of slow components; they do not fix the underlying bottleneck.

---

## 10. Replication

Replication maintains copies of shard data.

```text
Shard 1 ---- Replica 1
Shard 2 ---- Replica 2
Shard 3 ---- Replica 3
```

### Benefits
- Improved availability.
- Additional read capacity.
- Recovery options when a copy becomes unavailable.

### Trade-offs
- Additional storage.
- Update propagation.
- Replica recovery.
- Potentially stale reads.

### Replica lag

A replica may not yet have applied the latest update.

Possible mitigations depend on the search engine and requirements:
- Monitor replica lag.
- Avoid known-stale copies for freshness-sensitive requests.
- Wait for acceptable propagation.
- Use an authoritative database path for selected operations.

**Interview distinction:**
- Sharding distributes portions of the index.
- Replication maintains additional copies of those portions.

Replication improves resilience and capacity, but it does not automatically guarantee freshness.

---

## 11. Monitoring Checklist

| Metric | What it reveals |
|---|---|
| Query latency: p50/p95/p99 | Performance and tail-latency problems |
| Per-shard latency | Slow or overloaded shards |
| Query timeout rate | Requests exceeding deadlines |
| Partial-result rate | Incomplete responses |
| Shard/replica health | Availability problems |
| Replica lag | Stale shard copies |
| Indexing lag | Delayed search visibility |
| Queue depth and oldest-event age | Indexing backlog |
| Indexing failure rate | Worker or search-engine problems |
| DLQ size and age | Events requiring investigation |
| Indexing throughput | Whether workers keep up with incoming changes |

### Diagnose common symptoms

**p99 latency increases but p50 remains stable**
- Investigate slow shards, expensive queries, and resource contention.

**Queue depth continually increases**
- Investigate indexing capacity, worker failures, and search-engine throughput.

**Search results show outdated prices**
- Investigate indexing lag, replica lag, failed events, and version handling.

**Partial-result rate increases**
- Investigate shard health, timeouts, and slow responses.

**Interview principle:** Query performance and index freshness are separate dimensions. Monitor both.

---

## 12. Common Interview Pitfalls

1. Treating the search index as the source of truth.
2. Assuming synchronous indexing guarantees atomic consistency.
3. Assuming asynchronous indexing guarantees eventual convergence without reliable publication and recovery.
4. Confusing near-real-time indexing with eventual consistency.
5. Treating idempotency and event ordering as the same problem.
6. Assuming a Transactional Outbox guarantees exactly-once delivery.
7. Retrying indefinitely without backoff.
8. Assuming a DLQ automatically fixes failed events.
9. Updating stale fields after retrieval without correcting candidate selection.
10. Assuming more shards always improve latency.
11. Assuming local shard rankings automatically produce the correct global ranking.
12. Assuming replication eliminates stale results.
13. Returning partial results without considering completeness requirements.
14. Increasing timeouts without investigating slow shards.
15. Monitoring query latency while ignoring indexing and replica lag.

---

## 13. Quick Interview Decision Table

| Interview question | Key points to cover |
|---|---|
| Why use a search engine? | Full-text retrieval, ranking, specialized indexing |
| How does an inverted index work? | Terms map to posting lists |
| How do you rank results? | TF, IDF, BM25, field weighting |
| How do you support autocomplete? | Prefix matching, debounce, bounded results, stale-response protection |
| How do you handle misspellings? | Fuzzy matching, edit distance, bounded candidate expansion |
| How do you keep the index fresh? | Reliable indexing pipeline and explicit freshness requirements |
| Why use asynchronous indexing? | Lower request latency and independent scaling, with temporary staleness |
| How do you avoid losing events? | Transactional Outbox |
| How do you recover from failures? | Bounded retries, backoff, jitter, DLQ, replay |
| How do you handle duplicate events? | Idempotent processing |
| How do you prevent stale overwrites? | Version checks and atomic update semantics |
| How do you scale the index? | Sharding |
| How does distributed search work? | Fan-out, local retrieval, merging, global ranking |
| What if a shard is slow? | Deadlines, timeouts, diagnosis, possible partial results |
| Why use replicas? | Availability and read capacity |
| What if replicas are stale? | Monitor lag and apply freshness policies |
| What should you monitor? | Query latency, shard health, indexing lag, queue backlog, failures |

---

## 14. Final Memory Sheet

Remember these eight principles:

1. **Retrieval:** An inverted index maps terms to documents.
2. **Relevance:** Matching and ranking are separate concerns.
3. **Quality:** Balance precision, recall, relevance, and latency.
4. **Authority:** The database is the source of truth; the search index is derived.
5. **Reliability:** The Outbox, retries, idempotency, and version checks solve different failure modes.
6. **Distribution:** Sharding distributes the index; replication maintains copies.
7. **Correctness:** Partial results and stale data require explicit business decisions.
8. **Operations:** Monitor query performance and index freshness independently.
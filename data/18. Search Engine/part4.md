# Search Engine — Part 4: Sharding, Replication & Distributed Query Execution

## 1. Why Distribute a Search Index?

A search engine may need to index millions or billions of documents.

As the dataset grows, a single machine may no longer provide sufficient:
- Storage capacity.
- Query throughput.
- Indexing throughput.
- CPU and memory for search operations.

One solution is to distribute the search index across multiple machines.

Two important techniques help achieve this:

- **Sharding:** Divide the index across multiple machines.
- **Replication:** Maintain copies of index data to improve availability and support additional read capacity.

These solve different problems.

### Example

Suppose an e-commerce platform has 100 million products.

Keeping the entire index on one machine may become impractical.

Instead, the search index is divided into multiple shards.

```text
                 Search Index
                      |
          +-----------+-----------+
          |           |           |
          v           v           v
       Shard 1     Shard 2     Shard 3
       Products    Products    Products
       subset A    subset B    subset C
```

Each shard stores and searches a portion of the overall dataset.

The division might use document IDs, a hash function, or another partitioning strategy.

The important point is that each shard owns only a portion of the complete index.

### Benefits

- Storage is distributed across machines.
- Query work can happen in parallel.
- Indexing work can be distributed.
- Capacity can grow by adding resources and redistributing data.

### Trade-offs

Sharding introduces coordination overhead.

A query that previously ran on one machine may now require:
1. Sending the query to multiple shards.
2. Waiting for shard responses.
3. Combining candidate results.
4. Returning the globally ranked results.

**Principle:** Sharding increases capacity, but it turns a local search operation into a distributed query.

---

## 2. How a Distributed Search Query Works

A distributed search system commonly uses a query coordinator to manage distributed query execution.

The coordinator receives a query, sends it to the relevant shards, collects their results, and merges the candidates.

### Architecture

```text
                       User
                         |
                         v
                  Search Application
                         |
                         v
                  Query Coordinator
                         |
              +----------+----------+
              |          |          |
              v          v          v
           Shard 1    Shard 2    Shard 3
              |          |          |
              v          v          v
          Local Search Local Search Local Search
              |          |          |
              +----------+----------+
                         |
                         v
                 Merge Candidates
                         |
                         v
                 Global Ranking
                         |
                         v
                    Top Results
```

This is a conceptual architecture; the exact responsibilities of the application and coordinator depend on the search engine.

### Step-by-step execution

Suppose the user searches for:

```text
wireless headphones
```

**Step 1: Receive the query**

The coordinator receives the search request and its relevant parameters, such as filters, sort order, and result limit.

**Step 2: Fan out the query**

The coordinator sends the query to the shards that need to participate.

In a broadly distributed full-text index, this often means querying every shard in the relevant index.

**Step 3: Search locally**

Each shard searches its own documents and returns candidate results with relevant metadata, such as document IDs and scores.

**Step 4: Merge candidates**

The coordinator combines the results from the participating shards.

**Step 5: Rank and return**

The system determines the global ordering and returns the requested top results.

### Example

Suppose each shard returns its top three candidates.

| Shard | Local results by score |
|---|---|
| Shard 1 | A: 9.2, B: 7.5, C: 6.1 |
| Shard 2 | D: 9.7, E: 8.0, F: 5.8 |
| Shard 3 | G: 8.9, H: 7.8, I: 6.5 |

The coordinator merges the candidates:

```text
D: 9.7
A: 9.2
G: 8.9
E: 8.0
H: 7.8
B: 7.5
I: 6.5
C: 6.1
F: 5.8
```

If the user requested five results, the coordinator can return the top five from this merged candidate set.

This example assumes that the scores are comparable across shards and that each shard returned enough candidates to determine the global top results.

Real ranking can be more complicated: distributed scoring, shard-local statistics, filters, and pagination can affect how candidate results are selected and merged.

### Interview takeaway

Do not say that each shard independently returns the final global answer.

Each shard searches locally. The coordinator combines results to produce the overall answer.

**Principle:** Distributed search requires both local retrieval and global result coordination.

---

## 3. Query Fan-Out: Parallelism Versus Overhead

Query fan-out allows multiple shards to search in parallel.

This can reduce the time required to search a large distributed index compared with processing the entire dataset sequentially on one machine.

However, fan-out also introduces network and coordination overhead.

### Example

A query is sent to four shards.

```text
                   Coordinator
                 /   /   \   \
                v   v     v   v
               S1  S2     S3  S4
                \   \     /   /
                 \   \   /   /
                  v   v v   v
                   Merge
```

If each shard searches independently, the coordinator can collect results concurrently.

But the coordinator still needs to:
- Send requests.
- Manage responses.
- Handle timeouts and failures.
- Merge results.
- Apply global result limits and ranking requirements.

### What happens as shard count increases?

More shards can provide more aggregate storage and processing capacity.

However, increasing the number of shards can also increase:
- Network requests per query.
- Coordination overhead.
- The number of responses to merge.
- The probability that at least one shard is slow.
- Operational complexity.

Therefore, more shards do not automatically mean faster queries.

### When does fan-out become expensive?

Consider a search that must contact 30 shards instead of 3.

Even if each shard is individually fast, the coordinator must manage more responses.

A single slow shard can also delay completion if the system waits for every shard.

**Principle:** Choose shard count based on data volume, indexing and query workload, and operational overhead—not just the desire to maximize parallelism.

---

## 4. What Happens When One Shard Is Slow?

Distributed requests are affected by tail latency.

Suppose a query fans out to four shards:

| Shard | Response time |
|---|---:|
| Shard 1 | 30 ms |
| Shard 2 | 35 ms |
| Shard 3 | 40 ms |
| Shard 4 | 900 ms |

If the coordinator waits for every shard, the overall query may take approximately 900 ms plus coordination overhead.

The three fast shards cannot compensate for the fourth shard if the response requires all four.

This is why distributed systems pay close attention to high-percentile latency, such as p95 and p99.

### Why might a shard be slow?

Possible causes include:
- High CPU or memory pressure.
- Expensive queries.
- Uneven data distribution.
- Disk I/O contention.
- Background indexing activity.
- Network problems.
- A temporarily unhealthy machine.

### Mitigation strategies

**1. Set bounded deadlines**

The coordinator should not wait indefinitely for a shard.

A request should have an overall deadline, with time allocated to fan-out, shard execution, and result merging.

**2. Use per-shard timeouts**

A shard request should have a bounded execution time that fits within the overall query deadline.

**3. Return partial results when appropriate**

If the product can tolerate incomplete results, the coordinator may return results from healthy shards rather than waiting for a slow or unavailable shard.

**4. Investigate skew and overload**

Repeatedly slow shards may indicate uneven data distribution or a resource bottleneck that requires corrective action.

### Important trade-off: Partial results

Suppose the slow shard contains some of the most relevant products.

Returning results from only the other shards may reduce latency, but the response may omit the best matches.

The system must balance:
- Latency.
- Availability.
- Completeness.
- Ranking quality.

Partial results should not be treated as equivalent to complete results.

If the system returns partial results, the response should indicate incompleteness when the API or product supports doing so.

### Interview scenario

**Question:** One shard is consistently slower than the others. Would you immediately increase the timeout?

Not necessarily.

Increasing the timeout might reduce timeout errors, but it can also increase user-facing latency and resource consumption.

First investigate whether the problem is caused by skew, expensive queries, resource saturation, or infrastructure issues. Then choose a mitigation based on the root cause and the product's latency requirements.

**Principle:** Timeouts bound the impact of slow components; they do not fix the underlying bottleneck.

---

## 5. Partial Results Versus Waiting for Completeness

The decision to return partial results depends on the consequences of incomplete search results.

### Option A: Wait for all required shards

```text
Send Query to Shards
          |
          v
Wait for Required Responses
          |
          v
Merge Results
          |
          v
Return Complete Results
```

**Advantages**
- Better completeness.
- More reliable global ranking across participating shards.

**Disadvantages**
- A slow shard can increase latency.
- An unavailable shard can prevent a complete response.
- Waiting too long can violate the user-facing deadline.

### Option B: Return partial results

```text
Send Query to Shards
          |
          v
Collect Available Responses
          |
          v
Deadline Reached
          |
          v
Merge Available Results
          |
          v
Return Partial Results
```

**Advantages**
- Can improve latency.
- Can preserve some search functionality during partial failures.

**Disadvantages**
- Some documents are not considered.
- The globally best matches may be missing.
- Ranking and result counts may be incomplete.

### How should we decide?

For a general product-discovery interface, returning useful results quickly may be better than showing an error because one shard is slow.

For a search workflow requiring complete results, partial responses may be unacceptable.

The correct behavior depends on the business requirement.

**Principle:** Partial results are a product-level correctness trade-off, not merely an infrastructure optimization.

---

## 6. Replication: Improving Availability and Read Capacity

Sharding distributes different portions of the index.

Replication maintains multiple copies of index data.

Consider three shards, each with a replica:

```text
              Distributed Search Index
                         |
           +-------------+-------------+
           |             |             |
           v             v             v
        Shard 1       Shard 2       Shard 3
           |             |             |
           v             v             v
        Replica 1     Replica 2     Replica 3
```

This is a simplified illustration. Actual systems may have multiple replicas per shard and may distribute copies across different machines or failure domains.

### Why use replicas?

**1. Availability**

If a shard copy becomes unavailable, another copy may be able to serve queries, assuming the search engine can route requests to a healthy replica.

**2. Read scalability**

Search traffic can be distributed across shard copies.

This can increase aggregate query-serving capacity, provided the replicas have sufficient resources and the workload can be distributed effectively.

**3. Failure recovery**

Replicas can help the system continue operating when a machine or other infrastructure component fails.

### Trade-offs

Replication requires:
- Additional storage.
- Resources to maintain and recover copies.
- Propagation of indexing updates.
- Monitoring of replica health and lag.

Replication improves resilience, but it does not eliminate every failure mode.

For example, replicas may share an underlying infrastructure dependency, or every copy may be affected by an application-level indexing bug.

**Principle:** Sharding primarily distributes data and workload; replication primarily provides additional copies for availability and read capacity.

---

## 7. Replica Lag and Stale Search Results

Replicas need to receive and apply indexing updates.

If a replica has not yet applied the latest update, it may return stale results.

### Example

A product's price changes:

```text
Primary copy:
Price = $70, Version = 3

Replica:
Price = $80, Version = 2
```

If a query is served by the replica before it catches up, the user may see the older price.

This is replica lag.

The exact consistency guarantees depend on the search engine and its replication and refresh behavior.

### Why replica lag matters

Stale replicas can affect:
- Displayed values.
- Filtering.
- Ranking.
- Product availability.
- Search visibility after a new document is added.

As with asynchronous indexing, simply correcting the displayed value may not fix candidate selection or filtering.

### Possible mitigations

Depending on the search engine and business requirements, a system may:
- Monitor replica lag.
- Avoid routing certain requests to replicas known to be too stale.
- Wait for indexing or replication to reach an acceptable state.
- Use an authoritative database path for specific freshness-sensitive requests.

These strategies have different latency, availability, and complexity costs.

### Important distinction

There are two separate sources of staleness:

**Indexing lag**

The database has been updated, but the search index has not caught up.

**Replica lag**

The indexing system has updated one copy, but another copy has not yet caught up.

Both can produce stale results, but they occur at different points in the data propagation path.

**Principle:** Replicas improve resilience and capacity, but freshness depends on how quickly updates become available on the copy serving the query.

---

## 8. Putting It Together: A Distributed Search Architecture

Consider a product-search service with the following requirements:
- Search millions of products.
- Support concurrent queries.
- Index product changes asynchronously.
- Continue serving searches during some infrastructure failures.
- Keep query latency within a defined deadline.

A possible architecture is:

```text
                        USERS
                          |
                          v
                   Search Application
                          |
                          v
                   Query Coordinator
                          |
             +------------+------------+
             |            |            |
             v            v            v
          Shard 1       Shard 2       Shard 3
             |            |            |
             v            v            v
          Replica       Replica       Replica
             |            |            |
             +------------+------------+
                          |
                          v
                  Merge Search Results
                          |
                          v
                    Ranked Response


                INDEXING DATA FLOW

Application
     |
     v
Database (Source of Truth)
     |
     +---- Product Update
     |
     +---- Transactional Outbox
                    |
                    v
              Event Publisher
                    |
                    v
                Event Queue
                    |
                    v
              Indexing Worker
                    |
                    v
              Search Index
             /      |      \
            v       v       v
         Shard 1  Shard 2  Shard 3
            |       |       |
            v       v       v
         Replicas / Copies
```

This is a logical architecture, not a prescription for a particular vendor's topology. In a real implementation, the search engine may manage shard placement, replication, query coordination, and index propagation internally.

### Request path

1. The application receives the user's query.
2. The query coordinator sends it to the relevant shards or shard copies.
3. The shards search their local indexes.
4. The coordinator collects responses within the configured deadline.
5. Candidate results are merged and ranked.
6. The application returns complete or explicitly partial results, depending on the system's policy.

### Indexing path

1. The application updates the product in the database.
2. The product update and outbox event are committed together.
3. The publisher sends the event to the queue.
4. An indexing worker consumes the event.
5. The worker applies duplicate-safe, version-aware updates.
6. The search engine propagates changes to the appropriate shard copies.
7. The updated document becomes searchable according to the engine's indexing and refresh behavior.

### Failure handling

If a worker fails, retry the event according to a bounded retry policy and route repeatedly failing events to a DLQ.

If a shard becomes slow, enforce deadlines and decide whether partial results are acceptable.

If a replica becomes unavailable, route requests to a healthy copy when possible.

If an update arrives out of order, prevent an older version from overwriting a newer one.

These mechanisms address different failure modes and should not be treated as substitutes for one another.

---

## 9. What Should We Monitor?

A distributed search system needs visibility into both query serving and index freshness.

| Metric | Why it matters |
|---|---|
| Query latency: p50, p95, p99 | Shows typical performance and tail-latency problems |
| Per-shard latency | Identifies slow or overloaded shards |
| Query timeout rate | Reveals queries exceeding their deadlines |
| Partial-result rate | Shows how often queries return incomplete results |
| Shard health | Reveals unavailable or unhealthy shard copies |
| Replica health and lag | Identifies unavailable or stale replicas |
| Indexing lag | Measures delay between source changes and searchable updates |
| Queue depth and age of oldest event | Reveals indexing backlog |
| Indexing failure rate | Shows whether workers are failing to apply changes |
| DLQ size and age | Highlights events that require investigation |
| Version conflicts or rejected stale updates | Helps detect duplicate or out-of-order processing |
| Indexing throughput | Shows whether workers can keep up with incoming changes |

### How to reason from symptoms

**Symptom: p99 latency increases, but p50 remains stable.**

Investigate slow shards, tail latency, expensive queries, and resource contention.

**Symptom: Queue depth grows continuously.**

Indexing throughput may be insufficient, workers may be failing, or the search engine may be unable to keep up.

**Symptom: Searches return stale prices.**

Determine whether the source-to-index pipeline is delayed, the serving replica is behind, or the update was rejected or lost.

**Symptom: Partial-result rate increases.**

Investigate shard health, query deadlines, and the frequency of slow or unavailable shard responses.

**Principle:** Monitor query performance and data freshness separately; a fast search engine can still return stale data.

---

## Part 4: Quick Revision

| Concept | Key takeaway |
|---|---|
| Sharding | Distributes portions of the index across machines |
| Query coordinator | Coordinates distributed search execution |
| Query fan-out | Sends a query to multiple relevant shards |
| Candidate merging | Combines shard results into a global result set |
| Global ranking | Determines the overall ordering of candidates |
| Tail latency | Slow components can dominate distributed request latency |
| Query deadline | Bounds how long the system waits |
| Partial results | Trade completeness for availability and latency |
| Replication | Maintains copies of shard data |
| Read scalability | Replicas can distribute query load |
| Replica lag | A replica has not yet applied the latest updates |
| Indexing lag | Changes have not yet reached the searchable index |
| Shard health | Indicates whether shard copies are usable |
| Per-shard latency | Helps identify localized performance problems |
| Queue depth | Helps reveal whether indexing is falling behind |

### Five principles to remember

1. Sharding distributes the index; replication maintains additional copies.
2. Distributed search requires fan-out, candidate merging, and global result handling.
3. A single slow shard can dominate tail latency if the coordinator waits for every shard.
4. Partial results improve availability and latency at the cost of completeness.
5. Query performance and index freshness are separate dimensions that both need monitoring.

## 10. Additional Concepts: Prefix Indexes, N-Grams & Autocomplete

### 10.1 Prefix Indexes

A prefix index supports efficient retrieval of terms that begin with a given sequence of characters.

Example:

```text
Indexed terms:
headphones
headband
headset
keyboard

Query: "head"

Matches:
headphones
headband
headset
```

**Use case:** Autocomplete and search-as-you-type.

**Trade-off:** A short, common prefix can match many terms, increasing the candidate set and potentially reducing precision.

A trie is one possible structure for efficient prefix lookup. Search engines can use other indexing structures or specialized field types.

### 10.2 N-Grams

An n-gram is a sequence of `n` consecutive characters or tokens.

For character trigrams (`n = 3`):

```text
Word: headphones

Trigrams:
hea, ead, adh, dph, pho, hon, one, nes
```

N-grams help identify candidates for partial or substring matching.

#### Example: Searching for "phone"

```text
Indexed word: headphones

Query: phone

Query trigrams:
pho, hon, one
```

The indexed word shares all three trigrams with the query. The system can identify `headphones` as a candidate and verify whether the full substring matches.

**Important:** Sharing n-grams does not guarantee that the complete query appears in a candidate. Verification may be necessary.

#### Word-level versus document-level n-grams

N-grams can be generated separately for each word or across a larger text field.

**Word-level example:**

```text
Text: wireless headphones

Generate trigrams separately:

wireless   -> wir, ire, rel, ele, les, ess
headphones -> hea, ead, adh, dph, pho, hon, one, nes
```

This representation does not generate trigrams across the space between the words.

**Whole-field example:**

```text
Text: wireless headphones

Additional cross-boundary trigrams:
"ss "
"s h"
```

Because the entire field is treated as one string, trigrams can span word boundaries.

This can help identify substring matches that cross spaces, depending on the matching rules.

| Approach | Main characteristic |
|---|---|
| Word-level n-grams | Generates n-grams separately for each word |
| Whole-field n-grams | Can generate n-grams across spaces and word boundaries |

Actual behavior depends on the analyzer and index configuration. Some implementations tokenize text, preserve spaces, or use other processing rules.

**Trade-offs of n-grams:**
- Improve partial and substring matching.
- Can increase index size and indexing work.
- Common n-grams may match many candidates.
- May require verification to eliminate false matches.

### 10.3 Autocomplete-Oriented Indexes

An autocomplete-oriented index or completion structure is designed specifically to retrieve useful suggestions quickly as a user types.

Example:

```text
Indexed suggestions:
Wireless Headphones
Wireless Mouse
Wireless Keyboard
Wired Headphones

Query: "wire"

Possible suggestions:
Wireless Headphones
Wireless Mouse
Wireless Keyboard
```

Suggestions can be ranked using relevance, popularity, or other useful signals.

An autocomplete system may use:
- Prefix-oriented indexes.
- Precomputed suggestions.
- Popularity signals.
- Specialized search-engine fields or completion structures.

**Key distinction:** Prefix matching is a matching technique; autocomplete is the broader task of retrieving and ranking suggestions.

### 10.4 Specialized Search-Engine Fields

A search engine can index the same source data differently to support different search behaviors.

Example product:

```json
{
  "name": "Wireless Headphones",
  "description": "Noise cancelling Bluetooth headphones"
}
```

Conceptually, the index might support:

| Field | Purpose |
|---|---|
| `name` | Full-text search and relevance ranking |
| `description` | Full-text search |
| `name_prefix` | Prefix matching |
| `name_ngram` | Partial or substring matching |
| `name_suggest` | Autocomplete |

These are illustrative field names, not universal search-engine types.

**Trade-off:** Specialized fields can improve query efficiency but increase storage requirements and indexing work.

### 10.5 Prefix Matching vs. Substring Matching vs. Fuzzy Matching

These techniques solve different problems.

| Technique | Query | Indexed term | Why it matches |
|---|---|---|---|
| Prefix matching | `head` | `headphones` | The term begins with `head` |
| Substring matching | `phone` | `headphones` | The term contains `phone` |
| Fuzzy matching | `hedphones` | `headphones` | The spellings are similar despite a typo |
| Synonym matching | `laptop` | `notebook computer` | The terms are related in meaning |

**Important correction:** Searching for `head` and returning `headphones`, `headband`, and `headset` demonstrates prefix matching, not fuzzy matching. No spelling error needs to be corrected.

### 10.6 Why Fuzzy Matching Can Hurt Precision and Performance

Fuzzy matching tolerates spelling differences, often using edit distance.

For example:

```text
Query: hedphones
Candidate: headphones
```

The strings are sufficiently similar to be considered a possible match.

However, broad fuzzy matching can:
- Generate too many candidates.
- Introduce irrelevant results, reducing precision.
- Increase CPU consumption and query latency.

Possible controls include:
- Limiting edit distance.
- Restricting candidate expansion.
- Applying fuzzy matching selectively.
- Using it when exact matching returns few or no results.

**Interview principle:** Do not use fuzzy matching for every partial query. Use prefix matching for incomplete words, substring matching for text within words, and fuzzy matching for spelling variations.

---

## 11. Choosing the Right Matching Strategy

| Requirement | Possible approach | Main trade-off |
|---|---|---|
| Match terms beginning with a prefix | Prefix index | Short prefixes may return many candidates |
| Match text inside a word | N-gram index or another substring-search strategy | Additional index storage and processing |
| Suggest completions while typing | Autocomplete-oriented index | Requires effective suggestion ranking |
| Tolerate misspellings | Fuzzy matching | Candidate expansion and query cost |
| Match related meanings | Synonym expansion | Risk of irrelevant matches |

### Final principles

1. Choose index structures based on the required matching behavior.
2. N-grams help identify candidates; they do not automatically prove a full substring match.
3. Autocomplete requires useful suggestion retrieval and ranking, not merely prefix matching.
4. Prefix matching and fuzzy matching are different techniques.
5. Evaluate precision, recall, latency, and index storage together.
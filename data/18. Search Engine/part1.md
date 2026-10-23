# Search Engine — System Design Interview Handbook

# Part 1: Fundamentals, Indexing & Relevance

## 1. Why Do We Need a Dedicated Search Engine?

### The problem

Consider an e-commerce platform with 100 million products.

Users expect to search by product name, brand, category, and description. They also expect relevant results when their queries contain partial words, spelling mistakes, or synonyms.

For example, a user searches for:

"wireless noise cancelling headphones"

The catalog contains:

"Sony WH-1000XM5 Wireless Headphones with Active Noise Cancellation"

The system should find this product even though the query isn't an exact match for the complete product title.

### What makes search challenging?

A production search system may need to support:

- Full-text search across multiple fields.
- Relevance-based ranking.
- Partial matching and autocomplete.
- Typo tolerance.
- Stemming and synonyms.
- Different weights for different fields.
- Filtering by price, category, and availability.
- Low-latency queries over a large dataset.

A conventional database index accelerates specific access patterns, but it doesn't automatically provide all these capabilities.

### Database versus search engine

**Database**
- Source of truth for product data.
- Handles transactions and structured queries.
- Supports updates and data integrity.
- Provides indexes for defined lookup patterns.

**Search engine**
- Maintains a search-optimized index.
- Supports full-text retrieval and relevance ranking.
- Provides specialized text-matching capabilities.
- Distributes search workloads across machines when necessary.

### Architecture

User → Application → Search Engine

The application may also access the database for authoritative product data and transactional operations.

### Example

A database can efficiently retrieve a product by its unique ID.

However, a search for "wireless headphones suitable for travel" may require text analysis, matching across multiple fields, and ranking.

A dedicated search engine is useful when these search requirements justify its additional operational and synchronization complexity.

**Interview principle:** The database is the source of truth; the search engine optimizes search retrieval and ranking.

A dedicated search engine isn't mandatory for every application. A database may be sufficient for smaller datasets or simpler requirements.

---

## 2. Full-Text Search

### What is full-text search?

Full-text search retrieves documents based on searchable terms within their text rather than requiring an exact match against an entire field.

Consider these products:

- Product A: Wireless Noise Cancelling Headphones
- Product B: Wireless Bluetooth Speaker
- Product C: Noise Cancelling Earbuds

A user searches for:

"wireless headphones"

The engine can identify Product A because its text contains both terms.

Depending on the query configuration, other products might also qualify through different matching rules.

### Exact matching versus full-text search

An exact lookup might require a field to equal a supplied value.

Full-text search analyzes text into searchable terms and retrieves documents based on those terms.

For example:

Query:
"wireless headphones"

Analyzed terms:
["wireless", "headphones"]

The search engine uses these terms to locate candidate documents.

### Full-text search versus substring matching

These are different capabilities.

Suppose the indexed product title contains:

"Wireless Headphones"

A substring query for "head" could match the text directly.

However, a conventional full-text index might contain "headphones" as a token without containing a separate token for "head".

Supporting prefix matching may require a specialized index or query strategy.

Similarly, matching an arbitrary substring inside a word can require different techniques.

**Interview principle:** Full-text search operates on analyzed text terms. It is not automatically equivalent to exact matching, prefix matching, or arbitrary substring matching.

---

## 3. Inverted Index

### Definition

An inverted index maps each searchable term to the documents containing that term.

It is a fundamental data structure used by search engines to retrieve documents efficiently.

### Step 1: Start with documents

Consider three products:

Document 1:
"Wireless noise cancelling headphones"

Document 2:
"Wireless Bluetooth speaker"

Document 3:
"Noise cancelling earbuds"

### Step 2: Analyze the documents

After tokenization and normalization, the documents might contain:

Document 1:
[wireless, noise, cancelling, headphones]

Document 2:
[wireless, bluetooth, speaker]

Document 3:
[noise, cancelling, earbuds]

### Step 3: Build the inverted index

| Term | Documents |
|---|---|
| wireless | [1, 2] |
| noise | [1, 3] |
| cancelling | [1, 3] |
| headphones | [1] |
| bluetooth | [2] |
| speaker | [2] |
| earbuds | [3] |

Each list of documents associated with a term is called a posting list.

### Step 4: Execute a query

Suppose the user searches for:

"wireless headphones"

The engine looks up:

wireless → [1, 2]

headphones → [1]

For a query requiring both terms, the intersection contains Document 1.

The engine can then score that document and compare it with other candidates.

### Why is it called inverted?

A document-oriented representation looks like:

Document → Terms

An inverted index reverses that relationship:

Term → Documents

Instead of scanning every document to find a term, the engine uses the corresponding posting list.

### Why is it efficient?

Imagine searching 100 million products.

Scanning every product's text for every query would be expensive.

An inverted index allows the engine to locate candidates using the query terms' posting lists.

However, common terms can still have very large posting lists. Efficient indexing doesn't eliminate every source of query cost.

### What else can a posting list contain?

A production search index may store additional information, including:

- Document identifiers.
- Term frequencies.
- Term positions.

Term positions can support phrase queries, while frequency information can contribute to ranking.

The exact representation depends on the search engine.

### Important limitation

An inverted index identifies documents containing searchable terms. It doesn't automatically determine which document is the best result.

**Interview principle:** The inverted index makes term-based retrieval efficient; relevance ranking orders the retrieved candidates.

---

## 4. Relevance Ranking

### Why matching isn't enough

Suppose the user searches for:

"wireless headphones"

Possible results include:

1. Wireless Noise Cancelling Headphones.
2. Wireless Bluetooth Speaker.
3. Premium Headphones.
4. Wireless Phone Charger.

Depending on the query rules, multiple documents may match.

However, they aren't equally relevant.

A search engine calculates relevance scores and generally returns the highest-scoring candidates first.

### Signals used in ranking

A ranking function may consider:

**Term frequency**
How often does a query term appear in the document?

**Term rarity**
How informative is the term across the collection?

**Document length**
Does the document contain substantially more text than other documents?

**Field importance**
Does a term appear in the title, brand, category, or description?

Other application-specific signals may also be used.

### Matching versus ranking

Matching determines which documents satisfy the query's retrieval conditions.

Ranking determines the relative order of those documents.

For example, two products may both contain "Sony" and "headphones", but one may mention Sony only in its description while the other has Sony in its title and brand fields.

The second product should generally rank higher.

### Why ranking matters

Users typically inspect only a small portion of the results.

Returning thousands of matching documents isn't sufficient if the most relevant results are buried far down the list.

**Interview principle:** Search quality depends on retrieving appropriate candidates and ranking them effectively.

---

## 5. TF-IDF: Term Frequency and Term Rarity

TF-IDF is a classic approach to estimating the importance of a term in a document.

It combines two ideas:

1. How frequently the term appears in a particular document.
2. How informative the term is across the document collection.

### A. Term Frequency (TF)

Term frequency measures how often a term appears in a document.

Consider:

Document A:
"Wireless headphones with wireless connectivity and wireless audio."

Document B:
"Wireless headphones."

The term "wireless" occurs more frequently in Document A.

Higher term frequency can increase the term's contribution to a document's score.

However, repetition doesn't guarantee relevance. Repeating a word excessively shouldn't automatically make a document the best result.

### B. Inverse Document Frequency (IDF)

IDF captures how rare a term is across the document collection.

Suppose we have 100 million products:

| Term | Products containing the term |
|---|---:|
| wireless | 40 million |
| headphones | 5 million |
| wh-1000xm5 | 10,000 |

"Wireless" is common, so its presence doesn't distinguish one product strongly from the rest of the catalog.

"WH-1000XM5" is much more specific. If a user searches for that model identifier, a document containing it is a strong candidate.

This is the intuition behind IDF: terms occurring in fewer documents generally provide more discriminative information.

### Conceptual formula

TF-IDF combines:

Term frequency within a document

multiplied by

Inverse document frequency across the collection.

This is a conceptual description; exact formulas and normalization vary by implementation.

### How does this improve search?

Consider the query:

"wireless headphones wh-1000xm5"

The term "wireless" is common, while "wh-1000xm5" is highly specific.

The model identifier can contribute much stronger evidence that a document matches the user's intended product.

### Important nuance

A rare term isn't automatically relevant. A typo or unrelated identifier may also be rare.

Term rarity is one ranking signal among several.

**Interview principle:** Common terms usually provide less discriminative information than rare, informative terms.

---

## 6. BM25 and Document-Length Normalization

BM25 is a widely used relevance-ranking function that builds on similar term-weighting ideas.

It considers factors such as:

- Term frequency within a document.
- Term rarity across the collection.
- Document length.

### Why does document length matter?

Consider two documents.

Document A:
"Wireless headphones with noise cancellation."

Document B:
A 5,000-word article about electronics that mentions wireless headphones once among many unrelated topics.

The longer document has more opportunities to contain the query terms.

If relevance scoring rewarded term occurrences without accounting for document length, long documents could gain an unfair advantage simply because they contain more text.

BM25 incorporates document-length normalization to reduce this bias.

### What does normalization mean?

The ranking function accounts for document length relative to the collection's typical document length.

This helps distinguish a document that is relevant because its content matches the query from one that matches partly because it contains a large amount of text.

Length normalization doesn't mean long documents are always penalized. It adjusts the scoring so length alone doesn't determine relevance.

### TF-IDF versus BM25

| Aspect | TF-IDF | BM25 |
|---|---|---|
| Term frequency | Uses term frequency | Uses a more controlled term-frequency contribution |
| Term rarity | Uses inverse document frequency | Uses inverse document frequency |
| Document length | Depends on the implementation's normalization | Explicitly accounts for document length |
| Role | Classic term-weighting approach | Widely used relevance-scoring function |

The exact behavior depends on the formula and configuration.

In interviews, you generally need to explain the intuition rather than derive BM25's mathematical formula.

**Interview principle:** Relevance should reflect the significance of matching terms, not merely how much text a document contains.

---

## 7. Tokenization and Text Analysis

Before building an inverted index, the search engine must transform document text into searchable terms.

This process is called text analysis. Tokenization is one component of it.

### Example

Input:

"Wireless Noise-Cancelling Headphones!"

Possible analyzed terms:

["wireless", "noise", "cancelling", "headphones"]

The actual result depends on the configured analyzer.

### Common analysis operations

**Tokenization**

Splits text into searchable terms.

**Lowercasing**

Normalizes capitalization:

Wireless → wireless

WIRELESS → wireless

**Punctuation handling**

Processes punctuation consistently.

For example, "noise-cancelling" may be split into separate terms, depending on the analyzer.

**Stop-word processing**

Some analyzers remove or specially handle common words such as "the" and "and".

This must be configured carefully because stop words can matter in some queries.

**Stemming or normalization**

Handles related word forms.

**Synonym processing**

Applies configured term equivalences.

### Index-time analysis

The engine analyzes document text before adding its terms to the index.

### Query-time analysis

The engine analyzes the user's query before searching the index.

For example:

Indexed title:
"Wireless Headphones"

Indexed terms:
["wireless", "headphones"]

User query:
"wireless headphones"

Query terms:
["wireless", "headphones"]

The terms are compatible, allowing the engine to retrieve the document.

### What happens if analysis is inconsistent?

Suppose a document is indexed using one normalization rule, but the query analyzer produces incompatible terms.

The engine may fail to find a relevant document.

Overly aggressive normalization can cause a different problem: unrelated terms may become indistinguishable.

**Interview principle:** Design index-time and query-time analysis together so equivalent text maps to compatible searchable terms.

---

## 8. Stemming and Synonyms

Stemming and synonyms both improve matching flexibility, but they solve different problems.

### A. Stemming

Stemming normalizes related word forms toward a common stem.

Depending on the algorithm:

running → run

runs → run

The purpose is to allow related word forms to match without treating every variation as an entirely unrelated term.

For example, a search for "run shoes" may match a document containing "running shoes" if the configured analysis rules normalize the forms compatibly.

The main benefit is improved matching and recall. Space savings may occur, but they aren't the primary reason to use stemming.

### B. Synonyms

Synonyms handle different words or phrases that the application considers equivalent.

Examples:

TV ↔ television

Cellphone ↔ mobile phone

A product catalog may define domain-specific mappings based on how customers describe products.

Unlike stemming, synonym rules encode domain knowledge.

### Index-time versus query-time synonym expansion

**Index-time expansion**
- Applies synonym rules while indexing documents.
- May increase index size.
- Changing rules may require reindexing, depending on the implementation.

**Query-time expansion**
- Expands the user's query during search.
- Adds processing to the query path.
- Makes synonym rules easier to change without rebuilding the entire index.

Query-time expansion isn't automatically better. Query volume, latency, index size, and how frequently synonym rules change all matter.

### Example trade-off

Suppose a product team introduces a new synonym:

"mobile phone" ↔ "cellphone"

With query-time expansion, the mapping can often be changed without rebuilding the document index.

With index-time expansion, changing the indexed representation may require reindexing.

**Interview principle:** Stemming handles related word forms; synonyms encode semantic equivalences. Choose the expansion strategy according to the workload and operational requirements.

---

## 9. Field Weighting

A product document contains multiple fields:

Title:
"Sony WH-1000XM5 Wireless Headphones"

Brand:
"Sony"

Category:
"Headphones"

Description:
"Premium noise cancelling headphones with wireless connectivity."

A user searches for:

"Sony headphones"

The query may match terms across multiple fields.

However, a match in the title or brand is usually stronger evidence of relevance than a mention buried in the description.

### Example

Product A:
- Title: Sony Wireless Headphones
- Brand: Sony

Product B:
- Title: Premium Headphones
- Brand: Generic
- Description: Compatible with Sony devices

Product A should generally rank higher for "Sony headphones".

### Assigning field weights

An illustrative configuration might be:

| Field | Relative importance |
|---|---|
| Title | High |
| Brand | High |
| Category | Medium |
| Description | Lower |

The actual weights depend on the application's search requirements and should be evaluated against real queries.

### Combining ranking signals

Field weighting works alongside term rarity, term frequency, and document-length normalization.

For example:
- A rare model identifier can strongly distinguish a product.
- A title match may be more important than a description match.
- Length normalization can reduce the unfair advantage of very long descriptions.

The ranking function combines these signals according to its configuration.

**Interview principle:** A matching term's location matters. Field weighting helps align ranking with user intent.

---

## 10. End-to-End Search Pipeline

Let's combine the concepts.

A product exists in the database:

Product ID: 123

Title:
"Sony WH-1000XM5 Wireless Headphones"

Brand:
"Sony"

Category:
"Headphones"

Description:
"Premium noise cancelling headphones."

### Step 1: Analyze product text

The search engine processes the searchable fields using configured analysis rules.

### Step 2: Build the inverted index

The engine records which documents contain each searchable term.

For example:

wireless → [123, ...]

headphones → [123, ...]

sony → [123, ...]

### Step 3: Analyze the user's query

The user enters:

"Sony wireless headphones"

The query analyzer produces compatible searchable terms.

### Step 4: Retrieve candidate documents

The engine consults the inverted index and identifies matching candidates.

### Step 5: Calculate relevance scores

The engine evaluates signals such as term frequency, term rarity, document length, and field importance.

### Step 6: Return ranked results

The highest-scoring candidates are returned to the application.

### Logical architecture

Product data → Text analysis → Inverted index

User query → Query analysis → Candidate retrieval → Relevance scoring → Ranked results

This represents the logical flow. It doesn't require every stage to be a separate physical service.

---

## 11. Interview Pitfalls

**Pitfall 1: Treating search as exact matching**

Full-text search operates on analyzed terms, and specialized structures may be needed for prefix or substring matching.

**Pitfall 2: Assuming the inverted index determines relevance**

The inverted index retrieves candidates; ranking determines their order.

**Pitfall 3: Assuming rare terms are always relevant**

Rarity is useful, but it is only one ranking signal.

**Pitfall 4: Treating long documents as inherently irrelevant**

Length normalization prevents document length alone from dominating relevance.

**Pitfall 5: Confusing stemming with synonyms**

Stemming handles related word forms. Synonyms handle different words or phrases considered equivalent.

**Pitfall 6: Giving every field equal importance**

Title and brand matches may provide stronger evidence of relevance than description matches.

**Pitfall 7: Assuming a dedicated search engine is always necessary**

A database may be sufficient for simpler requirements. Justify the additional search infrastructure based on capabilities, scale, performance, and operational trade-offs.

---

## Part 1: Quick Revision

| Concept | Key takeaway |
|---|---|
| Dedicated search engine | Optimizes search retrieval and ranking |
| Full-text search | Searches analyzed text terms |
| Inverted index | Maps terms to documents |
| Posting list | Documents associated with a term |
| TF | Term frequency within a document |
| IDF | Term rarity across the collection |
| BM25 | Ranking function accounting for term frequency, rarity, and length |
| Tokenization | Splits text into searchable terms |
| Text analysis | Processes text for indexing or querying |
| Stemming | Normalizes related word forms |
| Synonyms | Map terms using configured equivalence rules |
| Field weighting | Gives different importance to different fields |

### Five principles to remember

1. The database is the source of truth; the search engine optimizes retrieval and ranking.
2. The inverted index makes term-based retrieval efficient.
3. Matching and ranking are separate responsibilities.
4. Index-time and query-time analysis must work together.
5. Relevance depends on multiple signals, including term rarity, document length, and field importance.
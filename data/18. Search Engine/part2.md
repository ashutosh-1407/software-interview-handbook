# Search Engine — Part 2: Advanced Search & Matching

## 1. Partial Matching and Autocomplete

### The problem

Users don't always enter complete search terms. They may type a few characters and expect suggestions immediately.

For example, a user types:

`wireless head`

They expect suggestions such as:
- Wireless Headphones
- Wireless Headsets
- Wireless Headphone Stand

A conventional full-text inverted index may contain `headphones` as a complete token, but not a separate token for `head`.

We therefore need a way to match partial terms efficiently.

### How does partial matching work?

Partial matching allows an incomplete term to match a longer term.

For example:

```text
User input: "head"

Possible matches:
headphones
headset
headphone stand
```

A prefix match checks whether a term begins with the supplied characters.

```text
head -> headphones
head -> headset
```

This is particularly useful for **autocomplete** and **search-as-you-type**.

### Why not use a generic substring query?

A simple `contains` or `starts_with` operation may work for small datasets, but repeatedly scanning large collections can become expensive.

Search engines can use specialized structures and indexing strategies to make partial matching efficient.

Examples include:
- Prefix-oriented indexes.
- N-gram-based indexes.
- Autocomplete-oriented indexes.

The appropriate technique depends on the required matching behavior, index size, and query latency.

### Prefix matching versus substring matching

These are different operations.

**Prefix matching**

```text
head -> headphones
```

The term starts with the supplied characters.

**Substring matching**

```text
phones -> headphones
```

The supplied characters appear somewhere inside the term.

Substring matching is generally broader and may require additional indexing or processing.

### Trade-offs

Autocomplete improves the user experience, but it introduces additional work.

- More index structures can increase storage requirements.
- Broad prefixes may match many terms.
- Large suggestion sets require ranking and limiting.
- Search-as-you-type can generate many requests while the user is typing.

**Principle:** Support partial matching with an indexing strategy suited to the required behavior instead of assuming a normal full-text lookup will handle every partial term.

---

## 2. Search-as-You-Type

Autocomplete is more than matching prefixes. The system must also decide when to query, which suggestions to return, and how to rank them.

### Example

A user types:

```text
h
he
hea
head
headp
```

Each input could trigger a search request.

If every keystroke creates a request, a single user may generate many queries before completing the search.

### Common design considerations

**Debouncing**

Wait for a short pause in typing before sending a request.

For example, instead of querying immediately after every keystroke, the application waits briefly for the user to stop typing.

**Minimum input length**

Avoid running expensive suggestions for extremely short prefixes when they match too many terms.

**Result limits**

Return only a small number of suggestions rather than every matching term.

**Ranking**

Prioritize useful suggestions instead of returning arbitrary matches.

**Cancellation or stale-response handling**

An older request may finish after a newer request. The application should avoid displaying outdated suggestions over newer ones.

### Example flow

```text
User types "head"
       |
       v
Application waits briefly
       |
       v
Autocomplete query
       |
       v
Search index
       |
       v
Rank and limit suggestions
       |
       v
Display suggestions
```

### Important distinction

Autocomplete may use product popularity, previous searches, or other configured signals to rank suggestions. These are separate from the basic prefix-matching mechanism.

**Principle:** A good autocomplete system balances responsiveness, relevance, and query cost.

---

## 3. Typo Tolerance and Fuzzy Search

### The problem

Users frequently make spelling mistakes.

For example:

```text
User query:
"wireles headphnes"

Intended query:
"wireless headphones"
```

A strict exact-term search may fail to retrieve the intended products.

Fuzzy search allows the engine to consider terms that are sufficiently similar to the query terms.

### Edit distance

A common concept behind fuzzy matching is **edit distance**.

It measures how many edits are required to transform one string into another.

Typical edits include:
- Insertion of a character.
- Deletion of a character.
- Substitution of a character.

For example:

```text
wireles -> wireless
```

The first word is missing a character compared with the second.

A fuzzy search may recognize the similarity and consider `wireless` as a candidate match.

The exact behavior depends on the configured algorithm and matching rules.

### Why is typo tolerance useful?

Without typo tolerance, a small spelling mistake can cause a user to receive no useful results.

Fuzzy matching improves recall by allowing approximate matches.

However, it can also introduce irrelevant results.

### Precision versus recall

**Precision:** How many returned results are relevant?

**Recall:** How many of the relevant documents did we successfully retrieve?

More aggressive fuzzy matching may improve recall but reduce precision by returning unrelated terms.

For example, an overly broad search for `head` might return products involving:
- Headphones.
- Headsets.
- Headbands.
- Other terms that happen to satisfy the configured matching rules.

These results are not equally relevant.

### Performance considerations

Fuzzy matching can require more work than an exact-term lookup.

Depending on the implementation and query, it may generate or examine many approximate term candidates.

This can increase:
- CPU usage.
- Query latency.
- The number of candidate documents.
- Ranking work.

### Controlling fuzzy matching

A search engine can limit approximate matching according to the application's requirements.

Possible controls include:
- Restricting the permitted edit distance.
- Applying fuzziness selectively.
- Using exact matches preferentially.
- Limiting candidate expansion.
- Combining approximate matching with relevance ranking.

The goal is not to match every vaguely similar word. It is to correct likely mistakes without overwhelming the user with irrelevant results.

**Principle:** Typo tolerance improves recall, but excessive fuzziness can hurt precision and performance.

---

## 4. Partial Matching versus Fuzzy Matching

These features solve different problems.

### Partial matching

The user hasn't finished typing the word.

```text
Input: "head"

Possible completion:
"headphones"
```

### Fuzzy matching

The user likely entered the word incorrectly.

```text
Input: "headphnes"

Possible correction:
"headphones"
```

### Comparison

| Aspect | Partial matching | Fuzzy matching |
|---|---|---|
| User behavior | Incomplete input | Misspelled input |
| Example | `head` → `headphones` | `headphnes` → `headphones` |
| Main goal | Autocomplete and incomplete-term retrieval | Recover from spelling errors |
| Main risk | Too many prefix matches | Too many approximate matches |
| Design concern | Efficient prefix or partial lookup | Bound candidate expansion and edit distance |

Both features can coexist in the same search system.

However, they should not be treated as interchangeable.

**Principle:** Partial matching handles incomplete terms; fuzzy matching handles approximate spellings.

---

## 5. Synonyms versus Fuzzy Matching

These also solve different problems.

### Synonyms: Domain knowledge

Suppose the product team specifies that:

```text
cellphone <-> mobile phone
```

The words are different, but the application wants them treated as equivalent for search.

This is a synonym problem.

### Fuzzy matching: Spelling approximation

Suppose the user types:

```text
televison
```

instead of:

```text
television
```

This is a typo-tolerance problem.

### Comparison

| Feature | Synonyms | Fuzzy matching |
|---|---|---|
| Purpose | Handle configured semantic equivalences | Handle approximate spelling |
| Example | `TV` → `television` | `televison` → `television` |
| Source of knowledge | Domain rules | String-similarity algorithm |
| Main trade-off | Expansion and rule-management complexity | Precision and query cost |

### Why this distinction matters

A domain-specific synonym may not be discoverable through spelling similarity.

For example, `cellphone` and `mobile phone` are not sufficiently similar strings for fuzzy matching to reliably express the intended relationship.

Conversely, a typo such as `televison` doesn't necessarily need a manually maintained synonym rule.

**Principle:** Use synonyms for known semantic relationships and fuzzy matching for likely spelling errors.

---

## 6. Combining Matching Techniques

A production search system often combines several matching strategies.

Consider the query:

`wireles head`

The user has:
- Misspelled `wireless`.
- Entered only a partial second term.

A search system may need to handle both conditions.

A conceptual pipeline is:

```text
User Query
    |
    v
Query Analysis
    |
    v
Identify Matching Strategies
    |
    +----------------------+
    |                      |
    v                      v
Exact / Full-Text     Partial / Fuzzy
    |                      |
    +-----------+----------+
                |
                v
       Combine Candidates
                |
                v
       Relevance Ranking
                |
                v
          Search Results
```

This is a logical illustration rather than a requirement to implement separate physical components.

### Why not apply every technique aggressively?

Each matching technique expands the possible result set.

- Prefix matching can produce many completions.
- Fuzzy matching can introduce approximate terms.
- Synonyms can expand a query into additional terms.
- Full-text matching can retrieve documents containing only some of the query terms, depending on query semantics.

Combining them without controls can produce noisy results and increase query cost.

A good design determines when each technique is appropriate and how much influence it should have.

### Example

Query:

`wireles head`

Potential processing:
1. Analyze the query.
2. Recognize `wireles` as a possible misspelling of `wireless`.
3. Treat `head` as a partial term.
4. Retrieve candidates using the configured matching strategies.
5. Rank the candidates.
6. Return a limited set of useful suggestions.

**Principle:** Combining matching strategies can improve search usability, but the system must control candidate expansion and preserve relevance.

---

## 7. Search Quality: Precision, Recall, and Latency

Search quality involves more than returning results quickly.

Three important considerations are:

### Precision

Of the results returned, how many are relevant?

Aggressive fuzzy matching may reduce precision by introducing unrelated candidates.

### Recall

Of the relevant documents, how many did the engine retrieve?

Strict exact matching may reduce recall when users make typos or use alternative terms.

### Latency

How long does it take to return the results?

Broad fuzzy queries, extensive synonym expansion, and large candidate sets can increase query cost.

### The trade-off

Consider three possible configurations:

**Strict matching**
- Often produces fewer, more precise results.
- May miss useful results containing typos or alternate forms.

**Aggressive matching**
- May retrieve more relevant results.
- May also introduce more irrelevant candidates and increase query cost.

**Balanced matching**
- Uses configured synonym rules.
- Supports appropriate partial matching.
- Applies bounded typo tolerance.
- Ranks candidates to favor the most useful results.

The best configuration depends on the application's requirements and should be evaluated against representative queries.

**Principle:** Search design balances precision, recall, and latency rather than maximizing any one metric without considering the others.

---

## 8. Interview Scenario: Designing Product Autocomplete

### Requirements

Design autocomplete for a catalog containing 100 million products.

Users expect suggestions while typing product names.

### Functional requirements

- Support partial product names.
- Return a limited number of suggestions.
- Rank useful suggestions.
- Handle common spelling mistakes if required.

### Non-functional requirements

- Low query latency.
- Efficient index usage.
- Controlled CPU and storage overhead.
- Consistent behavior during rapid typing.

### High-level design

```text
Client
  |
  v
Application
  |
  v
Autocomplete Search
  |
  v
Prefix / Suggestion Index
  |
  v
Ranked Suggestions
  |
  v
Client
```

The specific autocomplete structure depends on the search engine and the required behavior.

### Important design decisions

**1. Matching strategy**

Decide whether suggestions require prefix matching, substring matching, fuzzy matching, or some combination.

**2. Request frequency**

Use client-side debouncing and suitable minimum input lengths to avoid unnecessary queries.

**3. Result count**

Return a small, bounded set of suggestions.

**4. Ranking**

Prioritize useful suggestions rather than returning every prefix match.

**5. Index size**

Additional structures can improve query performance but may increase storage and indexing costs.

**6. Failure behavior**

If autocomplete is unavailable, decide whether the application should fall back to ordinary search or temporarily omit suggestions.

### Common mistake

Using a generic substring scan over the entire product catalog for every keystroke.

This may work for a small dataset but can become expensive at large scale.

**Interview principle:** Choose a search structure suited to the required matching behavior, and optimize the autocomplete request path separately from the full search experience.

---

## Part 2: Quick Revision

| Concept | Key takeaway |
|---|---|
| Partial matching | Matches incomplete terms |
| Prefix matching | Matches terms beginning with the supplied characters |
| Substring matching | Matches character sequences within a term |
| Autocomplete | Returns useful suggestions as the user types |
| Debouncing | Waits briefly before issuing another query |
| Fuzzy matching | Allows approximate spelling matches |
| Edit distance | Measures the edits needed to transform one string into another |
| Precision | Fraction of returned results that are relevant |
| Recall | Fraction of relevant documents successfully retrieved |
| Synonyms | Handle configured semantic equivalences |
| Candidate expansion | Additional possible matches generated by a query |
| Query latency | Time taken to process and return a search response |

### Five principles to remember

1. Prefix matching and substring matching are different capabilities.
2. Partial matching handles incomplete words; fuzzy matching handles spelling errors.
3. Synonyms encode domain knowledge rather than spelling similarity.
4. Aggressive matching can improve recall but hurt precision and performance.
5. Autocomplete needs bounded, low-latency queries and useful suggestion ranking.
# Object Storage — Part 4: Security, Cost & Interview Deep Dive

## 36. Object Storage Security

Object storage should not normally expose every object publicly.

A common pattern is:

```text
Client
  │
  │ Request access
  ▼
Application
  │
  ├── Authenticate
  ├── Authorize
  └── Generate temporary access
          │
          ▼
     Pre-signed URL
          │
          ▼
       Object Storage
```

The application decides:

- Who can access the object
- Which object they can access
- Whether they can read or write
- How long access should remain valid

The client then uses the temporary permission to transfer the object directly.

### Principle

> **Authorization belongs in the application; object storage enforces the resulting access permission.**

---

## 37. Don't Trust the Object Key From the Client

Suppose a user uploads:

```text
profile.jpg
```

The application should not blindly allow the client to choose arbitrary storage locations such as:

```text
/users/another-user/private-data.zip
```

Instead, the server should derive or validate the object key.

For example:

```text
/users/{user_id}/uploads/{generated_object_id}
```

The application can then associate that object with the authenticated user in the metadata database.

### Principle

> **The client can request an upload, but the server should control object ownership and storage authorization.**

---

## 38. Encryption

Object storage commonly supports encryption for data at rest.

Conceptually:

```text
Client
  ↓
Object Storage
  ↓
Encrypted data at rest
```

Depending on requirements, encryption keys may be:

- Provider-managed
- Application/customer-managed

For sensitive workloads, the design may also require encryption **in transit**, typically using TLS.

So:

```text
In transit
→ TLS

At rest
→ Encryption
```

Encryption protects the confidentiality of stored data, but it does not replace authorization.

### Principle

> **Encryption protects data; authorization controls who can access it.**

---

## 39. Object Ownership and Access Control

A production design should clearly define object ownership.

For example:

```text
User A
  │
  └── /users/A/photos/123.jpg

User B
  │
  └── /users/B/photos/456.jpg
```

When User A requests object `456.jpg`, the application must verify that User A is authorized to access it.

Do not rely solely on the object key naming convention.

A database mapping can provide the authoritative relationship:

```text
object_id
user_id
object_key
visibility
created_at
```

Then:

```text
Request
  ↓
Authenticate user
  ↓
Look up object metadata
  ↓
Verify ownership / permissions
  ↓
Generate access
```

### Principle

> **Object naming helps organization; authorization determines access.**

---

# 40. Cost Considerations

Object storage is generally attractive for large data because it separates storage from compute and can scale to very large datasets.

But the total cost isn't simply:

```text
cost = storage_size
```

Consider:

```text
Storage
+ Requests
+ Data retrieval
+ Data transfer
+ Replication
+ CDN
+ Versioning
+ Lifecycle transitions
```

For example, keeping every historical version forever can significantly increase storage usage.

Similarly, moving data to a cheaper archive tier may reduce storage cost but increase retrieval cost or latency.

### Principle

> **Optimize total storage-system cost, not just the price per GB stored.**

---

# 41. Lifecycle Policies and Cost Control

Lifecycle policies can automatically manage old data.

Example:

```text
0–30 days
→ Standard storage

30–180 days
→ Infrequent-access storage

180+ days
→ Archive

7 years
→ Delete
```

The actual policy depends on:

- Access patterns
- Retention requirements
- Compliance
- Recovery requirements
- Retrieval cost

For versioned objects, lifecycle policies can also clean up old versions when appropriate.

### Interview point

If an interviewer asks:

> "How would you control storage cost?"

Mention:

```text
Lifecycle policies
Storage tiers
Version cleanup
CDN caching
Retention policies
```

---

# 42. Large-Scale Object Listing

Object storage may contain millions or billions of objects.

Avoid designing the application around repeatedly scanning the entire bucket.

Instead, keep application-queryable metadata in a database:

```text
Database
──────────────────────
user_id
object_id
object_key
created_at
type
status
```

Then:

```text
User requests:
"Show me my videos from last month."

        ↓

Database query
        ↓
Matching object keys
        ↓
Generate secure access
```

The database handles the application's query requirements rather than treating the object store like a relational database.

### Principle

> **Use object storage for objects and a database/search system for application-level queries.**

---

# 43. Object Storage Is Not a Database

This distinction is important in interviews.

Object storage is excellent for:

```text
Large blobs
Images
Videos
PDFs
Backups
Datasets
Logs
Archives
```

But it is not the right primary system for:

```text
Complex joins
Transactions
Arbitrary relational queries
Frequent row-level updates
```

A common architecture is therefore:

```text
                    Application
                   /           \
                  /             \
                 ▼               ▼
          Metadata DB      Object Storage
                               │
                               ▼
                          Large blobs
```

Each system has a different responsibility.

---

# 44. What Happens If Object Storage Is Temporarily Unavailable?

Suppose:

```text
Client
  ↓
Object Storage
  ✗ temporarily unavailable
```

For an upload, the client should not necessarily restart from zero.

With multipart uploads:

```text
Part 1 ✓
Part 2 ✓
Part 3 ✓
Part 4 ✗
Part 5 ✓
```

The system can retry the failed part later.

```text
Retry Part 4
     ↓
Success
     ↓
Complete upload
```

Use:

- Exponential backoff
- Jitter
- Bounded retries
- Appropriate overall deadlines

For downloads, clients may retry or use range requests when supported.

### Principle

> **Design object transfers so temporary failures don't require restarting large operations.**

---

# 45. Partial Uploads and Cleanup

Multipart uploads introduce another operational concern.

Suppose:

```text
Upload started
     ↓
Part 1 ✓
Part 2 ✓
Part 3 ✓
     ↓
Client disappears
```

The incomplete upload may remain unless explicitly cleaned up.

At scale, abandoned multipart uploads can consume significant storage.

A lifecycle policy can automatically clean up incomplete uploads after an appropriate period.

```text
Incomplete upload
       ↓
Retention period
       ↓
Automatic cleanup
```

### Principle

> **Resumability improves reliability, but abandoned state must also be cleaned up.**

---

# 46. Disaster Recovery

Object storage can be highly durable without necessarily satisfying every disaster-recovery requirement.

For example:

```text
Normal operation
       ↓
Region A
       ↓
Regional disaster
```

If the business requires continued access from another region, the system may replicate objects across regions:

```text
Region A
Object
  │
  └────────→ Region B
               Replica
```

But cross-region replication introduces additional considerations:

- Replication lag
- Cost
- Data-transfer cost
- Compliance/data residency
- Recovery procedures
- Application routing/failover

### Principle

> **Durability and disaster recovery are related but separate design requirements.**

---

# 47. Complete Media Upload Example

Consider a video-sharing platform.

Requirements:

- Users upload large videos.
- Videos can be several GB.
- Videos are watched globally.
- Videos require transcoding.
- Users should not wait for transcoding.
- Uploads should survive temporary network failures.

A suitable architecture:

```text
                           ┌──────────────────┐
                           │   Application    │
                           │                  │
                           │ Auth / Authz     │
                           │ Metadata         │
                           │ Business Logic   │
                           └────────┬─────────┘
                                    │
                             Pre-signed URL
                                    │
                                    ▼
Client ─────────────────────→ Object Storage
  │                                │
  │                                │
  │                                ▼
  │                              Event
  │                                │
  │                                ▼
  │                              Queue
  │                                │
  │                                ▼
  │                             Workers
  │                          /     |      \
  │                         /      |       \
  │                  Transcode  Thumbnail  Metadata
  │
  │
  └──────────────→ CDN ─────────→ Object Storage
                         for reads

Application ───────────────→ Metadata DB
```

### Upload flow

```text
1. Client authenticates.
2. Application authorizes the upload.
3. Application creates object metadata.
4. Application generates a pre-signed upload URL.
5. Client uploads directly to object storage.
6. Large upload uses multipart/resumability.
7. Completed object produces an event.
8. Event enters a queue.
9. Workers process the video asynchronously.
10. Processing state is updated in the metadata DB.
11. Completed content is served through the CDN.
```

---

# 48. Failure Scenarios

### Scenario 1: Network fails during upload

```text
Multipart upload
      ↓
Some parts succeed
      ↓
Network failure
      ↓
Retry failed parts
```

The entire video does not need to be uploaded again.

### Scenario 2: Worker crashes

```text
Object already stored
      ↓
Worker crashes
      ↓
Queue retries event
      ↓
Another worker processes it
```

### Scenario 3: Event delivered twice

```text
Same event
   ↓
Worker
   ↓
Idempotency check
   ↓
Already processed
   ↓
Skip duplicate work
```

### Scenario 4: Processing repeatedly fails

```text
Queue
  ↓
Retry
  ↓
Retry
  ↓
Retry
  ↓
DLQ
```

The original object remains available for investigation or reprocessing.

### Scenario 5: User accidentally overwrites an object

```text
Versioning
     ↓
Previous version remains available
```

---

# 49. Common Interview Mistakes

### Mistake 1: Putting large blobs in the primary database

Better:

```text
DB → metadata
Object Storage → blob
```

### Mistake 2: Proxying every large upload through the application

Better:

```text
Application → authorize
Client → Object Storage
```

### Mistake 3: Restarting a failed 10 GB upload

Better:

```text
Multipart
→ retry failed parts
```

### Mistake 4: Assuming object storage is always eventually consistent

Consistency guarantees depend on the storage system.

State the required consistency model rather than making a blanket assumption.

### Mistake 5: Treating CDN as permanent storage

The CDN is a caching/delivery layer.

```text
CDN → cache
Object Storage → origin/durable object
```

### Mistake 6: Making the upload request wait for transcoding

Better:

```text
Upload
→ Store
→ Event
→ Queue
→ Async processing
```

### Mistake 7: Ignoring duplicate events

Use idempotent processing.

### Mistake 8: Ignoring abandoned multipart uploads

Use cleanup/lifecycle policies.

### Mistake 9: Treating object storage like a relational database

Keep searchable application metadata in a database or appropriate search system.

---

# 50. Final Interview Checklist

When designing an object-storage system, walk through:

```text
□ Why object storage?
□ What belongs in the DB vs object storage?
□ How does the client upload?
□ Are pre-signed URLs needed?
□ Are uploads large enough for multipart?
□ How are failed parts retried?
□ How is access authorized?
□ What provides durability?
□ Is multi-region replication required?
□ What consistency guarantee is needed?
□ Is versioning required?
□ What lifecycle/retention policy is needed?
□ How are downloads handled?
□ Is a CDN useful?
□ Are range requests useful?
□ Does upload trigger asynchronous processing?
□ Is processing idempotent?
□ What happens when workers fail?
□ Is there a DLQ?
□ How are abandoned multipart uploads cleaned up?
□ What metrics are monitored?
□ What are the major cost drivers?
```

---

# 51. Object Storage — Final Mental Model

```text
                     ┌─────────────────┐
                     │   Application   │
                     │                 │
                     │ Auth / Authz    │
                     │ Metadata        │
                     │ Business Logic  │
                     └───────┬─────────┘
                             │
                       Pre-signed URL
                             │
                             ▼
Client ───────────────→ Object Storage
  │                          │
  │                          ├── Durability
  │                          ├── Versioning
  │                          ├── Lifecycle
  │                          └── Events
  │                                  │
  │                                  ▼
  │                                Queue
  │                                  │
  │                                  ▼
  │                                Workers
  │
  └──────────────→ CDN ─────→ Object Storage

Application ────────────────→ Metadata DB
```

### 30-Second Interview Summary

> **I use object storage for large unstructured data such as images and videos, keeping searchable metadata in a database. For uploads, the application authenticates and authorizes the user, then issues a temporary pre-signed URL so the client can upload directly to object storage. Large files use multipart uploads so failed parts can be retried independently. Object storage provides durable storage through redundancy, while versioning and lifecycle policies handle recovery and long-term management. For read-heavy workloads, I'd use a CDN and range requests where appropriate. After an upload completes, an object event can feed a queue for asynchronous processing such as transcoding. Workers should be idempotent, retries should be bounded, and persistent failures can go to a DLQ.**

### One-Line Mental Model

> **Application controls access and metadata; object storage owns the durable bytes; CDN accelerates reads; and queues/workers process objects asynchronously.**
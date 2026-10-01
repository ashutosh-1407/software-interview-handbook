# Object Storage — Interview Cheat Sheet

## 1. When to Use Object Storage

Use object storage for large, unstructured blobs:

- Images
- Videos
- PDFs
- Backups
- Logs
- Datasets
- Archives

```text
Application → Object Storage
                 ↑
              Large blobs
```

### Mental model

> **Database stores searchable metadata; object storage stores the bytes.**

---

## 2. Why Not Store Large Files in the Database?

Putting large blobs directly in the primary DB can create:

- Storage/capacity pressure
- Larger backups
- Higher database I/O
- Resource contention
- More difficult scaling

Typical split:

```text
Database
→ user_id
→ object_id
→ object_key
→ size
→ content_type
→ timestamps
→ processing status

Object Storage
→ actual file bytes
```

---

## 3. Object Storage vs File Storage

### Object Storage

```text
Bucket
  └── Object Key
       └── Object Data
```

### File Storage

```text
Filesystem
  └── Directory
       └── File
```

A key containing `/` may look hierarchical in object storage, but that does not necessarily mean the storage system is exposing a traditional filesystem.

---

## 4. Direct Uploads

Avoid:

```text
Client
  ↓
Application
  ↓
Object Storage
```

for very large files.

Prefer:

```text
Client ─────────────→ Object Storage
   │
   │
   └── Application handles authorization
```

The application controls the **control plane** while object storage handles the large **data plane** transfer.

### Principle

> **Authorize through the application; transfer large objects directly.**

---

## 5. Pre-Signed URLs

A pre-signed URL provides temporary, constrained access to an object.

Typical flow:

```text
Client
  ↓
Application
  ↓
Authenticate + Authorize
  ↓
Generate temporary URL
  ↓
Client → Object Storage
```

The application can control:

- Object
- Operation
- Expiration
- Access scope

---

## 6. Multipart Upload

For large uploads:

```text
Large File
   ↓
┌────┬────┬────┬────┬────┐
│ P1 │ P2 │ P3 │ P4 │ P5 │
└────┴────┴────┴────┴────┘
```

Benefits:

- Parallel uploads
- Resumability
- Retry only failed parts
- Better handling of large files

Example:

```text
P1 ✓
P2 ✓
P3 ✗
P4 ✓
P5 ✓

Retry only P3
```

### Principle

> **Multipart upload makes large transfers resumable.**

---

## 7. Multipart Upload ≠ Range Request

```text
Multipart Upload
→ Split a large upload into parts

Range Request
→ Retrieve only part of an existing object
```

Range requests are useful for large videos, downloads, seeking, etc.

---

## 8. Upload Failure

Use:

```text
Failed part
   ↓
Exponential backoff
   +
Jitter
   ↓
Bounded retry
```

Don't restart a multi-GB upload unnecessarily.

Also clean up abandoned multipart uploads.

---

## 9. Durability vs Availability

### Durability

> Probability that data is not permanently lost.

### Availability

> Probability that data can be accessed when requested.

Therefore:

```text
Highly durable
≠
Always available
```

A temporary outage can affect availability without causing permanent data loss.

---

## 10. Durability Through Redundancy

Conceptually:

```text
Object
  ↓
Multiple storage nodes/failure domains
```

Redundancy protects against hardware and infrastructure failures.

Multi-region replication can additionally provide disaster-recovery protection.

```text
Region A
   │
   └──────→ Region B
```

---

## 11. Replication vs Erasure Coding

### Replication

```text
Copy A
Copy B
Copy C
```

- Simple
- More storage overhead

### Erasure Coding

```text
Data + parity fragments
```

- More storage-efficient
- More computational/reconstruction complexity

### Interview line

> **Erasure coding trades additional complexity/computation for more storage-efficient redundancy.**

---

## 12. Consistency

Consistency describes what clients are guaranteed to observe after writes.

Don't automatically say:

> "Object storage is eventually consistent."

Instead ask:

> **What consistency guarantee does the storage system provide and what does the application require?**

Also:

> **Strong consistency does not automatically mean synchronous replication.**

---

## 13. Versioning

Without versioning:

```text
photo.jpg
  ↓
Overwrite
```

With versioning:

```text
photo.jpg
 ├── V1
 ├── V2
 └── V3
```

Useful for:

- Accidental overwrites
- Accidental deletes
- Recovery

Trade-off:

> More retained versions → more storage.

---

## 14. Lifecycle Policies

Objects often move through:

```text
Hot
 ↓
Infrequent
 ↓
Cold
 ↓
Archive
 ↓
Delete
```

Lifecycle policies can automate:

- Storage-tier transitions
- Retention
- Expiration
- Old-version cleanup

### Principle

> **Optimize storage cost according to access and retention patterns.**

---

## 15. Secure Downloads

Avoid:

```text
Object Storage
   ↓
Application
   ↓
Client
```

for very large files.

Prefer:

```text
Client
  ↓
Application
  ↓
Authorize
  ↓
Temporary access
  ↓
Object Storage
  ↓
Client
```

The application authorizes access without becoming the large-file data path.

---

## 16. CDN

For read-heavy/global workloads:

```text
Client
  ↓
CDN
  ↓ cache miss
Object Storage
```

On a cache miss:

```text
CDN → Object Storage
    ↓
Cache object
    ↓
Return to client
```

Subsequent requests can be served from an edge location.

Benefits:

- Lower latency
- Less origin traffic
- Better global scalability

### Important

> CDN = cache/delivery layer, not durable source of truth.

---

## 17. Range Requests

Retrieve only a portion of an existing object.

Useful for:

- Large videos
- Media seeking
- Large downloads
- Partial file access

```text
10 GB object
┌──────────────────────────┐
│      requested range    │
│          ↓              │
└──────────────────────────┘
```

---

## 18. Object Events

After an object is successfully stored:

```text
Object Storage
      ↓
Object Event
      ↓
Queue / Event Stream
      ↓
Worker
```

Possible processing:

- Thumbnail generation
- Video transcoding
- Metadata extraction
- Virus scanning
- Content processing

The upload request doesn't need to wait for expensive processing.

---

## 19. Queue + Object Storage

Why use a queue?

```text
Object Storage
      ↓
     Queue
      ↓
   Workers
```

The queue:

- Absorbs bursts
- Decouples ingestion from processing
- Allows independent worker scaling
- Supports retries

---

## 20. Idempotent Processing

Events may potentially be delivered more than once.

```text
Event
 ├──→ Worker
 └──→ Worker again
```

Workers should safely handle duplicates.

This connects directly to **Idempotency**:

```text
Duplicate event
      ↓
Idempotent worker
      ↓
Same business outcome
```

---

## 21. Processing State

Object existence ≠ processing completion.

Example:

```text
UPLOADED
   ↓
PROCESSING
   ↓
READY
```

or:

```text
PROCESSING
   ↓
FAILED
```

Keep processing state in metadata when the application needs to expose workflow status.

---

## 22. Processing Failure

```text
Object Storage
      ↓
Queue
      ↓
Worker
      ✗
```

Use:

```text
Retry
 ↓
Backoff
 ↓
Retry
 ↓
DLQ
```

The original object remains available for reprocessing.

### Principle

> **Processing failure should require reprocessing, not re-uploading the original object.**

---

## 23. Security

Typical controls:

### In transit

```text
TLS
```

### At rest

```text
Encryption
```

### Access

```text
Authentication
      ↓
Authorization
      ↓
Temporary access
```

Encryption protects data.

Authorization controls who can access it.

---

## 24. Object Ownership

Don't blindly trust client-provided object keys.

Prefer server-controlled ownership:

```text
/users/{user_id}/objects/{generated_id}
```

And verify ownership using application metadata:

```text
object_id
user_id
object_key
permissions
```

### Principle

> **Object naming organizes data; authorization determines access.**

---

## 25. Cost Drivers

Total cost can include:

```text
Storage
+ Requests
+ Retrieval
+ Data transfer
+ Replication
+ CDN
+ Versioning
+ Lifecycle transitions
```

Don't optimize only for storage price per GB.

---

## 26. Large-Scale Queries

Don't repeatedly scan a massive bucket to answer application questions.

Instead:

```text
Application
     ↓
Metadata DB
     ↓
Find matching object keys
     ↓
Object Storage
```

Use the database/search system for application-level queries.

---

## 27. Disaster Recovery

Durability ≠ complete disaster recovery.

If regional disaster recovery is required:

```text
Region A
Object
  │
  └────────→ Region B
```

Consider:

- Replication lag
- Cost
- Data residency
- Compliance
- Failover
- Routing

---

## 28. Object Storage Failure Map

| Failure | Typical response |
|---|---|
| Upload interrupted | Retry failed multipart parts |
| Object storage temporarily unavailable | Backoff + retry |
| Worker crashes | Queue retry |
| Duplicate event | Idempotent worker |
| Repeated processing failure | DLQ |
| Accidental overwrite | Versioning |
| Old unused data | Lifecycle policy |
| Abandoned multipart upload | Automatic cleanup |
| Global read latency | CDN |
| Large partial download | Range request |

---

## 29. Complete Architecture

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
  │                               │
  │                               ├── Versioning
  │                               ├── Lifecycle
  │                               └── Object Events
  │                                       │
  │                                       ▼
  │                                     Queue
  │                                       │
  │                                       ▼
  │                                     Workers
  │
  │ Download
  ▼
 CDN ─────────────────────────→ Object Storage

Application ──────────────────→ Metadata DB
```

---

## 30. Interview Answer Structure

When asked to design a large-file/media system:

```text
1. Large unstructured data
        ↓
   Object Storage

2. Large uploads
        ↓
   Pre-signed URLs
        ↓
   Multipart upload

3. Searchable metadata
        ↓
   Database

4. Read-heavy/global
        ↓
   CDN

5. Partial large downloads
        ↓
   Range requests

6. Expensive processing
        ↓
   Object event → Queue → Workers

7. Duplicate processing
        ↓
   Idempotency

8. Worker failures
        ↓
   Retry + DLQ

9. Accidental overwrite/delete
        ↓
   Versioning

10. Old data
        ↓
    Lifecycle policies

11. Durability
        ↓
    Redundancy / appropriate replication
```

---

# 31. 30-Second Interview Answer

> **I'd use object storage for large unstructured data and keep searchable metadata in a database. The application would authenticate and authorize users, then issue pre-signed URLs so clients can upload directly to object storage. Large uploads would use multipart/resumable uploads with bounded retries and jitter. For downloads, I'd use a CDN for read-heavy workloads and range requests when partial retrieval is useful. Object storage provides durability through redundancy, while versioning protects against accidental changes and lifecycle policies manage long-term cost. Object-created events could feed a queue for asynchronous processing such as transcoding, with idempotent workers, retries, and a DLQ for persistent failures.**

---

# 32. Final Mental Model

```text
                 ┌─────────────────┐
                 │   Application   │
                 │                 │
                 │ Auth / Authz    │
                 │ Metadata        │
                 │ Business Logic  │
                 └────────┬────────┘
                          │
                    Pre-signed URL
                          │
                          ▼
Client ─────────────→ Object Storage
  │                        │
  │                        ├── Durability
  │                        ├── Versioning
  │                        ├── Lifecycle
  │                        └── Events
  │                               │
  │                               ▼
  │                             Queue
  │                               │
  │                               ▼
  │                             Workers
  │
  └──────────────→ CDN ─────→ Object Storage

Application ────────────────→ Metadata DB
```

### One-line mental model

> **Application controls access and metadata; object storage owns the durable bytes; CDN accelerates reads; and queues/workers process objects asynchronously.**

---

# 33. Key Interview Triggers

```text
Large files
→ Object Storage

Don't proxy large uploads
→ Pre-signed URL

Large/resumable upload
→ Multipart

Retry only failed upload pieces
→ Multipart retry

Search/filter metadata
→ Database

Global/read-heavy downloads
→ CDN

Partial download
→ Range request

Accidental overwrite/delete
→ Versioning

Old/infrequently accessed data
→ Lifecycle/storage tiers

Upload triggers expensive work
→ Event + Queue + Worker

Duplicate event
→ Idempotent consumer

Worker repeatedly fails
→ DLQ

Temporary upload failure
→ Backoff + jitter + bounded retry

Permanent data-loss protection
→ Durability/redundancy

Regional disaster recovery
→ Cross-region replication, if required

Abandoned multipart uploads
→ Lifecycle/cleanup

Secure direct access
→ Pre-signed URL + authorization
```
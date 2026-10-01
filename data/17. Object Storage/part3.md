# Object Storage — Part 3: Events, Async Processing & Failure Recovery

## 23. Object Storage + Event-Driven Processing

Object storage is often the durable starting point for an asynchronous workflow.

For example, after a video upload completes:

```text
Client
  │
  │ Upload
  ▼
Object Storage
  │
  │ Object-created event
  ▼
Queue / Event Stream
  │
  ▼
Worker
  ├── Generate thumbnail
  ├── Transcode video
  └── Extract metadata
```

Expensive processing does not need to happen inside the upload request.

```text
Upload
  ↓
Store object
  ↓
Return success
  ↓
Process asynchronously
```

### Principle

> Store the object first; perform expensive processing asynchronously.

---

## 24. Why Put a Queue Between Storage Events and Workers?

Suppose 100,000 users upload videos during a traffic spike.

Without a queue, the processing layer may be overwhelmed:

```text
Object Storage
      │
      ├──→ Worker
      ├──→ Worker
      ├──→ Worker
      └──→ Worker
```

With a queue:

```text
Object Storage
      │
      ▼
    Queue
      │
      ▼
   Workers
```

The queue buffers bursts and lets workers process at a controlled rate.

It also allows the upload system and processing system to scale independently.

### Principle

> Queues absorb bursts and decouple ingestion from processing capacity.

---

## 25. Idempotent Object Processing

An object-created event may potentially be delivered more than once.

```text
Object uploaded
      │
      ▼
    Event
      │
      ├──→ Worker
      └──→ Worker again
```

The worker should therefore tolerate duplicate processing where practical.

For example:

```text
object_key = videos/123.mp4
thumbnail  = thumbnails/123.jpg
```

The worker can use an idempotency mechanism or check whether the expected output has already been successfully produced.

This connects directly to the **Idempotency** topic:

```text
Duplicate event
      ↓
Idempotent worker
      ↓
Same business outcome
```

### Principle

> Asynchronous delivery can be duplicated, so consumers should safely tolerate duplicate processing.

---

## 26. Failure During Asynchronous Processing

Suppose:

```text
Upload
  ↓
Object Storage ✓
  ↓
Event ✓
  ↓
Worker
  ↓
Transcoding
  ✗ Worker crashes
```

The user should not have to upload the original 5 GB video again.

The stored object remains available, so the processing operation can be retried:

```text
Queue
  │
  ├── Attempt 1 → Worker crashes
  ├── Attempt 2 → Worker crashes
  └── Attempt 3 → Success
```

Use bounded retries with appropriate backoff.

If processing continues to fail, move the message to a **dead-letter queue (DLQ)** for investigation or later recovery.

```text
Queue
  │
  ▼
Worker
  │
  ├── Success → Done
  │
  └── Repeated failure
           │
           ▼
          DLQ
```

### Principle

> Processing failure should require reprocessing, not re-uploading the original object.

---

## 27. Upload Failure vs. Processing Failure

These are different failure domains.

### Upload failure

```text
Client
  ↓
Multipart Upload
  ↓
Object Storage
  ✗
```

Use:

- Multipart/resumable uploads
- Retry failed parts
- Exponential backoff + jitter
- Bounded retries

### Processing failure

```text
Object Storage
  ↓
Event / Queue
  ↓
Worker
  ✗
```

Use:

- Queue retries
- Backoff
- Idempotent processing
- DLQ

So:

```text
Transfer reliability
→ Multipart + retry

Processing reliability
→ Queue + retry + idempotency + DLQ
```

---

## 28. Object Storage as a Durable Boundary

Object storage can act as the durable handoff point between ingestion and asynchronous processing.

```text
Client
  │
  ▼
Object Storage
  │
  ▼
Async Processing
```

Once the object is successfully stored, downstream processing can be retried independently.

For example:

```text
5 GB video
    │
    ▼
Object Storage ✓
    │
    ├──→ Upload request can finish
    │
    └──→ Transcoding happens later
```

The client connection does not need to remain open while the video is being transcoded.

### Principle

> Object storage provides a durable handoff between synchronous ingestion and asynchronous processing.

---

## 29. Object Metadata vs. Object Data

Keep searchable metadata separate from the actual blob:

```text
Database
──────────────
photo_id
user_id
object_key
content_type
size
created_at
status


Object Storage
──────────────
Actual image/video/PDF bytes
```

The database answers:

> "Which videos belong to this user?"

Object storage answers:

> "Give me the bytes for this object."

This separation lets each system handle the workload it is designed for.

For example:

```text
SELECT videos
WHERE user_id = 123
AND status = 'READY'
```

The database handles the query, while the application can use the resulting object key to generate a secure download path.

### Principle

> Database = searchable metadata; object storage = large binary data.

---

## 30. Processing State

Object existence and processing completion are not necessarily the same thing.

A useful processing lifecycle might be:

```text
UPLOADED
    ↓
PROCESSING
    ↓
READY
```

or:

```text
UPLOADED
    ↓
PROCESSING
    ↓
FAILED
```

For example:

```text
Original video
      ↓
Object exists
      ↓
Thumbnail generation
      ↓
Transcoding
      ↓
READY
```

The object may already exist while its derived assets are still being generated.

### Principle

> Separate storage state from processing state.

---

## 31. Failure Recovery Architecture

Putting the major pieces together:

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
Client ───────────────────────────┼──────────→ Object Storage
                                  │                 │
                                  │                 ▼
                                  │               Event
                                  │                 │
                                  │                 ▼
                                  │               Queue
                                  │                 │
                                  │                 ▼
                                  │              Workers
                                  │             /       \
                                  │            /         \
                                  │       Thumbnail    Transcoding
                                  │
                                  ▼
                             Metadata DB
```

Failure handling happens at the appropriate layer:

```text
Upload failure
→ retry failed multipart parts

Worker failure
→ retry queue message

Repeated processing failure
→ DLQ

Duplicate event
→ idempotent worker

Original object
→ remains available for reprocessing
```

---

## 32. Monitoring Object Storage Systems

Monitor each major part of the architecture.

### Upload

- Upload success/failure rate
- Multipart completion failures
- Upload latency
- Retry count
- Abandoned multipart uploads

### Storage

- Storage growth
- Object count
- Storage-tier distribution
- Retrieval volume
- Version growth

### CDN

- Cache hit ratio
- Origin request rate
- Latency
- Error rate

### Async processing

- Queue depth
- Processing latency
- Retry count
- DLQ size
- Worker failure rate
- Processing success rate

### Business metrics

For a media platform:

```text
Uploads completed
Videos successfully processed
Processing failures
Time from upload → READY
```

The last metric is especially useful because infrastructure can appear healthy while the user experience is degraded.

---

## 33. Complete Object Storage Architecture

A mature design can look like:

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

Responsibilities:

```text
Application
→ Authentication
→ Authorization
→ Metadata
→ Business logic

Object Storage
→ Durable blob storage
→ Large-object transfer
→ Versioning/lifecycle

CDN
→ Global read performance

Queue + Workers
→ Asynchronous processing

Database
→ Searchable/queryable metadata
```

---

## 34. Interview Answer Framework

For an object-storage system-design question, structure the answer around these decisions:

### 1. Storage

> The data is large and unstructured, so I'd use object storage rather than putting the blobs in the primary database.

### 2. Upload

> I'd use pre-signed URLs so the client uploads directly to object storage instead of proxying large data through the application.

### 3. Large files

> For large files, I'd use multipart uploads so failed parts can be retried independently.

### 4. Metadata

> I'd keep searchable metadata in a database and store the actual blob in object storage.

### 5. Reads

> For read-heavy workloads, I'd put a CDN in front of object storage.

### 6. Async processing

> Object-created events can feed a queue for asynchronous processing such as transcoding or thumbnail generation.

### 7. Reliability

> I'd use redundancy for durability, versioning for recovery from accidental changes, and lifecycle policies for long-term storage management.

### 8. Failure handling

> Upload failures retry individual parts; processing failures retry queue messages, with idempotent workers and a DLQ for persistent failures.

---

## 35. Core Mental Model

Think about object storage as four connected concerns:

```text
                    OBJECT STORAGE
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
     Transfer           Storage           Processing
        │                 │                  │
   Pre-signed URL     Durability          Events
   Multipart          Versioning          Queue
   Range requests     Lifecycle           Workers
        │                 │                  │
        └─────────────────┴──────────────────┘
                          │
                       Delivery
                          │
                         CDN
```

### One-line mental model

> **Object storage owns the bytes; the application owns authorization and metadata; the CDN accelerates reads; and asynchronous workers process stored objects independently.**
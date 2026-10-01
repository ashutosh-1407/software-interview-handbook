# Object Storage — Part 1: Fundamentals & Upload Architecture

## 1. Why Object Storage?

Object storage is designed for storing **large, unstructured data** such as:

- Images
- Videos
- PDFs
- Backups
- Logs
- Large datasets

The key architectural idea is to **separate blob storage from application compute**.

Instead of:

```text
Client
   │
   │ 10 GB file
   ▼
Application Server
   │
   ▼
Local Disk
```

we use:

```text
Client
   │
   ▼
Application
   │
   │ authorize + provide upload permission
   ▼
Client ─────────→ Object Storage
                    │
                    └── Large object
```

This allows storage and data transfer to scale independently from application compute.

### Problems with application/local storage

Keeping large files on application servers creates several problems:

- **Capacity coupling** — adding application instances also introduces storage-management concerns.
- **Failure risk** — a file tied to one machine may become unavailable when that machine fails.
- **Scaling complexity** — files need to be accessible regardless of which application instance handles the request.
- **Backup/replication burden** — the application infrastructure becomes responsible for protecting large blobs.
- **Resource contention** — large uploads/downloads consume network bandwidth and connection resources that the application needs for normal business traffic.
- **Operational complexity** — moving, replacing, or scaling application instances becomes harder when they also own persistent data.

### Principle

> **Separate compute from blob storage.**

---

## 2. Why Not Store Large Files in the Primary Database?

Consider a photo:

```text
Photo
├── photo_id
├── user_id
├── caption
├── created_at
└── 8 MB image
```

We generally separate the large binary object from the transactional metadata:

```text
Database
├── photo_id
├── user_id
├── object_key
├── file_size
├── content_type
└── created_at

Object Storage
└── actual 8 MB image
```

The database is optimized for:

- Querying
- Filtering
- Indexing
- Relationships
- Transactions
- Frequently changing business metadata

Object storage is optimized for:

- Large blob storage
- Durable storage
- Object-level reads/writes
- Large-scale storage

For example:

> "Find all photos belonging to user 123 created this month."

is a **database query**.

While:

> "Retrieve `users/123/photos/abc.jpg`."

is an **object-storage operation**.

### Principle

> **Database stores searchable business metadata; object storage stores the large blob.**

---

# 3. Object Storage vs. File Storage

Traditional file storage exposes a **filesystem abstraction**:

```text
/users
   /123
      /photos
         /2026
            photo.jpg
```

The application interacts with files and directories.

Object storage instead uses a **bucket + object-key model**:

```text
Bucket: photos

Object key:
users/123/photos/2026/photo.jpg
```

The `/` characters can make an object key look hierarchical, but they are generally part of the **object key**, rather than representing traditional directories.

### Important distinction

```text
File Storage
    ↓
Filesystem abstraction
    ↓
Directories + files
    ↓
Filesystem operations


Object Storage
    ↓
Bucket + object key
    ↓
Object + metadata
    ↓
Object-level operations
```

The important interview distinction is **not** that file storage must scan directories to find files.

Instead:

> File storage provides a hierarchical filesystem abstraction, while object storage provides a flat bucket/object-key model optimized for object-level access.

### When object storage fits well

Object storage is particularly useful when:

- Objects are large.
- Objects are relatively independent.
- We usually read/write the object as a unit.
- We don't need filesystem-style operations on the contents.
- We want storage to scale independently from application compute.

### Principle

> **Object storage is blob-oriented, not filesystem-oriented.**

---

# 4. Direct-to-Object-Storage Uploads

A major design decision is whether the application should receive the file itself.

For a 10 GB video, we generally don't want:

```text
Client
   │
   │ 10 GB
   ▼
Application
   │
   │ 10 GB
   ▼
Object Storage
```

The application becomes part of the large-data path.

That consumes:

- Network bandwidth
- Connection pools
- Server capacity
- Potential CPU/memory resources

and can interfere with normal application traffic.

Instead:

```text
Client
   │
   │ 1. Request upload
   ▼
Application
   │
   │ 2. Authenticate + authorize
   │ 3. Generate upload permission
   ▼
Client
   │
   │ 4. Upload directly
   ▼
Object Storage
```

This creates a useful separation:

```text
Control Plane
────────────────────────────
Application
- Authentication
- Authorization
- Business rules
- Metadata
- Upload permission


Data Plane
────────────────────────────
Object Storage
- Large file transfer
- Object storage
- Object retrieval
```

### Principle

> **Keep business traffic and large blob traffic separate.**

---

# 5. Pre-Signed URLs

A common mechanism for direct uploads is a **pre-signed URL**.

The application first authenticates and authorizes the user:

```text
Client
   │
   │ "I want to upload video.mp4"
   ▼
Application
   │
   │ Authenticate
   │ Authorize
   │ Determine object key
   │ Determine allowed operation
   ▼
Pre-signed URL
   │
   ▼
Client
   │
   │ Large file
   ▼
Object Storage
```

The URL provides temporary, constrained permission to perform the operation.

The client therefore does **not** need unrestricted access to the storage system.

### Why is the application still involved?

Because the application owns the business authorization decision.

For example:

```text
User
  ↓
Application
  ↓
"Is this user allowed to upload?"
  ↓
YES
  ↓
Generate temporary upload permission
  ↓
Client → Object Storage
```

The application can also determine things such as:

- Which object key the user should receive.
- Which operation is allowed.
- How long the permission should remain valid.
- Which business entity the object belongs to.

### Principle

> **The application decides who can access the object; object storage handles the bytes.**

---

# 6. Multipart Uploads

A large file should not necessarily be treated as one enormous upload request.

Suppose we have:

```text
10 GB video

┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐
│ P1 │ P2 │ P3 │ P4 │ P5 │ P6 │ P7 │ P8 │ P9 │P10 │
└────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘
```

Each part can be uploaded independently.

### Resumability

Suppose:

```text
P1 ✓
P2 ✓
P3 ✓
P4 ✓
P5 ✓
P6 ✓
P7 ✗
P8 ✓
P9 ✓
P10 ✗
```

We don't need to restart the entire 10 GB upload.

We can retry:

```text
P7
P10
```

while preserving the successfully uploaded parts.

This is particularly valuable for large files because the cost of restarting an entire upload grows with file size.

### Parallelism

Parts can potentially be uploaded concurrently:

```text
             ┌── P1 ──→
             ├── P2 ──→
             ├── P3 ──→ Object Storage
Client ──────┼── P4 ──→
             └── P5 ──→
```

This can improve throughput, subject to network and object-storage limits.

### Principle

> **Multipart upload provides resumability and can enable parallel transfer.**

---

# 7. Multipart Upload ≠ Range Request

These two concepts are easy to confuse.

### Multipart upload

Used when **uploading** a large object:

```text
Client
 ├── Part 1 ──→
 ├── Part 2 ──→ Object Storage
 ├── Part 3 ──→
 └── Part 4 ──→
```

Purpose:

> Make large uploads resumable and potentially parallel.

### Range request

Used when **downloading** part of an already-stored object:

```text
10 GB video
┌───────────────────────────────────────────────┐
│                                               │
│       requested byte range                   │
│              ↓                                │
│        ┌──────────────┐                       │
│        │   Download   │                       │
│        └──────────────┘                       │
│                                               │
└───────────────────────────────────────────────┘
```

Purpose:

> Avoid transferring the entire object when the client only needs part of it.

You should know the architectural distinction; you don't need to explain how the storage system physically maps byte ranges onto disks.

---

# 8. Failure Handling During Upload

Large uploads will encounter transient failures.

Examples:

- Network interruption
- Temporary object-storage unavailability
- Connection timeout
- Network congestion

We combine multipart uploads with **bounded retries + exponential backoff + jitter**.

Example:

```text
Upload P7
   ↓
Failure
   ↓
Wait + jitter
   ↓
Retry P7
   ↓
Failure
   ↓
Longer wait + jitter
   ↓
Retry P7
```

Critically:

```text
Wrong:
Restart entire 10 GB upload

Correct:
Retry only failed parts
```

### Why jitter?

If thousands of clients fail at the same time, identical retry schedules can create a **retry storm**.

Jitter spreads retry attempts over time.

### Principle

> **Preserve successful work and retry only failed work.**

---

# 9. Object Keys and Metadata

An object needs a unique identifier/key.

For example:

```text
Bucket:
media

Object key:
users/123/videos/2026/09/video-abc123.mp4
```

The database can maintain the relationship between the business entity and the object:

```text
video_id
user_id
object_key
file_size
content_type
created_at
status
```

This allows us to query the database efficiently while using the object key to retrieve the actual blob.

For example:

```text
DB lookup
    ↓
video_id = 12345
    ↓
object_key = users/123/videos/abc.mp4
    ↓
Object Storage GET
    ↓
actual video
```

### Principle

> **Object key identifies the blob; database metadata describes its business meaning.**

---

# 10. Base Upload Architecture

Putting everything together:

```text
                         ┌──────────────────┐
                         │    Application   │
                         │                  │
                         │ Authentication   │
                         │ Authorization    │
                         │ Business Logic   │
                         │ Metadata         │
                         └────────┬─────────┘
                                  │
                         Pre-signed URL
                                  │
                                  ▼
Client ──────────────────────────────────────→ Object Storage
            Large / multipart upload

                         ┌──────────────────┐
                         │     Database     │
                         │                  │
                         │ video_id         │
                         │ user_id          │
                         │ object_key       │
                         │ file_size        │
                         │ content_type     │
                         │ created_at       │
                         └──────────────────┘
```

### Responsibility Split

| Component | Responsibility |
|---|---|
| Application | Authentication, authorization, business logic |
| Database | Searchable/queryable metadata |
| Object Storage | Large unstructured blobs |
| Client | Direct upload/download |
| Pre-signed URL | Temporary constrained access |
| Multipart Upload | Resumability + parallel transfer |

---

# 11. Interview Decision Framework

When you see:

> "Users upload large files."

Think:

```text
Large blob?
     ↓
Object Storage
     ↓
Don't proxy through application
     ↓
Pre-signed URL
     ↓
Large upload?
     ↓
Multipart / resumable
     ↓
Failure?
     ↓
Retry failed parts
     ↓
Metadata/search?
     ↓
Database
```

### Core Mental Model

> **Application controls access and business metadata. Object Storage handles the bytes. Database handles searchable metadata. Multipart upload makes large transfers resumable.**
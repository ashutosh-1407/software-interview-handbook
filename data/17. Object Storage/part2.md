# Object Storage — Part 2: Durability, Consistency & Storage Lifecycle

## 12. Durability vs. Availability

Two important properties of object storage are **durability** and **availability**.

### Durability

Durability answers:

> **"Will my stored data be permanently lost?"**

For example, if a disk or server fails, the system should still retain the object.

### Availability

Availability answers:

> **"Can I access my object right now?"**

An object can therefore be:

```text
Highly durable
+
Temporarily unavailable
```

For example, an infrastructure failure might temporarily prevent reads while the underlying data remains safely stored.

### Important distinction

```text
Durability
→ Probability data is not permanently lost

Availability
→ Probability data is accessible when requested
```

Don't equate durability with availability.

### Principle

> **Durability protects data from permanent loss; availability determines whether you can access it now.**

---

# 13. How Object Storage Achieves Durability

Object storage systems typically use **redundancy** to protect against hardware and infrastructure failures.

Instead of:

```text
Object
  ↓
One disk
```

we want the data protected across multiple failure domains.

Conceptually:

```text
             Object
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
    Copy A    Copy B    Copy C
```

If one underlying component fails, other copies or redundant data can be used to reconstruct the object.

Depending on the storage system, redundancy can involve:

- Multiple disks
- Multiple storage nodes
- Multiple failure domains
- Geographic replication

### Multi-region replication

For stronger disaster-recovery requirements, an organization may replicate data across regions:

```text
Region A
Object
  │
  └──────────────→ Region B
                    Replica
```

This can protect against larger regional failures.

However:

> **Multi-region replication is a design choice based on durability and disaster-recovery requirements; it isn't automatically required for every object-storage system.**

### Principle

> **Durability comes from redundancy across independent failure domains.**

---

# 14. Replication vs. Erasure Coding

Replication is straightforward:

```text
Original object
      │
 ┌────┼────┐
 ▼    ▼    ▼
Copy Copy Copy
```

For example, keeping three complete copies provides redundancy, but it also requires roughly three times the raw storage for the data portion.

### Erasure coding

Erasure coding instead divides the object into **data and parity fragments**.

Conceptually:

```text
Object
  ↓
┌────┬────┬────┬────┬────┬────┐
│ D1 │ D2 │ D3 │ D4 │ P1 │ P2 │
└────┴────┴────┴────┴────┴────┘
```

The fragments are distributed across different storage nodes.

If some fragments are lost, the original object can be reconstructed from the remaining fragments.

### Main trade-off

```text
Replication
→ simpler
→ more storage overhead

Erasure Coding
→ more storage-efficient redundancy
→ more computational/reconstruction complexity
```

For system-design interviews, you generally need to know:

- What erasure coding is.
- Why it provides redundancy.
- Why it can use less storage than full replication.

You usually don't need to design the erasure-coding algorithm itself.

### Principle

> **Erasure coding trades additional computation/complexity for more storage-efficient redundancy.**

---

# 15. Consistency

Consistency determines **what a client is guaranteed to observe after a write**.

Consider:

```text
Client
  │
  │ PUT photo.jpg
  ▼
Object Storage
  │
  │ success
  ▼
Client
  │
  │ GET photo.jpg
  ▼
Object Storage
```

With strong consistency, after a successful write, subsequent reads are guaranteed to observe the appropriate latest state according to the storage system's consistency model.

With weaker/eventual consistency, there may be a period where a read can observe an older state.

### Strong vs. eventual consistency

```text
Strong consistency
    Write
      ↓
    Success
      ↓
    Subsequent read → latest state


Eventual consistency
    Write
      ↓
    Success
      ↓
    Some reads → potentially stale state
      ↓
    Eventually → converges
```

### Important interview nuance

Don't automatically say:

> "Strong consistency means synchronous replication."

Replication strategy and consistency guarantees are related architectural concerns, but they aren't identical.

A system can use different mechanisms to provide a particular consistency guarantee.

### Principle

> **Consistency describes what state clients are guaranteed to observe, not simply where copies are stored.**

---

# 16. Object Versioning

Suppose:

```text
photo.jpg
   ↓
Original image
```

A user accidentally uploads another object using the same key:

```text
photo.jpg
   ↓
New image
```

Without versioning, the original may be overwritten.

With versioning:

```text
photo.jpg
   │
   ├── Version 1 → Original
   ├── Version 2 → Updated
   └── Version 3 → Updated again
```

Now an accidental overwrite can be recovered by restoring an earlier version.

Versioning can also help with accidental deletes.

Depending on the object-storage implementation, a delete may create a **delete marker** while previous versions remain recoverable.

### Trade-off

Versioning improves recovery but increases storage consumption.

Therefore, versioning often needs to be combined with **lifecycle policies** to control how long older versions are retained.

### Principle

> **Versioning turns destructive changes into recoverable history.**

---

# 17. Lifecycle Management

Not all objects have the same access pattern.

Consider a video platform:

```text
Upload
  ↓
Frequently accessed
  ↓
Occasionally accessed
  ↓
Rarely accessed
  ↓
Archive
```

Keeping every object in the same storage tier may not be cost-efficient.

Object storage systems commonly provide different storage tiers/classes with different cost and access characteristics.

### Example

```text
Hot / Active
    ↓
Frequent access
    ↓
Higher storage/access characteristics

        ↓ lifecycle policy

Cold
    ↓
Rare access
    ↓
Lower storage cost
    ↓
Potentially higher retrieval cost/latency

        ↓

Archive
    ↓
Very rare access
    ↓
Lowest storage cost
    ↓
Potentially much slower retrieval
```

Lifecycle policies can automatically transition objects between tiers based on rules such as:

- Object age
- Prefix/category
- Retention requirements
- Access patterns, depending on the storage system

They can also expire/delete objects after a defined retention period.

### Example policy

```text
Day 0
→ Standard storage

After 30 days
→ Infrequent-access tier

After 180 days
→ Archive tier

After 7 years
→ Delete
```

The exact values are application-specific.

### Principle

> **Lifecycle management optimizes storage cost based on an object's access and retention requirements.**

---

# 18. Secure Downloads

We used direct uploads to prevent large files from consuming application resources.

The same principle applies to downloads.

Avoid:

```text
Client
   │
   │ 5 GB
   ▼
Application
   │
   │ 5 GB
   ▼
Object Storage
```

Instead:

```text
Client
   │
   │ Request download
   ▼
Application
   │
   │ Authenticate + authorize
   │ Generate temporary access
   ▼
Client
   │
   │ 5 GB
   ▼
Object Storage
```

The application remains responsible for the **authorization decision**, but the large data transfer bypasses the application.

This protects application resources such as:

- Network bandwidth
- Connection pools
- Server capacity
- Normal request latency

### Principle

> **Authorize through the application; transfer large objects directly from storage.**

---

# 19. Range Requests

A client doesn't always need an entire object.

Consider a 10 GB video where the user seeks to a particular section.

Instead of:

```text
Download entire 10 GB
```

the client can request only a particular byte range.

Conceptually:

```text
10 GB video

┌───────────────────────────────────────────────┐
│                                               │
│        requested byte range                  │
│              ↓                                │
│        ┌──────────────┐                       │
│        │   Download   │                       │
│        └──────────────┘                       │
│                                               │
└───────────────────────────────────────────────┘
```

This can reduce:

- Bandwidth
- Download time
- Client-side work

### Important distinction

Range requests are **not the same as multipart uploads**.

```text
Multipart Upload
→ split a large upload into parts

Range Request
→ retrieve only part of an existing object
```

The object can remain one logical object even when clients retrieve only portions of it.

### Principle

> **Transfer only the bytes the client actually needs.**

---

# 20. CDN in Front of Object Storage

Suppose a video is viewed by millions of users globally.

Without a CDN:

```text
Users
  │
  ├────────→ Object Storage
  ├────────→ Object Storage
  ├────────→ Object Storage
  └────────→ Object Storage
```

The origin receives repeated requests for the same content.

With a CDN:

```text
                    ┌── Edge: US
                    │
Client ──→ CDN ─────┼── Edge: Europe
                    │
                    └── Edge: Asia
                           │
                           ↓
                     Object Storage
                        (Origin)
```

The CDN caches frequently requested objects at geographically distributed edge locations.

### Cache miss

```text
Client
  ↓
CDN
  ↓ cache miss
Object Storage
  ↓
CDN caches object
  ↓
Client
```

Subsequent requests can be served directly from the nearby edge.

### Benefits

- Lower latency
- Reduced origin traffic
- Reduced object-storage reads
- Better global content delivery
- Improved scalability for read-heavy workloads

### Important nuance

The CDN doesn't necessarily have the content preloaded.

A common model is:

> **Cache miss → fetch from origin → cache → serve subsequent requests from the edge.**

### Principle

> **Use a CDN to move frequently accessed content closer to users and reduce origin load.**

---

# 21. Object Storage Read Architecture

For a large read-heavy workload, the architecture can become:

```text
                     ┌──────────────┐
                     │ Application  │
                     │ Auth / Authz │
                     └──────┬───────┘
                            │
                     Access permission
                            │
                            ▼
Client ───────────────→ CDN
                         │
                  ┌──────┴──────┐
                  │             │
               Cache Hit     Cache Miss
                  │             │
                  ▼             ▼
                Client    Object Storage
```

The application is therefore **not necessarily in the data path** for every large download.

It remains part of the authorization/control flow.

---

# 22. Interview Decision Framework

When you see:

> "Users upload and download large media files."

Think:

```text
Large unstructured data?
        ↓
Object Storage
        ↓
Don't proxy through application
        ↓
Pre-signed URLs
        ↓
Large upload?
        ↓
Multipart / resumable
        ↓
Failure?
        ↓
Retry failed parts
        ↓
Need searchable metadata?
        ↓
Database
        ↓
Read-heavy?
        ↓
CDN
        ↓
Partial download?
        ↓
Range requests
        ↓
Accidental overwrite/delete?
        ↓
Versioning
        ↓
Old / rarely accessed data?
        ↓
Lifecycle + storage tiers
```

### 30-Second Mental Model

> **Object storage separates large blob storage from application compute. The application handles authentication, authorization, business logic, and metadata, while clients transfer large objects directly using temporary permissions such as pre-signed URLs. Multipart uploads make large uploads resumable. Redundancy provides durability, versioning protects against accidental changes, lifecycle policies optimize storage cost, and CDNs improve global read performance.**
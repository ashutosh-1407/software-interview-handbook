# Message Queues — Part 2: Reliability & Failure Handling

## 15. Why Can Messages Be Delivered More Than Once?

Even with ACKs, duplicate delivery can happen.

Consider:

Message
    ↓
Worker
    ↓
Process successfully
    ↓
Worker crashes
    ↓
ACK never reaches queue

The queue doesn't know that processing succeeded.

So it makes the message available again:

Message
    ↓
Worker 2
    ↓
Process again

This is one of the fundamental reasons distributed message processing is difficult.

---

## 16. Delivery Semantics

There are three common delivery models.

### At-most-once

The message is delivered zero or one time.

    0 or 1

The system prioritizes avoiding duplicates, but a message can be lost.

Useful when losing a small amount of data is acceptable.

Example:

Some analytics workloads may tolerate losing a small fraction of events.

---

### At-least-once

The message is delivered at least once, but may be delivered multiple times.

    1 or more

This is commonly preferred when losing work is unacceptable.

Example:

PaymentRequested
    ↓
Worker
    ↓
Payment succeeds
    ↓
Worker crashes before ACK
    ↓
Message is delivered again

The message may now be processed twice.

Therefore:

> At-least-once delivery requires consumers to be able to safely handle duplicate messages.

---

### Exactly-once

Exactly-once means the system guarantees that the message is delivered/processed exactly once within the guarantees provided by that particular system.

    Exactly 1

For interviews, distinguish between:

### Exactly-once delivery

The message is delivered once.

### Exactly-once business effect

Even if a message is delivered multiple times, the final business result is equivalent to processing it once.

This distinction is extremely important.

---

## 17. Idempotency

An operation is **idempotent** when executing it multiple times produces the same business effect as executing it once.

Example:

PaymentRequested
    ↓
Charge $100

Without idempotency:

First processing  → -$100
Second processing → -$100

Total = -$200 ❌

With idempotency:

First processing  → -$100
Second processing → Already processed → Skip

Total = -$100 ✅

Therefore:

> **At-least-once delivery + idempotent consumers can provide an exactly-once business effect.**

---

## 18. Idempotency Key

The consumer needs a way to determine whether a particular business operation has already been processed.

For example:

payment_id = PAY123

The consumer checks durable storage:

Was PAY123 already processed?

If yes:

Skip the business operation
    ↓
ACK

If no:

Perform operation
    ↓
Record successful processing
    ↓
ACK

Conceptually:

Message
   ↓
Extract idempotency key
   ↓
Check processed state
   │
   ├── Already processed → Skip → ACK
   │
   └── New
         ↓
      Process
         ↓
      Record result
         ↓
        ACK

The idempotency key should uniquely identify the business operation.

Examples:

payment_id

order_id + "payment"

order_id + "confirmation_email"

The correct key depends on the operation being performed.

---

## 19. Where Should Idempotency State Be Stored?

Suppose the worker stores:

PAY123 → processed

only in memory.

The worker crashes.

That information disappears.

The message is delivered again.

The new worker doesn't know that PAY123 was already processed.

Therefore, idempotency state generally needs **durable storage**.

Example:

ProcessedOperations

operation_id | status
-------------|--------
PAY123       | SUCCESS

A uniqueness constraint on the operation ID can help prevent duplicate processing.

---

## 20. Retries

Not every failure is permanent.

For example:

Worker
    ↓
Email Service
    ↓
503 Service Unavailable

A `503` often indicates a temporary service-side problem.

Instead of immediately giving up:

Retry

the worker can retry the operation.

---

## 21. Exponential Backoff

We generally don't want workers to retry immediately and continuously:

Failure
    ↓
Retry
    ↓
Failure
    ↓
Retry
    ↓
Failure
    ↓
Retry

If the downstream service is already unhealthy, this can make the problem worse.

Instead, increase the delay between retries:

Failure
    ↓
Wait 1s
    ↓
Retry
    ↓
Wait 2s
    ↓
Retry
    ↓
Wait 4s
    ↓
Retry
    ↓
Wait 8s
    ↓
...

This is **exponential backoff**.

The exact timing is system-dependent.

---

## 22. Why Backoff Matters

Suppose 10,000 workers all receive:

503 Service Unavailable

If they all retry immediately:

10K failures
      ↓
10K retries
      ↓
Downstream overloaded
      ↓
More failures
      ↓
More retries

This can create a **retry storm**.

Backoff spreads retry attempts over time:

Failure
    ↓
Backoff
    ↓
Retry

This reduces pressure on the failing dependency.

---

## 23. Jitter

Even with exponential backoff, if every worker uses exactly the same schedule:

1s
2s
4s
8s

many workers may retry at approximately the same time.

**Jitter** adds randomness to the retry delay.

For example:

Worker 1 → retry after 1.2s
Worker 2 → retry after 1.7s
Worker 3 → retry after 0.9s
Worker 4 → retry after 1.4s

This spreads the retry traffic further.

The goal is:

> **Avoid having many workers retry simultaneously.**

---

## 24. Retryable vs Permanent Failures

A key production skill is distinguishing between failures that may recover and failures that won't.

### Likely retryable

Examples:

- HTTP 503
- Temporary network failure
- Timeout
- Temporary downstream overload

These may recover if we try again.

---

### Likely permanent

Examples:

- Malformed payload
- Missing required field
- Invalid business data
- Unsupported message format

Retrying the same message won't magically fix it.

Example:

Message
    ↓
Validation
    ↓
Missing required field

Retrying the exact same message repeatedly is usually pointless.

---

## 25. Retry Limit

We should not retry forever.

Example:

Retry 1
Retry 2
Retry 3
Retry 4
    ↓
Retry limit reached

At this point, the system needs another strategy.

Usually:

Retry limit reached
       ↓
      DLQ

---

## 26. Dead-Letter Queue (DLQ)

A **Dead-Letter Queue** isolates messages that could not be successfully processed after the normal retry policy.

Main Queue
    ↓
Worker
    ↓
Failure
    ↓
Retry
    ↓
Retry
    ↓
Retry exhausted
    ↓
DLQ

The main processing path can continue handling healthy messages.

---

## 27. Why DLQ Is Important

Without a DLQ:

Bad Message
    ↓
Retry forever
    ↓
Retry forever
    ↓
Retry forever

The same message can repeatedly consume consumer capacity.

With a DLQ:

Bad Message
    ↓
Limited retries
    ↓
DLQ
    ↓
Investigate

This prevents permanently failing messages from consuming the normal processing capacity indefinitely.

---

## 28. DLQ Is Not "Delete and Forget"

A DLQ should provide a way to investigate failures.

A message might be in the DLQ because:

- the payload was malformed
- a downstream dependency had a prolonged outage
- a bug existed in the consumer
- required configuration was missing
- the message represents a genuine business/data problem

After fixing the underlying issue, a message may be replayed/reprocessed.

Conceptually:

DLQ
 ↓
Investigate
 ↓
Fix problem
 ↓
Replay
 ↓
Main Queue / Processing

Do not blindly replay everything.

---

## 29. Retry + Backoff + DLQ

The overall failure-handling flow becomes:

Message
   ↓
Worker
   ↓
Failure
   ↓
Is it retryable?
   │
   ├── NO ───────────────→ DLQ
   │
   └── YES
         ↓
      Backoff
         ↓
       Retry
         ↓
      Success?
       /    \
     YES     NO
      ↓       ↓
     ACK    Retry again
              ↓
        Retry limit?
              ↓
             DLQ

This is one of the most important production patterns for message processing.

---

## 30. Example — Email Service

Suppose:

OrderCreated
    ↓
Email Consumer
    ↓
Email Service
    ↓
503

A reasonable flow is:

503
 ↓
Retry with exponential backoff
 ↓
Retry
 ↓
Retry
 ↓
Success
 ↓
ACK

If the service remains unavailable:

Retry limit reached
       ↓
      DLQ

The already-placed order remains successful because email is asynchronous.

---

## 31. Example — Malformed Message

Suppose:

OrderCreated

is malformed:

Missing order_id

Processing fails during validation.

Retrying won't fix the payload:

Invalid message
    ↓
Retry
    ↓
Still invalid
    ↓
Retry

After limited attempts:

DLQ

The message can later be investigated and replayed if it is recoverable.

---

## 32. Important Production Principle

Don't blindly retry everything.

Ask:

> **Is this failure likely to recover if we try again?**

If yes:

Retry + Backoff

If no:

DLQ

---

## 33. Core Mental Model

### At-most-once

    0 or 1 delivery

Avoid duplicates, but may lose work.

### At-least-once

    1+ deliveries

Protects against message loss, but requires duplicate-safe processing.

### Idempotency

    Multiple deliveries
           ↓
       One business effect

### Retry

    Transient failure
           ↓
        Try again

### Exponential backoff

    Retry
     ↓
    Wait longer
     ↓
    Retry

### DLQ

    Repeated/permanent failure
           ↓
    Remove from normal path
           ↓
    Investigate later

---

# Interview Cheat Sheet — Part 2

### What is at-most-once delivery?

The message is delivered zero or one time. It avoids duplicates but may lose work.

### What is at-least-once delivery?

The message is delivered at least once, but may be delivered multiple times.

### What is exactly-once business effect?

Repeated processing results in the same final business state as processing the message once.

### What is idempotency?

Processing the same operation multiple times produces the same business effect as processing it once.

### How do you make a consumer idempotent?

Use a durable idempotency key/state store to detect whether the business operation was already processed.

### What should be retried?

Transient failures such as timeouts, temporary network failures, and temporary downstream unavailability.

### What should generally not be retried indefinitely?

Permanent failures such as malformed messages or invalid data.

### Why use exponential backoff?

To avoid overwhelming an unhealthy downstream service with immediate repeated retries.

### Why use jitter?

To prevent many workers from retrying at exactly the same time.

### What is a DLQ?

A separate queue for messages that cannot be successfully processed after the normal retry policy.

### Can DLQ messages be processed again?

Yes. After investigation and fixing the underlying issue, recoverable messages can be replayed.

### What is the standard reliability pattern?

> **At-least-once delivery + idempotent consumers + retry with exponential backoff/jitter + DLQ.**
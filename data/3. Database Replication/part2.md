# Chapter 3: Database Replication

# Part 2 – Replication Models, Replication Lag & Read-after-Write Consistency

---

# 3.15 Synchronous vs Asynchronous Replication

Once we decide to replicate the database, another important question arises.

> **When should the Primary tell the client that the write was successful?**

There are two common approaches:

- Synchronous Replication
- Asynchronous Replication

Both solve different business problems.

Neither is universally better.

---

# 3.16 Asynchronous Replication

In asynchronous replication, the Primary acknowledges the client **before** the replicas have finished copying the update.

Timeline:

```text
Application

↓

Primary

↓

Write Successful

↓

Return Success

↓

Replica 1

↓

Replica 2
```

The user receives a successful response immediately.

Replication happens afterward.

---

# Example

Suppose a user changes their profile picture.

```text
Old Picture

↓

New Picture
```

The request reaches the Primary.

The Primary updates its local database.

Immediately afterward:

```text
✓ Success
```

is returned to the application.

Only then does replication begin.

---

# Advantages

- Very low write latency
- High write throughput
- Better scalability
- Faster user response

---

# Disadvantages

Replicas may temporarily contain stale data.

If the Primary crashes before replication finishes,

recent writes may be lost.

This is the trade-off.

---

# 3.17 Replication Lag

Definition:

> **Replication Lag is the delay between the Primary committing a write and the Replica receiving that write.**

Example:

```text
12:00:00

Primary

↓

Inventory = 100
```

Replica receives the update:

```text
12:00:00.250
```

Replication Lag:

```text
250 ms
```

The larger the lag,

the longer replicas remain stale.

---

# Causes of Replication Lag

Common causes include:

- Heavy write traffic
- Slow disks
- Slow replica hardware
- Network latency
- Replica processing large analytical queries

Replication lag should be continuously monitored in production.

---

# Business Impact

Suppose:

Inventory changes:

```text
100

↓

95
```

The replica is:

```text
5 seconds behind.
```

Another customer searches inventory.

They still see:

```text
100
```

even though:

```text
95
```

is the correct value.

Depending on the application,

this may or may not be acceptable.

---

# 3.18 Synchronous Replication

Synchronous replication behaves differently.

Instead of returning success immediately,

the Primary waits until replicas acknowledge the update.

Timeline:

```text
Application

↓

Primary

↓

Replica

↓

ACK

↓

Return Success
```

The user waits slightly longer,

but replicas remain consistent.

---

# Advantages

- Stronger consistency
- Minimal replication lag
- Better protection against data loss
- Reads from replicas are more likely to be current

---

# Disadvantages

Every write must wait for replication.

If replicas are geographically distant,

network latency directly increases write latency.

Write throughput also decreases.

---

# Visual Comparison

## Asynchronous

```text
Write

↓

Primary

↓

Success

↓

Replica
```

Fast writes.

Eventual consistency.

---

## Synchronous

```text
Write

↓

Primary

↓

Replica

↓

ACK

↓

Success
```

Slower writes.

Stronger consistency.

---

# 3.19 Which Should We Choose?

The answer depends entirely on business requirements.

---

## Example 1 – Banking

Suppose a customer transfers:

```text
$10,000
```

Would you allow another user to temporarily see an outdated balance?

Probably not.

Consistency is far more important than latency.

Synchronous replication is generally a better fit.

---

## Example 2 – Social Media

A user updates:

```text
Profile Picture
```

Another user sees the old picture for:

```text
1 second
```

Most users never notice.

Asynchronous replication is usually acceptable.

---

# Engineering Principle

There is no universally correct replication strategy.

Choose the simplest strategy that satisfies the business requirements.

---

# 3.20 Read-after-Write Consistency

Suppose a user changes:

```text
Shipping Address
```

Immediately afterward,

they refresh the page.

Expected:

```text
New Address
```

Actual:

```text
Old Address
```

Why?

Because the read was served by a replica that had not yet received the update.

This is a classic example of replication lag.

---

# Goal

Read-after-Write Consistency means:

> A user should immediately see their own updates.

Notice that this is a business requirement,

not a replication strategy.

There are multiple ways to achieve it.

---

# Approach 1 – Always Read from the Primary

Every read goes to the Primary.

```text
Application

↓

Primary
```

Advantages:

- Very simple
- Always consistent

Disadvantages:

- Primary handles every read
- Poor scalability
- Replicas are underutilized

---

# Approach 2 – Sticky Session (Preferred)

Normally:

```text
Reads

↓

Replicas
```

Immediately after a user performs a write:

```text
That User

↓

Primary
```

Other users continue reading from replicas.

After replication catches up,

the user's reads return to replicas.

Advantages:

- Excellent user experience
- Better scalability
- Primary only serves reads when necessary

---

# Visual Comparison

## Read Everything from Primary

```text
All Users

↓

Primary
```

---

## Sticky Session

```text
Recently Updated User

↓

Primary

Everyone Else

↓

Replicas
```

Only users who recently performed writes are temporarily routed to the Primary.

---

# Approach 3 – Accept Eventual Consistency

Some applications simply accept that replicas may briefly return stale data.

Suitable examples include:

- Product Catalog
- News
- Reviews
- Restaurant Listings
- Analytics

Users typically do not notice small delays.

---

# 3.21 Apple Example

Imagine a warehouse employee updates inventory.

Immediately afterward,

they refresh the inventory screen.

The application temporarily routes that employee's reads to the Primary.

Meanwhile,

other employees continue reading from replicas.

This balances:

- Scalability
- User Experience
- Consistency

---

# 3.22 Critical vs Optional Features

## Critical Features

Examples:

- Inventory Updates
- Payments
- Banking Transactions
- Password Changes

These often require:

- Synchronous Replication
- Read-after-Write Consistency

---

## Optional Features

Examples:

- Reports
- Analytics
- Product Descriptions
- User Profiles
- Recommendations

These commonly use:

- Asynchronous Replication
- Eventual Consistency

---

# 3.23 If Replication Lag Increases

Suppose replication lag grows from:

```text
20 ms

↓

5 seconds
```

Possible consequences:

- Stale inventory
- Incorrect reports
- Users seeing outdated profiles
- Poor user experience

Possible causes:

- Heavy write traffic
- Slow replica
- Slow storage
- Network issues

---

# 3.24 Business Impact

Replication introduces an important trade-off.

Asynchronous replication improves:

- Write latency
- Throughput

but increases:

- Replication lag
- Stale reads

Synchronous replication improves:

- Consistency
- Data durability

but increases:

- Write latency
- Operational cost

Business requirements determine which trade-off is acceptable.

---

# 3.25 Mental Model

Whenever choosing a replication strategy,

ask:

```text
Can the business tolerate stale reads?
```

If:

```text
YES
```

Asynchronous replication is often appropriate.

If:

```text
NO
```

Consider:

- Synchronous replication
- Read-after-Write Consistency
- Sticky Sessions

Never choose a replication strategy without understanding the business requirement.

---

# Interview Questions

## Q1

Suppose a banking application transfers:

```text
$10,000
```

Would you recommend synchronous or asynchronous replication?

Why?

---

## Q2

Suppose Instagram users update their profile picture.

Which replication strategy would you choose?

Would you implement Read-after-Write Consistency?

Explain your reasoning.

---

## Q3

A user updates their shipping address.

Immediately afterward,

they refresh the page and still see the old address.

What happened?

How would you solve it?

---

## Q4

Explain the difference between:

- Always reading from the Primary
- Sticky Sessions

Which approach scales better?

Why?

---

# Key Takeaways

1. Replication Lag is inevitable in asynchronous replication.

2. Synchronous replication provides stronger consistency at the cost of higher latency.

3. Read-after-Write Consistency is a business requirement, not a replication strategy.

4. Sticky Sessions provide Read-after-Write Consistency while maintaining scalability.

5. The correct replication strategy depends entirely on business requirements.

---

**Next:** Part 3 – Failover, Leader Election, Split Brain & Quorum.
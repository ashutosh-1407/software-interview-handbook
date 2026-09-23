# Proxy Pattern

## Problem

Sometimes a client should not access an object directly.

Reasons may include:

- access control;
- lazy creation;
- caching;
- logging;
- rate limiting;
- remote communication;
- validation before forwarding.

The design problem is:

> How can we control access to an object without changing the object itself?

## Solution

The Proxy Pattern provides a substitute object with the same interface as the real object.

```text
Client → Proxy → Real Object
```

The client interacts with the proxy as if it were the real object.

The proxy decides whether and when to forward the request.

## Our Game Example

We created:

```text
CombatTarget
├── Dragon
└── ProtectedTargetProxy
```

Both expose:

```text
receive_damage(damage)
is_alive()
```

The proxy wraps a real target:

```text
ProtectedTargetProxy(Dragon)
```

While locked:

```text
Player → Proxy → reject
```

After unlocking:

```text
Player → Proxy → Dragon
```

## Main Participants

### Subject

`CombatTarget`

Defines the common interface:

```text
receive_damage(damage)
is_alive()
```

### Real Subject

`Dragon`

The real object that owns health, armor, and damage behavior.

### Proxy

`ProtectedTargetProxy`

Stores the real target and controls access to it.

Responsibilities:

- track whether access is unlocked;
- reject damage while locked;
- forward damage after unlocking;
- delegate `is_alive()` to the real target.

## Access Flow

### Locked

```text
proxy.receive_damage(damage)
    → check access
    → reject request
    → Dragon remains unchanged
```

### Unlocked

```text
proxy.unlock()
proxy.receive_damage(damage)
    → check access
    → forward to Dragon
    → Dragon loses health
```

## Why the Interface Matters

The caller can depend on `CombatTarget`:

```text
target.receive_damage(damage)
```

It does not need to know whether `target` is:

- a Dragon;
- a protected Dragon;
- a remote target;
- a cached target.

The proxy can be substituted wherever the real subject is expected.

## Connection to SOLID

### Single Responsibility Principle

`Dragon` owns combat behavior.

`ProtectedTargetProxy` owns access control.

### Open/Closed Principle

Access control can be added without modifying `Dragon`.

### Liskov Substitution Principle

The proxy implements the same `CombatTarget` interface as the real target.

## Types of Proxy

### Protection Proxy

Controls access based on permissions or state.

```text
ProtectedTargetProxy
```

### Virtual Proxy

Delays expensive object creation until needed.

Examples:

- loading a large image;
- loading a remote Dragon;
- creating a large enemy group.

### Caching Proxy

Stores previous results to avoid repeated work.

### Remote Proxy

Represents an object in another process or service.

### Logging Proxy

Records calls before forwarding them.

### Rate-Limiting Proxy

Restricts how frequently operations can occur.

## Proxy vs Decorator

These patterns both wrap objects, but their primary intent differs.

### Proxy

Controls access to the wrapped object.

```text
Should this request be allowed or forwarded?
```

### Decorator

Adds behavior around the wrapped object.

```text
How can I enhance this object’s behavior?
```

Our examples:

```text
ProtectedTargetProxy → controls access
EmpoweredWeapon      → adds damage
```

A proxy may sometimes add behavior, and a decorator may sometimes check conditions, so intent is the most useful distinction.

## Proxy vs Adapter

### Proxy

Maintains the same interface:

```text
CombatTarget → ProtectedTargetProxy
```

### Adapter

Changes an incompatible interface:

```text
AncientAxe → AncientAxeAdapter → Weapon
```

A useful distinction:

> Proxy preserves the interface.  
> Adapter converts the interface.

## Proxy vs Facade

### Proxy

Represents one underlying object and controls access to it.

### Facade

Coordinates multiple subsystem objects behind a simpler API.

```text
ProtectedTargetProxy → one target
BattleFacade → many battle subsystems
```

## Advantages

- Controls access without changing the real object.
- Preserves the original interface.
- Supports lazy loading and caching.
- Separates access concerns from domain logic.
- Can protect expensive or remote resources.
- Makes cross-cutting behavior replaceable.

## Disadvantages

- Adds another layer of indirection.
- The client may not realize it is using a proxy.
- Debugging can be less direct.
- Proxy behavior may differ subtly from the real object.
- Overuse can make simple operations harder to follow.

## Common Mistakes

### Changing the interface

If the proxy exposes a completely different API, it may be a Facade or Adapter instead.

### Putting domain rules in the proxy

The proxy should control access. Health and armor rules belong in `Dragon`.

### Forgetting to forward operations

Every supported operation should either be handled by the proxy or delegated to the real subject.

### Hiding expensive behavior

If the proxy performs network or loading operations, its latency should be documented.

### Assuming every wrapper is a Proxy

The purpose matters: access control, substitution, or lifecycle management indicates Proxy.

## When to Use Proxy

Use it when:

- access must be controlled;
- object creation is expensive;
- results can be cached;
- the real object is remote;
- logging or rate limiting is needed;
- the real object should remain unchanged.

Examples:

- authentication guards;
- lazy image loading;
- API clients;
- cached repositories;
- remote services;
- protected game bosses.

## When Not to Use Proxy

Avoid it when:

- the wrapped object is simple;
- no access or lifecycle control is needed;
- a direct reference is clearer;
- the wrapper only renames methods;
- a Decorator or Adapter better describes the intent.

## Interview Explanation

> Proxy provides a substitute object with the same interface as the real object and controls access to it. It can add protection, lazy loading, caching, logging, or remote communication without modifying the real subject.

## Our Implementation Summary

```text
CombatTarget
    common interface

Dragon
    real subject

ProtectedTargetProxy
    wraps a CombatTarget
    blocks damage while locked
    forwards damage after unlock
    delegates is_alive()
```

## Key Lesson

The client should be able to use the proxy wherever it could use the real object.

Instead of changing `Dragon` to understand access control, we use:

```text
ProtectedTargetProxy(Dragon)
```

The proxy controls access while the Dragon remains focused on combat behavior.
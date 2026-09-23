# Behavioral Patterns — Interview Cheat Sheet

## Strategy

**Intent:** Encapsulate interchangeable algorithms.

**Game example:**

```text
Weapon
├── Sword
├── Bow
└── MagicStaff
```

**Recognize it when:**

- an algorithm varies;
- conditionals select behavior;
- the caller should depend on an abstraction.

**Interview phrase:**

> Strategy lets an object choose among interchangeable algorithms at runtime.

---

## Observer

**Intent:** Notify multiple listeners when an event occurs.

**Game example:**

```text
AttackEventPublisher
├── BattleLog
└── DamageStatistics
```

**Recognize it when:**

- multiple components react to one event;
- new listeners may be added;
- the publisher should not know concrete listeners.

**Interview phrase:**

> Observer creates a one-to-many relationship between a publisher and subscribers.

---

## State

**Intent:** Change an object’s behavior when its internal state changes.

**Game example:**

```text
Player
├── NormalState
├── StunnedState
└── DeadState
```

**Recognize it when:**

- behavior depends on current condition;
- state-related conditionals are growing;
- states have distinct rules and transitions.

**Interview phrase:**

> State replaces state-based conditionals with state-specific behavior objects.

---

## Command

**Intent:** Encapsulate an action as an object.

**Game example:**

```text
AttackCommand
    execute()
    undo()
```

**Recognize it when:**

- actions need history;
- execution should be delayed;
- queueing, replay, macros, or undo are required.

**Interview phrase:**

> Command turns a request into an object that can be stored, executed, queued, or undone.

---

## Chain of Responsibility

**Intent:** Pass a request through a sequence of handlers.

**Game example:**

```text
DistanceHandler
    → DragonAliveHandler
    → PerformAttackHandler
```

**Recognize it when:**

- several independent checks may reject a request;
- handlers should be reorderable;
- the sender should not know who handles the request.

**Interview phrase:**

> Chain of Responsibility lets handlers process, reject, or forward a request.

---

## Key Distinctions

```text
Strategy → choose how an operation works
State    → behavior changes with internal condition
Command  → represent what action should happen
Observer → notify who is interested
Chain    → pass request through sequential handlers
```

## Common Confusions

### Strategy vs State

```text
Strategy → caller chooses the algorithm
State    → object’s condition changes its behavior
```

### Command vs Strategy

```text
Strategy → how to perform an operation
Command  → represent and manage an operation
```

### Observer vs Chain

```text
Observer → notify multiple interested listeners
Chain    → pass through ordered handlers, often stopping early
```

## Behavioral Pattern Question

Ask:

> Is the problem about choosing behavior, changing behavior, notifying objects, representing an action, or passing a request through checks?

That usually identifies the correct behavioral pattern.
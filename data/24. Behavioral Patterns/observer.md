# Observer Pattern

## Problem

The game needs to react whenever an attack occurs.

Several components may be interested:

- Battle log
- Damage statistics
- Achievement tracker
- GUI notifications
- Analytics

A naïve implementation makes `Game` call each component directly:

```text
battle_log.record(event)
damage_statistics.record(event)
achievement_tracker.record(event)
```

This creates tight coupling. Every new reaction requires modifying `Game`.

The design problem is:

> How can one object announce that something happened without knowing who is listening?

## Solution

The Observer Pattern defines a one-to-many relationship:

- One object publishes an event.
- Many observers subscribe to it.
- When the event occurs, every subscribed observer is notified.

```text
AttackEventPublisher
        │
        ├── BattleLog
        ├── DamageStatistics
        └── Future observers
```

The publisher does not know the concrete observer types. It only knows that observers can handle an attack event.

## Our Game Example

When the player attacks:

```text
Player attacks Dragon
        ↓
Game creates AttackEvent
        ↓
AttackEventPublisher publishes it
        ↓
BattleLog receives it
DamageStatistics receives it
```

The attack event contains:

- attacker name
- weapon name
- target name
- success/failure
- damage amount
- damage type
- mana spent
- failure reason

## Main Participants

### Subject / Publisher

`AttackEventPublisher`

Responsibilities:

- subscribe observers
- unsubscribe observers
- publish events
- notify all subscribed observers

### Observer

`AttackObserver`

An interface defining:

```text
on_attack(event)
```

Any class interested in attack events implements this interface.

### Concrete Observers

`BattleLog`

Stores attack events and records a readable battle message.

`DamageStatistics`

Tracks:

- total successful attacks
- total damage dealt

## Important Design Detail

The publisher depends on the observer abstraction:

```text
AttackEventPublisher → AttackObserver
```

It does not depend directly on:

```text
AttackEventPublisher → BattleLog
AttackEventPublisher → DamageStatistics
```

This allows new observers to be added without changing the publisher.

## Connection to SOLID

### Single Responsibility Principle

Each observer has one reason to change:

- `BattleLog` changes when logging changes.
- `DamageStatistics` changes when statistics change.
- The publisher changes only when event subscription behavior changes.

### Open/Closed Principle

We can add a new observer, such as `AchievementTracker`, without modifying the existing publisher or observers.

### Dependency Inversion Principle

The publisher depends on the `AttackObserver` abstraction rather than concrete classes.

## Subscription Lifecycle

Observers can be added:

```text
publisher.subscribe(battle_log)
```

They can also be removed:

```text
publisher.unsubscribe(battle_log)
```

After unsubscribing, that observer no longer receives future events.

This is useful when:

- a screen is closed
- a feature is disabled
- a temporary listener is needed
- a user leaves a game mode

## Observer vs Message Queue

Our implementation is a classic in-memory Observer:

```text
publish(event) → immediately notify observers
```

A message queue usually:

- stores messages
- allows later processing
- may run asynchronously
- can communicate across processes or services

Both use events, but their delivery models are different.

## Observer vs Direct Calls

Without Observer:

```text
Game → BattleLog
Game → DamageStatistics
Game → AchievementTracker
```

With Observer:

```text
Game → AttackEventPublisher → observers
```

The game flow only publishes an event. It does not need to know how each observer reacts.

## Trade-offs

### Advantages

- Loose coupling
- Easy to add new reactions
- Supports multiple listeners
- Keeps responsibilities separated
- Useful for UI updates, logging, analytics, and notifications

### Disadvantages

- Event flow can be harder to trace
- Too many observers can create hidden side effects
- Notification order may be unpredictable
- Observers must be unsubscribed correctly
- Synchronous observers can slow down the publisher

## Common Mistakes

### Calling observers directly

```text
battle_log.on_attack(event)
```

This bypasses the publisher and creates coupling.

### Putting business logic inside the publisher

The publisher should distribute events, not calculate damage or update game state.

### Sending incomplete events

An event should contain enough information for observers to react without querying the publisher or game state.

### Forgetting failed events

Failed attacks can be useful for logs, metrics, and anti-cheat analysis. Publish both successful and failed attack events when appropriate.

## When to Use Observer

Use Observer when:

- many components react to the same event
- new reactions may be added later
- the publisher should not know concrete listeners
- reactions are independent of the main operation

Examples:

- UI notifications
- audit logs
- analytics
- cache invalidation
- email notifications
- domain events
- monitoring

## When Not to Use Observer

Avoid it when:

- there is only one simple consumer
- direct method calls are clearer
- execution order is critical
- hidden side effects would make the system difficult to understand

## Interview Explanation

> Observer defines a one-to-many relationship between a publisher and its subscribers. When the publisher produces an event, all subscribed observers are notified. The publisher depends on an observer abstraction rather than concrete classes, so new reactions can be added without modifying the publisher.

## Our Implementation Summary

```text
AttackEvent
    immutable description of what happened

AttackObserver
    abstraction for listeners

AttackEventPublisher
    manages subscriptions and publishes events

BattleLog
    records attack events

DamageStatistics
    counts successful attacks and total damage
```

## Key Lesson

The Observer Pattern separates:

- the thing that announces an event
- from the things that react to it

The attacker does not need to know who is listening.
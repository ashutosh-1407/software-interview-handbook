# Composite Pattern

## Problem

The game may need to target either:

- one enemy;
- a group of enemies.

For example:

```text
Dragon
```

or:

```text
Dragon Party
├── Dragon
├── Dragon
└── Dragon
```

Without Composite, the caller may need separate logic:

```text
if target is a Dragon:
    target.receive_damage(damage)
elif target is a group:
    for enemy in target:
        enemy.receive_damage(damage)
```

The design problem is:

> How can individual objects and groups of objects be treated through the same interface?

## Solution

The Composite Pattern composes objects into tree structures and lets clients treat individual objects and groups uniformly.

```text
CombatTarget
├── Dragon       (leaf)
└── EnemyGroup   (composite)
```

Both implement:

```text
receive_damage(damage)
is_alive()
```

The Player does not need to know whether the target is one Dragon or a group.

## Our Game Example

### Individual Target

```text
Dragon.receive_damage(damage)
Dragon.is_alive()
```

### Group Target

```text
EnemyGroup.receive_damage(damage)
    → forwards damage to every child

EnemyGroup.is_alive()
    → true if any child is alive
```

The caller uses the same code:

```text
player.attack(target, distance)
```

where `target` can be either a `Dragon` or an `EnemyGroup`.

## Main Participants

### Component

`CombatTarget`

Defines the common interface:

```text
receive_damage(damage)
is_alive()
```

### Leaf

`Dragon`

Represents an individual combat target and owns its health and armor rules.

### Composite

`EnemyGroup`

Contains child `CombatTarget` objects.

Responsibilities:

- add children;
- forward damage to children;
- determine whether any child remains alive.

## Tree Structure

```text
EnemyGroup
├── Dragon
├── EnemyGroup
│   ├── Dragon
│   └── Dragon
└── Dragon
```

A composite can contain both leaves and other composites.

This allows nested structures such as:

```text
World
└── EnemyGroup
    ├── Dragon
    └── MinionGroup
        ├── Goblin
        └── Goblin
```

## Damage Flow

```text
Player attacks EnemyGroup
        ↓
EnemyGroup.receive_damage()
        ↓
Dragon 1 receives damage
Dragon 2 receives damage
Dragon 3 receives damage
```

The Player does not loop over the children. The composite owns that responsibility.

## Alive Behavior

For a single Dragon:

```text
Dragon.is_alive()
```

returns whether its health is greater than zero.

For an `EnemyGroup`:

```text
EnemyGroup.is_alive()
```

returns `True` if at least one child is still alive.

This gives the group meaningful aggregate behavior.

## Connection to SOLID

### Single Responsibility Principle

`Dragon` handles individual enemy rules.

`EnemyGroup` handles collection behavior.

`Player` only interacts with the `CombatTarget` abstraction.

### Open/Closed Principle

New target types can be added without changing Player:

```text
Goblin
Boss
SummonedCreature
EnemyGroup
```

### Dependency Inversion Principle

Player depends on `CombatTarget`, not specifically on `Dragon`.

## Integration with Existing Patterns

Composite works with the other patterns:

```text
Player
  → Strategy weapon
  → Command attack
  → Chain validation
  → CombatTarget
      ├── Dragon
      └── EnemyGroup
```

The attack request can carry any `CombatTarget`.

## Composite vs Collection

A normal collection is only a data structure.

A Composite is a collection whose group implements the same interface as its elements.

This difference allows:

```text
target.receive_damage(damage)
```

to work for both one object and a group.

## Composite vs Facade

### Composite

Represents a hierarchy of similar objects.

```text
EnemyGroup → Dragons
```

### Facade

Provides a simplified interface over multiple subsystems.

```text
BattleFacade → Player, Dragon, Commands, Validation
```

A useful distinction:

> Composite organizes objects into a tree.  
> Facade simplifies access to a subsystem.

## Advantages

- Treats individual objects and groups uniformly.
- Simplifies client code.
- Supports nested hierarchies.
- Makes aggregate operations natural.
- Allows new leaf types without changing the client.

## Disadvantages

- The common interface may be too broad for some leaves.
- Group behavior may not always match individual behavior.
- Recursive structures can be harder to debug.
- Removing or moving children may require extra lifecycle rules.
- Undoing changes to a composite requires a more complex snapshot strategy.

## Common Mistakes

### Putting group logic in the Player

The Player should not know how children are organized.

### Exposing the internal list unnecessarily

Clients should normally use `add()` and the common interface rather than modifying the list directly.

### Assuming every operation applies identically

Some operations make sense for a Dragon but not for a group. Keep the common interface focused.

### Forgetting empty-group behavior

An empty group should have a clearly defined `is_alive()` result. In our implementation, an empty group is not alive.

## When to Use Composite

Use it when:

- objects form tree-like structures;
- clients should treat one object and a group uniformly;
- operations apply recursively;
- groups can contain other groups.

Examples:

- file systems;
- UI component trees;
- organization hierarchies;
- scene graphs;
- enemy parties;
- permission trees;
- document structures.

## When Not to Use Composite

Avoid it when:

- there is no meaningful hierarchy;
- group operations differ completely from leaf operations;
- a simple list iteration is clearer;
- the common interface would be artificial.

## Interview Explanation

> Composite lets clients treat individual objects and compositions uniformly. Both leaves and composites implement the same component interface, while the composite forwards operations to its children.

## Our Implementation Summary

```text
CombatTarget
    receive_damage()
    is_alive()

Dragon
    individual combat target

EnemyGroup
    contains CombatTarget children
    forwards damage
    reports aggregate liveness

Player
    attacks CombatTarget without knowing its concrete type
```

## Key Lesson

The caller should not need separate code for one object versus a group.

Instead of:

```text
if one target:
    attack one
else:
    loop through targets
```

we use:

```text
player.attack(target, distance)
```

The target itself decides whether it represents one object or a composition.
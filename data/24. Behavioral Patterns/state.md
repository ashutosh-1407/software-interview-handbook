# State Pattern

## Problem

An object may behave differently depending on its current state.

In Dungeon Arena, a player can be:

- Normal
- Stunned
- Dead

Each state changes what the player is allowed to do.

A naïve implementation might put all behavior in `Player`:

```text
if state == NORMAL:
    allow attack
elif state == STUNNED:
    reject attack
elif state == DEAD:
    reject attack and weapon switching
```

As the number of states and actions grows, `Player` becomes filled with conditional logic.

The design problem is:

> How can an object change its behavior when its internal state changes without accumulating many conditionals?

## Solution

The State Pattern represents each state as a separate object.

The main object delegates state-dependent behavior to its current state.

```text
Player
  └── current_state: PlayerState
          ├── NormalState
          ├── StunnedState
          └── DeadState
```

The `Player` remains the same object, but its behavior changes when its current state changes.

## Our State Rules

| State | Can attack? | Can switch weapon? |
|---|---:|---:|
| Normal | Yes | Yes |
| Stunned | No | Yes |
| Dead | No | No |

## Main Participants

### Context

`Player`

Responsibilities:

- store the current state;
- delegate state-dependent decisions;
- keep stable player data such as weapon and mana;
- change from one state to another.

### State Interface

`PlayerState`

Defines operations such as:

```text
attack()
can_switch_weapon()
```

The interface allows `Player` to work with any state without knowing its concrete type.

### Concrete States

`NormalState`

- allows attacks;
- allows weapon switching.

`StunnedState`

- rejects attacks;
- allows weapon switching.

`DeadState`

- rejects attacks;
- rejects weapon switching.

## Behavior Delegation

The `Player` does not decide the result using state conditionals.

Instead, it delegates:

```text
Player.attack()
    → current_state.attack()
```

For weapon switching:

```text
Player.switch_weapon()
    → current_state.can_switch_weapon()
```

The state decides whether the operation is allowed.

## State Transitions

The player can change state:

```text
Normal → Stunned
Stunned → Dead
Normal → Dead
```

The current implementation exposes:

```text
player.change_state(new_state)
```

For example:

```text
player.change_state(StunnedState())
player.change_state(DeadState())
```

In a larger application, domain-specific methods such as `stun()` or `die()` could hide the concrete state classes from callers.

## Connection to SOLID

### Single Responsibility Principle

Each state owns the behavior associated with that state.

`Player` no longer contains every rule for every possible state.

### Open/Closed Principle

A new state can be added without rewriting the existing attack logic.

For example:

```text
PoisonedState
FrozenState
InvisibleState
```

Each new state implements the `PlayerState` interface.

### Dependency Inversion Principle

`Player` depends on the `PlayerState` abstraction rather than directly depending on every concrete state.

## State vs Strategy

Both patterns use polymorphism, but their intent differs.

### Strategy

Strategy selects an algorithm.

```text
Player chooses Sword, Bow, or Magic Staff
```

The player generally chooses the strategy.

### State

State represents a condition that changes behavior.

```text
Normal, Stunned, or Dead
```

The object’s behavior changes because its state changes.

A useful distinction:

> Strategy answers “which algorithm should I use?”  
> State answers “how should I behave in my current condition?”

## Advantages

- Removes growing state-related conditionals.
- Keeps each state’s rules together.
- Makes state behavior easier to test.
- Makes adding new states safer.
- Makes state-dependent behavior explicit.

## Disadvantages

- Adds more classes.
- State transitions can become difficult to trace.
- Small state machines may become over-engineered.
- The context and states must agree on transition ownership.

## Common Mistakes

### Keeping all conditionals in the context

If `Player` still contains a large `if state == ...` block, the State Pattern is not providing much value.

### Sharing mutable state objects unnecessarily

Each `Player` should receive its own state instance when appropriate. A dataclass `default_factory` avoids sharing one default object between players.

### Mixing unrelated responsibilities into states

A state should control behavior affected by that state. It should not own the player’s weapon, health, or UI rendering.

### Confusing State with Strategy

If the user explicitly chooses between algorithms, that is likely Strategy. If the object behaves differently because its condition changes, that is likely State.

## When to Use State

Use State when:

- an object has a finite set of meaningful states;
- behavior changes based on the current state;
- conditional logic is growing;
- state transitions are part of the domain;
- each state has distinct rules.

Examples:

- order lifecycle;
- document workflow;
- media player modes;
- network connection states;
- game character conditions;
- payment processing states.

## When Not to Use State

Avoid it when:

- there are only one or two simple conditions;
- the behavior does not vary significantly;
- adding several classes would obscure a simple rule;
- the state transitions are not meaningful domain concepts.

## Interview Explanation

> State is a behavioral pattern that lets an object change its behavior when its internal state changes. The object delegates state-dependent operations to separate state objects, replacing large conditional blocks with polymorphism.

## Our Implementation Summary

```text
Player
    stores the current PlayerState

PlayerState
    defines state-dependent operations

NormalState
    allows attacking and weapon switching

StunnedState
    blocks attacking but allows weapon switching

DeadState
    blocks attacking and weapon switching

Player.change_state(...)
    replaces the current state
```

## Key Lesson

The State Pattern moves behavior into the state that owns the rule.

Instead of asking:

```text
What state am I in?
```

the object delegates:

```text
Current state, what should happen?
```
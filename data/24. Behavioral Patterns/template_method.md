# Template Method Pattern

## Problem

Different battle flows may follow the same overall sequence:

```text
1. Prepare the turn
2. Perform the attack
3. Process the result
4. Finish the turn
```

However, individual steps may vary by game mode.

A naïve implementation duplicates the entire algorithm in every flow:

```text
Standard mode:
    prepare
    attack
    process
    finish

Training mode:
    prepare
    attack
    process
    finish
```

Duplicating the sequence creates maintenance problems. If the order changes, every subclass must be updated.

The design problem is:

> How can we define an algorithm’s overall structure once while allowing subclasses to customize selected steps?

## Solution

The Template Method Pattern defines the algorithm skeleton in a base class.

The base class controls the order of operations. Subclasses override selected hooks.

```text
BattleFlow.run_turn()
    → _prepare_turn()
    → _perform_attack()
    → _process_result()
    → _finish_turn()
```

The order is fixed by the base class.

## Our Game Example

`BattleFlow` defines:

```text
run_turn(weapon, distance)
```

The template method performs:

```text
_prepare_turn()
_perform_attack(weapon, distance)
_process_result(result)
_finish_turn()
```

`StandardBattleFlow` overrides:

```text
_perform_attack(...)
```

and delegates the actual attack to `BattleFacade`.

## Main Participants

### Abstract Base Class

`BattleFlow`

Responsibilities:

- define the algorithm structure;
- call the steps in the correct order;
- provide hooks for customization.

### Template Method

`run_turn()`

This is the public method called by clients.

It should control the sequence and should not be overridden casually.

### Primitive Operations and Hooks

```text
_prepare_turn()
_perform_attack()
_process_result()
_finish_turn()
```

Subclasses may override these operations.

### Concrete Class

`StandardBattleFlow`

Provides the standard implementation of the attack step.

## Execution Flow

```text
Client
  → BattleFlow.run_turn()
      → _prepare_turn()
      → _perform_attack()
          → BattleFacade.attack()
      → _process_result()
      → _finish_turn()
```

The client does not control the internal order.

## Why the Template Method Matters

The important behavior is not merely calling four methods. The important behavior is owning the sequence in one place.

If the algorithm changes:

```text
prepare
validate
attack
process
finish
```

the base class changes once, and all subclasses inherit the new order.

## Connection to SOLID

### Single Responsibility Principle

The base class owns the algorithm structure.

Subclasses own variations in individual steps.

### Open/Closed Principle

New battle-flow variants can override hooks without copying the complete algorithm.

### Liskov Substitution Principle

A concrete battle flow can be used wherever a `BattleFlow` is expected.

## Template Method vs Strategy

### Template Method

Uses inheritance.

```text
Base class fixes the algorithm structure.
Subclasses customize steps.
```

### Strategy

Uses composition.

```text
An object receives a replaceable algorithm object.
```

A useful distinction:

> Template Method controls the overall workflow.  
> Strategy replaces one algorithm or behavior.

## Template Method vs Factory Method

Factory Method is often used inside Template Method designs.

```text
Template Method → fixed workflow
Factory Method  → subclass chooses a created object
```

They solve different problems.

## Hook Methods

A hook may have a default implementation:

```text
_prepare_turn()
```

A subclass can override it only when customization is needed.

This avoids forcing every subclass to implement every step.

## Advantages

- Prevents duplicated algorithm structure.
- Guarantees consistent operation order.
- Allows controlled customization.
- Centralizes workflow changes.
- Makes variation points explicit.

## Disadvantages

- Relies on inheritance.
- Subclasses may be tightly coupled to the base class.
- Too many hooks can make the workflow difficult to understand.
- A poorly designed base class can become rigid.
- The template method may be difficult to change once many subclasses depend on it.

## Common Mistakes

### Overriding the template method

If subclasses replace `run_turn()` completely, the shared algorithm structure is lost.

### Making every method abstract

Some steps should have useful default behavior. Hooks do not all need custom implementations.

### Adding too many hooks

Only expose meaningful variation points.

### Hiding important order dependencies

The base class should make the algorithm sequence clear.

### Using Template Method when composition is better

If behavior needs to change at runtime, Strategy may be more appropriate.

## When to Use Template Method

Use it when:

- multiple workflows share the same sequence;
- only selected steps vary;
- the order must remain consistent;
- inheritance is acceptable;
- common algorithm structure should be centralized.

Examples:

- data import pipelines;
- request processing;
- report generation;
- test lifecycle methods;
- game turn processing;
- authentication workflows.

## When Not to Use Template Method

Avoid it when:

- workflows differ substantially;
- behavior changes dynamically at runtime;
- composition would be more flexible;
- subclasses would need to override most of the algorithm;
- there is only one implementation.

## Our Current Integration Decision

`StandardBattleFlow` is implemented and tested, but not forced into the main game flow yet.

With only one concrete flow, adding another layer would provide little value:

```text
Game → StandardBattleFlow → BattleFacade
```

The pattern should be integrated when a second flow exists, such as:

```text
StandardBattleFlow
TrainingBattleFlow
BossBattleFlow
```

At that point, the shared sequence becomes valuable.

## Interview Explanation

> Template Method defines the skeleton of an algorithm in a base class and lets subclasses override selected steps without changing the overall order. It promotes reuse of workflow structure while allowing controlled variation.

## Our Implementation Summary

```text
BattleFlow
    run_turn()
    _prepare_turn()
    _perform_attack()
    _process_result()
    _finish_turn()

StandardBattleFlow
    overrides _perform_attack()
    delegates to BattleFacade
```

## Key Lesson

The base class owns the **order**.

The subclasses own selected **variations**.

```text
Base class → what happens and in what order
Subclass   → how selected steps happen
```
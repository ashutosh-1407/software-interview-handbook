# Chain of Responsibility Pattern

## Problem

An attack request may need to pass through several checks before execution:

```text
Is the distance valid?
        ↓
Is the Dragon alive?
        ↓
Perform the attack
```

A naïve implementation places every check in one method:

```text
if distance is invalid:
    reject
if dragon is dead:
    reject
perform attack
```

As more rules are added, the method becomes increasingly difficult to change and test.

The design problem is:

> How can a request pass through multiple independent checks without one class containing every rule?

## Solution

The Chain of Responsibility Pattern passes a request through a sequence of handlers.

Each handler:

1. Examines the request.
2. Rejects it if its rule fails.
3. Passes it to the next handler if its rule succeeds.

```text
Handler 1 → Handler 2 → Handler 3
```

The sender does not need to know which handler performs each check.

## Our Game Example

The attack chain is:

```text
DistanceHandler
        ↓
DragonAliveHandler
        ↓
PerformAttackHandler
```

The application sends an `AttackRequest` to the first handler:

```text
AttackRequest
    → DistanceHandler
    → DragonAliveHandler
    → PerformAttackHandler
    → Player.attack()
```

If any validation fails, the chain stops immediately.

## Main Participants

### Request

`AttackRequest`

Carries:

- `Player`
- `Dragon`
- attack distance

The request contains data but does not perform the attack.

### Handler

`AttackHandler`

Defines:

```text
set_next(handler)
handle(request)
```

It stores a reference to the next handler in the chain.

### Concrete Handlers

`DistanceHandler`

Rejects negative attack distances.

`DragonAliveHandler`

Rejects attacks when the Dragon is already dead.

`PerformAttackHandler`

Executes the attack after validation succeeds.

### Chain Builder

`create_attack_chain()`

Creates and connects the handlers:

```text
DistanceHandler
    .set_next(DragonAliveHandler)
    .set_next(PerformAttackHandler)
```

It returns the first handler to the caller.

## How the Chain Works

### Valid Request

```text
AttackRequest
    ↓
DistanceHandler approves
    ↓
DragonAliveHandler approves
    ↓
PerformAttackHandler executes
    ↓
AttackResult(success)
```

### Invalid Distance

```text
AttackRequest
    ↓
DistanceHandler rejects
    ↓
AttackResult(failure)
```

The remaining handlers are never called.

### Dead Dragon

```text
AttackRequest
    ↓
DistanceHandler approves
    ↓
DragonAliveHandler rejects
    ↓
AttackResult(failure)
```

The attack is never performed.

## Integration with Command

Our `AttackCommand` uses the validation chain:

```text
AttackCommand.execute()
    → creates AttackRequest
    → calls create_attack_chain()
    → sends request to first handler
    → returns AttackResult
```

The final application flow is:

```text
CommandInvoker
    → AttackCommand
        → AttackRequest
            → validation chain
                → Player.attack()
```

This combines two patterns:

- **Command** represents and controls the action.
- **Chain of Responsibility** validates the request before execution.

## Connection to SOLID

### Single Responsibility Principle

Each handler owns one rule:

- distance validation;
- Dragon status validation;
- attack execution.

Changing one rule does not require changing the others.

### Open/Closed Principle

A new validation handler can be added without rewriting existing handlers.

Examples:

```text
PlayerStateHandler
ManaHandler
WeaponRangeHandler
CooldownHandler
```

### Dependency Inversion Principle

The chain works through the `AttackHandler` abstraction rather than depending on a specific handler.

## Advantages

- Separates independent validation rules.
- Keeps handlers small and focused.
- Allows handlers to be reordered.
- Makes adding new checks easier.
- Stops processing as soon as a rule fails.
- Avoids a large validation method.

## Disadvantages

- A request may pass through many objects.
- It can be difficult to know which handler handled a request.
- If no handler completes the request, the result may be unclear.
- The order of handlers can affect behavior.
- Too many tiny handlers can make simple logic harder to follow.

## Common Mistakes

### Forgetting to connect the chain

Creating handlers without calling `set_next()` means the request may stop unexpectedly.

### Calling `set_next()` while processing

`set_next()` connects handlers. It should not be used to forward requests.

Forwarding should call:

```text
next_handler.handle(request)
```

### Making handlers know the whole chain

A handler should know only its immediate next handler.

### Mixing unrelated rules

Each handler should have one clear responsibility.

### Not defining the end of the chain

The final handler must either complete the request or return a clear result.

### Hiding important ordering rules

If one validation must happen before another, document that order in the chain builder.

## Chain of Responsibility vs Decorator

Both patterns wrap or connect objects, but their intent differs.

### Chain of Responsibility

Each handler decides whether to handle or forward a request.

```text
validate → validate → execute
```

### Decorator

Each decorator adds behavior around another object.

```text
original weapon
    wrapped by empowered weapon
```

A useful distinction:

> Chain decides who handles the request.  
> Decorator adds behavior around an existing object.

## Chain of Responsibility vs Pipeline

They are closely related.

A pipeline usually expects every stage to process the request and pass it forward.

A Chain of Responsibility allows a handler to stop the chain and handle or reject the request.

Our validation chain behaves like a short-circuiting pipeline.

## When to Use Chain of Responsibility

Use it when:

- several independent checks may handle a request;
- validation rules change independently;
- the order of processing matters;
- the sender should not know the handler details;
- processing should stop when a handler rejects the request.

Examples:

- request validation;
- authentication and authorization;
- middleware;
- support ticket routing;
- approval workflows;
- event processing;
- game action validation.

## When Not to Use Chain of Responsibility

Avoid it when:

- there is only one simple check;
- every handler must always run;
- the order is difficult to understand;
- direct conditional logic is clearer;
- failure handling is ambiguous.

## Interview Explanation

> Chain of Responsibility passes a request through a sequence of handlers. Each handler can process, reject, or forward the request. This decouples the sender from the specific object that handles the request and keeps independent validation rules separate.

## Our Implementation Summary

```text
AttackRequest
    carries Player, Dragon, and distance

AttackHandler
    defines set_next() and handle()

DistanceHandler
    rejects negative distance

DragonAliveHandler
    rejects attacks against a dead Dragon

PerformAttackHandler
    performs Player.attack()

create_attack_chain()
    assembles the handlers

AttackCommand
    sends its request through the chain
```

## Key Lesson

The sender should not need to know every rule required to process a request.

Instead of:

```text
Game checks distance
Game checks Dragon health
Game performs attack
```

we use:

```text
Game sends request to the chain
```

Each handler owns one decision, and the chain controls the order.
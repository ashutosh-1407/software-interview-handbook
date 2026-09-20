# Command Pattern

## Problem

The game currently performs an attack directly:

```text
GUI or terminal → player.attack(dragon, distance)
```

This works, but the attack request cannot easily be:

- stored;
- delayed;
- queued;
- replayed;
- logged;
- undone.

The design problem is:

> How can we represent an action as an object so that it can be executed later or managed independently from the object that performs the work?

## Solution

The Command Pattern encapsulates a request inside an object.

Instead of calling the player directly, the caller creates an `AttackCommand`.

```text
AttackCommand
    stores Player, Dragon, and distance
    execute() performs the attack
    undo() reverses the attack
```

The caller can now pass the command to an invoker.

```text
Client → CommandInvoker → AttackCommand → Player
```

## Our Game Example

Without Command:

```text
GUI → player.attack(dragon, distance)
```

With Command:

```text
GUI
  → creates AttackCommand
  → gives it to CommandInvoker
  → invoker.execute()
  → AttackCommand.execute()
  → Player.attack()
```

Creating a command does not execute the attack. Execution happens only when `execute()` is called.

## Main Participants

### Command

`Command`

Defines the common operations:

```text
execute()
undo()
```

### Concrete Command

`AttackCommand`

Stores:

- the `Player`;
- the `Dragon`;
- the attack distance;
- the Dragon’s previous health;
- the Player’s previous mana.

Responsibilities:

- execute the attack;
- remember state needed for undo;
- restore previous state when undone.

### Invoker

`CommandInvoker`

Responsibilities:

- store the current command;
- execute the command;
- keep successful commands in history;
- undo the most recent command.

The invoker does not know how an attack works.

### Receiver

`Player`

Performs the actual domain operation:

```text
Player.attack(...)
```

The command delegates the work to the receiver.

## Execution Flow

```text
1. Create AttackCommand
2. Store Player, Dragon, and distance
3. Give command to CommandInvoker
4. Invoker executes command
5. AttackCommand saves current state
6. AttackCommand calls Player.attack()
7. Successful command is added to history
```

## Undo Flow

```text
1. Invoker selects the latest command
2. Command is removed from history
3. Command.undo() is called
4. Dragon health is restored
5. Player mana is restored
```

The command stores the state required to reverse its own operation.

## Why the Attack Is Not Immediate

This:

```text
command = AttackCommand(player, dragon, distance)
```

only creates an object containing the request.

This:

```text
invoker.execute()
```

actually performs the attack.

That separation enables delayed execution, queues, replay, and undo.

## Connection to SOLID

### Single Responsibility Principle

Each role has a focused responsibility:

- `AttackCommand` represents and executes an attack request.
- `CommandInvoker` manages execution and history.
- `Player` owns attack behavior.
- The UI collects input and displays results.

### Open/Closed Principle

New commands can be added without changing the invoker:

```text
HealCommand
FleeCommand
ChangeWeaponCommand
CastSpellCommand
```

Each command implements the same interface.

### Dependency Inversion Principle

The invoker depends on the `Command` abstraction, not on `AttackCommand` specifically.

## Command vs Strategy

Both patterns use objects and polymorphism, but their purposes differ.

### Strategy

Encapsulates an algorithm.

```text
Sword, Bow, Magic Staff
```

The player chooses which algorithm to use.

### Command

Encapsulates an action request.

```text
AttackCommand
```

The action can be executed, stored, queued, or undone.

A useful distinction:

> Strategy answers “how should this operation be performed?”  
> Command answers “what operation should be performed, and when?”

## Command vs Observer

### Command

Represents an action:

```text
AttackCommand.execute()
```

### Observer

Notifies interested listeners:

```text
AttackEventPublisher.publish(event)
```

They can work together:

```text
Command executes attack
    ↓
AttackEvent is published
    ↓
Observers react
```

## Undo Design

Undo is possible because `AttackCommand` saves:

```text
Dragon health before attack
Player mana before attack
```

Then it restores those values.

This is sometimes called a snapshot or memento-style approach.

Undo is not always possible. Some actions are difficult or impossible to reverse:

- sending an email;
- charging a credit card;
- calling an external service;
- publishing a message;
- deleting data permanently.

## History

`CommandInvoker` stores successful commands:

```text
history: list[Command]
```

Failed commands are not recorded as completed actions.

The history enables:

- undoing the latest action;
- displaying action history;
- replaying actions;
- debugging a sequence of actions.

## Advantages

- Decouples the caller from the receiver.
- Supports delayed execution.
- Supports queues and history.
- Makes undo possible when reversal is defined.
- Makes actions testable as independent objects.
- Allows multiple interfaces to issue the same command.

## Disadvantages

- Adds more classes and indirection.
- Undo may require storing significant state.
- Commands can become large if they contain too much logic.
- Command history may consume memory.
- Replaying commands can be difficult when external state changes.

## Common Mistakes

### Putting business logic in the invoker

The invoker should not perform attacks directly. It only manages commands.

### Executing inside the constructor

Creating a command should not perform the action.

### Recording failed commands as successful history

Only completed successful operations should be added to successful-action history.

### Assuming every command can be undone

Undo must be explicitly designed for each command.

### Making the command duplicate domain logic

`AttackCommand` should delegate to `Player.attack()`, not reimplement weapon, mana, or Dragon rules.

## When to Use Command

Use Command when:

- actions need to be queued;
- actions need to be delayed;
- actions need to be logged;
- actions need to be replayed;
- actions need undo/redo;
- multiple interfaces trigger the same operation;
- a request should be treated as data.

Examples:

- editor undo/redo;
- job queues;
- menu actions;
- transaction processing;
- scheduled tasks;
- macro recording;
- game input buffering.

## When Not to Use Command

Avoid it when:

- the operation is simple and executed once;
- there is no need for history, queuing, or undo;
- wrapping the call would add more complexity than value.

## Interview Explanation

> Command encapsulates a request as an object. This separates the object that asks for an operation from the object that performs it. Commands can be stored, queued, logged, replayed, or undone.

## Our Implementation Summary

```text
Command
    execute()
    undo()

AttackCommand
    stores the attack request
    executes Player.attack()
    snapshots health and mana
    restores them during undo

CommandInvoker
    stores a command
    executes it
    records successful commands
    undoes the last command

Player
    performs the actual attack
```

## Key Lesson

Command turns an action into data plus behavior.

Instead of immediately saying:

```text
player.attack(...)
```

we can represent the request:

```text
AttackCommand(...)
```

and decide when and how it should be executed.
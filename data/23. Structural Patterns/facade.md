# Facade Pattern

## Problem

The game has several subsystems involved in one attack:

```text
Player
Dragon
EquipmentFactory
AttackCommand
CommandInvoker
AttackRequest
Validation chain
```

Without a Facade, the GUI or terminal must coordinate these objects directly.

```text
GUI → switch weapon
GUI → create command
GUI → configure invoker
GUI → execute command
GUI → handle validation
```

This makes the user interface tightly coupled to internal application details.

The design problem is:

> How can we provide one simple interface to a complex subsystem?

## Solution

The Facade Pattern provides a simplified interface over several underlying classes.

Our facade is:

```text
BattleFacade
```

The caller can simply use:

```text
battle_facade.attack(weapon, distance)
battle_facade.restart()
```

Internally, the facade coordinates:

```text
weapon switching
command creation
command execution
validation chain
player and Dragon state
```

## Main Participants

### Facade

`BattleFacade`

Provides simple operations:

```text
attack(weapon, distance)
restart()
```

### Subsystems

The facade coordinates:

- `Player`
- `Dragon`
- `EquipmentFactory`
- `AttackCommand`
- `CommandInvoker`
- `AttackRequest`
- validation handlers

### Clients

The clients are:

- terminal `Game`;
- `DungeonArenaGUI`.

They use the facade instead of coordinating the subsystems directly.

## Attack Flow

The client calls:

```text
battle_facade.attack(current_weapon, distance)
```

The facade performs:

```text
1. Switch Player to the selected weapon.
2. Create AttackCommand.
3. Store it in CommandInvoker.
4. Execute the command.
5. Return AttackResult.
```

Internally:

```text
Client
  → BattleFacade.attack()
      → Player.switch_weapon()
      → AttackCommand
      → CommandInvoker.execute()
      → AttackRequest
      → validation chain
      → Player.attack()
      → AttackResult
```

The client does not need to know this sequence.

## Restart Flow

The client calls:

```text
battle_facade.restart()
```

The facade:

- creates a fresh Player;
- creates a fresh Dragon;
- creates a fresh CommandInvoker;
- preserves the selected equipment factory.

The GUI and terminal do not need to rebuild these objects themselves.

## Connection to SOLID

### Single Responsibility Principle

The UI displays and collects input.

The facade coordinates the application workflow.

The domain objects own game rules.

### Dependency Inversion Principle

The clients depend on the facade rather than concrete internal subsystems.

### Law of Demeter

The client communicates with one high-level object instead of navigating deeply through multiple objects.

Without a facade:

```text
game.command_invoker.command.execute()
```

With a facade:

```text
battle_facade.attack(...)
```

## Advantages

- Simplifies client code.
- Reduces coupling to internal subsystems.
- Provides one clear application-level entry point.
- Makes workflows easier to understand.
- Allows internal implementation to change without affecting clients.
- Can coordinate multiple design patterns behind one API.

## Disadvantages

- The facade can become too large.
- It may turn into a “god class” if it owns every application responsibility.
- Some advanced clients may need access to lower-level subsystem features.
- The facade may hide important behavior if poorly named or documented.

## Facade vs Adapter

### Facade

Simplifies access to multiple classes:

```text
BattleFacade → Player, Dragon, Commands, Validation
```

### Adapter

Converts one incompatible interface into another:

```text
AncientAxeAdapter → Weapon
```

A useful distinction:

> Facade simplifies a subsystem.  
> Adapter makes an incompatible interface compatible.

## Facade vs Mediator

### Facade

Usually provides a simplified entry point for clients.

### Mediator

Coordinates communication between peer objects during ongoing collaboration.

The Facade is commonly used from outside a subsystem. The Mediator manages interaction inside a group of objects.

## When to Use Facade

Use it when:

- a subsystem has many collaborating classes;
- clients should not know internal workflow details;
- a common operation involves several steps;
- multiple interfaces need the same application workflow;
- you want a stable entry point over changing internals.

Examples:

- service-layer APIs;
- payment checkout;
- order placement;
- media conversion;
- database access;
- game battle orchestration.

## When Not to Use Facade

Avoid it when:

- the subsystem is already simple;
- clients genuinely need different low-level operations;
- the facade would become a large conditional-heavy class;
- adding the facade would only rename one simple method.

## Common Mistakes

### Putting domain rules in the facade

The facade should coordinate. Damage, mana, and weapon behavior belong in the domain.

### Exposing every subsystem method

A facade should provide meaningful high-level operations, not simply mirror every method underneath.

### Making the facade responsible for display

The GUI and terminal should still display results. The facade should return data such as `AttackResult`.

### Creating multiple competing workflows

If the facade is the application entry point, clients should use it consistently instead of reimplementing the same workflow.

## Relationship with Other Patterns

Our Facade coordinates several patterns:

```text
Facade
  → Abstract Factory selects themed equipment
  → Command represents the attack
  → Chain validates the request
  → State controls Player behavior
  → Strategy controls weapon behavior
  → Observer publishes attack events
```

This demonstrates how patterns collaborate rather than existing in isolation.

## Interview Explanation

> Facade provides a simplified, high-level interface to a complex subsystem. It hides coordination details from clients while allowing the underlying classes to remain focused on their own responsibilities.

## Our Implementation Summary

```text
BattleFacade
    creates and owns the active battle state
    switches weapons
    creates attack commands
    invokes commands
    restarts battles

Game and GUI
    collect input and display results
    call BattleFacade

Player, Dragon, and other subsystems
    retain their own domain responsibilities
```

## Key Lesson

The Facade gives clients a simple workflow without removing the underlying design.

Instead of:

```text
coordinate Player
coordinate Dragon
create Command
configure Invoker
run validation
execute attack
```

the client uses:

```text
battle_facade.attack(weapon, distance)
```

A good Facade hides complexity without owning every responsibility.
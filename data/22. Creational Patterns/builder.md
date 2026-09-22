# Builder Pattern

## Problem

Some objects require several pieces of configuration before they are valid.

A battle scenario may require:

- a Player;
- a Dragon;
- an attack distance;
- later, perhaps a game mode, observers, rules, or difficulty.

A large constructor becomes difficult to read:

```text
BattleScenario(player, dragon, distance, mode, rules, ...)
```

The design problem is:

> How can we construct a complex object step by step while keeping the final object valid and readable?

## Solution

The Builder Pattern separates object construction from the final object.

```text
BattleScenarioBuilder
    → configure step by step
    → validate required values
    → build BattleScenario
```

## Our Game Example

```text
BattleScenarioBuilder()
    .with_player(player)
    .with_dragon(dragon)
    .with_distance(10)
    .build()
```

The builder stores the configuration and creates a `BattleScenario` only when `build()` is called.

## Main Participants

### Product

`BattleScenario`

The completed object containing:

- `player`;
- `dragon`;
- `distance`.

### Builder

`BattleScenarioBuilder`

Responsibilities:

- collect configuration;
- provide readable configuration methods;
- validate required values;
- create the final scenario.

## Fluent Methods

Methods such as:

```text
with_player(...)
with_dragon(...)
with_distance(...)
```

return the builder itself:

```text
return self
```

This enables method chaining.

A fluent API is primarily a readability technique. It does not change the underlying construction behavior.

## Validation

`build()` verifies that all required values exist.

If a required value is missing, construction fails with a clear error instead of creating an invalid scenario.

This ensures:

```text
build() → valid BattleScenario
```

## Connection to SOLID

### Single Responsibility Principle

`BattleScenario` represents the finished data.

`BattleScenarioBuilder` handles construction and validation.

### Open/Closed Principle

New optional configuration can be added through new builder methods without making the constructor unreadable.

### Dependency Inversion Principle

The builder depends on domain abstractions and objects rather than embedding the details of how players or Dragons are created.

## Builder vs Factory

### Factory

A factory usually creates an object in one operation:

```text
get_weapon("sword")
```

The caller gives a choice, and the factory returns an object.

### Builder

A builder constructs an object step by step:

```text
builder.with_player(...).with_dragon(...).build()
```

A useful distinction:

> Factory chooses what object to create.  
> Builder controls how a complex object is assembled.

## Builder vs Factory Method

### Factory Method

Lets subclasses decide which product to create.

### Builder

Separates the construction steps from the final product.

They solve different problems and can be used together.

## Advantages

- Makes complex construction readable.
- Avoids large constructors.
- Validates required configuration in one place.
- Supports optional settings.
- Allows different construction sequences.
- Makes setup code easier to test.

## Disadvantages

- Adds another class.
- Can be unnecessary for simple objects.
- Builder state must be managed carefully.
- Too many `with_...()` methods can still become difficult to navigate.

## Common Mistakes

### Allowing invalid objects

If `build()` does not validate required fields, the builder may create incomplete scenarios.

### Putting business behavior in the builder

The builder should assemble the scenario, not run the battle.

### Returning a new builder from every method

For a fluent builder, configuration methods normally return the same builder instance.

### Using Builder for a simple object

If an object has only one or two required values, a normal constructor may be clearer.

## When to Use Builder

Use Builder when:

- an object has many configuration values;
- many values are optional;
- construction has multiple meaningful steps;
- constructors are becoming difficult to read;
- validation is needed before creation;
- different configurations produce valid variations of the same product.

Examples:

- test fixtures;
- HTTP requests;
- database queries;
- configuration objects;
- UI screens;
- game scenarios;
- deployment definitions.

## When Not to Use Builder

Avoid it when:

- the object is simple;
- all values are always required;
- construction has no meaningful steps;
- the builder adds more ceremony than clarity.

## Interview Explanation

> Builder separates the construction of a complex object from its representation. It allows an object to be created step by step, validates the configuration, and keeps the final constructor simple.

## Our Implementation Summary

```text
BattleScenario
    completed product

BattleScenarioBuilder
    stores configuration
    provides fluent methods
    validates required values
    creates BattleScenario

with_player()
with_dragon()
with_distance()
    configure the builder

build()
    returns a valid BattleScenario
```

## Key Lesson

Builder is useful when construction itself has become complicated.

Instead of:

```text
create one object with a long constructor
```

we use:

```text
configure clearly
validate centrally
build once
```
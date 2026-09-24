# Singleton Pattern

## Problem

Some application-wide data should have one shared instance.

For example, game settings may include:

```text
difficulty
sound_enabled
theme
```

If different parts of the application create separate settings objects, they may disagree:

```text
GUI settings     → Fire
Game settings    → Ice
Audio settings   → enabled
```

The design problem is:

> How can we guarantee that a class has only one instance and provide a shared access point to it?

## Solution

The Singleton Pattern restricts a class to one instance.

```text
GameSettings() is GameSettings()
```

Every construction request returns the same object.

The instance initializes its defaults only once, so later construction does not erase changes.

## Our Example

```text
GameSettings
├── difficulty
├── sound_enabled
└── theme
```

Usage:

```text
settings = GameSettings()
settings.theme = "Ice"

same_settings = GameSettings()
same_settings.theme == "Ice"
```

Both variables refer to the same object.

## Implementation Responsibilities

### Single Instance Storage

The class stores the shared instance:

```text
_instance
```

### Instance Creation

`__new__()` creates the object only if one does not already exist.

### One-Time Initialization

`__init__()` uses an initialization guard so defaults are assigned only once.

Without the guard, every call to `GameSettings()` would reset the settings.

## Important Python Detail

`__new__()` controls object creation.

```text
__new__() → decides which instance to return
```

`__init__()` initializes the returned instance.

```text
__init__() → configures the instance
```

Because Python may call `__init__()` on every construction request, the initialization guard is necessary.

## Connection to SOLID

Singleton can support Single Responsibility when it represents one genuine shared resource.

However, it can also create hidden global dependencies and make Dependency Inversion harder.

Singleton should therefore be used deliberately, not automatically.

## Advantages

- Guarantees one shared instance.
- Provides a central access point.
- Preserves shared state across callers.
- Useful for truly global application configuration.

## Disadvantages

- Introduces global mutable state.
- Makes dependencies less explicit.
- Can make tests interfere with one another.
- Can become a hidden service locator.
- Makes parallel execution more difficult.
- Often encourages excessive coupling.

## Singleton vs Static Class

A Singleton is an object:

```text
settings = GameSettings()
```

It can implement interfaces, be passed as a dependency, and hold instance state.

A static class or module provides functions and shared data without object instantiation.

Singleton is useful when object identity matters.

## Singleton vs Dependency Injection

Dependency Injection makes dependencies explicit:

```text
Game(settings)
```

Singleton hides the dependency:

```text
GameSettings().theme
```

Dependency Injection is often easier to test because each test can receive a fresh configuration object.

## When to Use Singleton

Use it sparingly for resources that genuinely must be unique:

- application configuration;
- process-wide coordination;
- shared resource registry;
- logging infrastructure;
- controlled connection pools.

## When Not to Use Singleton

Avoid it when:

- ordinary dependency injection is sufficient;
- multiple independent instances may be useful in tests;
- the object is merely convenient to access globally;
- the state changes frequently and unpredictably;
- the object represents ordinary domain data.

## Testing Considerations

Singleton tests should verify:

```text
GameSettings() is GameSettings()
```

They should also verify that state persists:

```text
first.theme = "Ice"
second = GameSettings()
second.theme == "Ice"
```

Tests must be careful because mutations persist between test cases. Reset hooks or isolated processes may be needed for larger systems.

## Common Mistakes

### Resetting values in `__init__()`

This destroys the persistence that Singleton is supposed to provide.

### Returning from `__init__()`

`__init__()` should return `None`; it should not return the instance.

### Confusing `_instance` and `_initialized`

They solve different problems:

```text
_instance      → controls object identity
_initialized   → controls one-time setup
```

### Using Singleton for everything

Many classes do not need global uniqueness. Use normal objects unless shared identity is a real requirement.

## Interview Explanation

> Singleton ensures a class has only one instance and provides a shared access point to that instance. It is useful for genuinely unique resources, but it introduces global state and should be used carefully.

## Our Implementation Summary

```text
GameSettings
    stores one shared instance
    initializes defaults only once
    preserves changes across construction calls

Difficulty
    enum of supported difficulty values
```

## Key Lesson

Singleton solves an identity problem, not merely a convenience problem.

Ask:

> Must there truly be exactly one instance, or would explicit dependency injection be clearer?

If uniqueness is not a real requirement, a regular class is usually safer.
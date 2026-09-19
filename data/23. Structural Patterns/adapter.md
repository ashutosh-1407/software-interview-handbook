# Adapter Pattern

## One-line definition

The Adapter pattern converts one interface into another interface that the client already understands.

## The problem

Dungeon Arena expects every weapon to follow this contract:

```text
attack(AttackContext) → AttackResult
```

The existing weapons follow it:

```text
Sword.attack(context)
Bow.attack(context)
MagicStaff.attack(context)
```

Now an old weapon library provides an `AncientAxe`:

```text
AncientAxe.strike() → 18
```

The legacy class:

- Does not implement `Weapon`.
- Does not accept `AttackContext`.
- Returns a raw integer instead of `AttackResult`.
- Cannot be modified.

Player cannot use it directly because Player expects a Weapon.

## Design pressure

We want to:

- Reuse the existing Ancient Axe.
- Avoid modifying legacy code.
- Keep Player dependent only on `Weapon`.
- Convert the legacy result into the modern domain model.
- Make the Ancient Axe interchangeable with other weapons.

## Intent

> Allow objects with incompatible interfaces to collaborate by placing a translation layer between them.

The Adapter does not change either side. It translates between them.

## Structure

```text
Client → Target interface ← Adapter → Adaptee
```

In Dungeon Arena:

```text
Player
  │ expects Weapon
  ▼
AncientAxeAdapter
  │ wraps
  ▼
AncientAxe
```

## Participants

| Pattern role | Project class | Responsibility |
|---|---|---|
| Client | `Player` | Uses the modern Weapon contract |
| Target | `Weapon` | Interface expected by Player |
| Adapter | `AncientAxeAdapter` | Translates modern calls into legacy calls |
| Adaptee | `AncientAxe` | Existing incompatible implementation |

## Interaction flow

```text
1. Player asks AncientAxeAdapter to attack(context).
2. Adapter calls AncientAxe.strike().
3. AncientAxe returns raw damage: 18.
4. Adapter creates Damage(18, PHYSICAL).
5. Adapter creates a successful AttackResult.
6. Player receives the standard result.
7. Dragon receives the translated Damage.
```

The rest of the system does not know that the actual weapon is legacy.

## What the Adapter translates

### Method name

```text
attack(...) → strike()
```

### Input

```text
AttackContext → no legacy input
```

The Ancient Axe does not need context, so the Adapter ignores it.

### Output

```text
int 18 → Damage(18, PHYSICAL) → AttackResult
```

The Adapter converts the raw result into the domain contract expected by Player.

## Why not modify AncientAxe?

In real systems, the incompatible class may be:

- A third-party library
- A legacy internal module
- A generated client
- A vendor SDK
- A shared component owned by another team
- Too risky to change

Even when modification is technically possible, changing a stable external contract can affect many consumers.

The Adapter localizes the compatibility logic.

## Object Adapter versus Class Adapter

Dungeon Arena uses an **Object Adapter**:

```text
AncientAxeAdapter contains an AncientAxe
```

It uses composition to wrap an existing object.

A Class Adapter uses inheritance or multiple inheritance to adapt the class itself. Object Adapter is usually more flexible because:

- It can wrap different instances.
- It avoids inheriting implementation details.
- It works when the adaptee cannot be subclassed.
- It better supports composition over inheritance.

## Why Player remains unchanged

Before the Adapter:

```text
Player → Weapon
```

After adding the legacy axe:

```text
Player → Weapon ← AncientAxeAdapter → AncientAxe
```

Player still depends only on Weapon.

This is the key benefit:

> Compatibility changes happen at the boundary instead of spreading into the client.

## SOLID connections

### Single Responsibility Principle

The Adapter owns interface translation. Player does not need to know legacy method names or result formats.

### Open/Closed Principle

The system gains support for Ancient Axe by adding an Adapter rather than modifying Player.

### Liskov Substitution Principle

AncientAxeAdapter must behave like a valid Weapon. Player should be able to use it wherever it uses another Weapon.

### Interface Segregation Principle

Player depends on the small Weapon contract rather than the entire Ancient Axe API or a large legacy interface.

### Dependency Inversion Principle

Player depends on the stable Weapon abstraction. The legacy detail is isolated behind the Adapter.

## Adapter and Factory collaboration

The Simple Factory creates the adapted object:

```text
get_weapon("ancient_axe")
    → AncientAxeAdapter(AncientAxe())
```

The responsibilities remain separate:

- Factory decides which object to construct.
- Adapter translates the incompatible interface.
- Player uses the stable Weapon contract.

Patterns often collaborate. Using Adapter and Factory together does not make them the same pattern.

## When to use Adapter

Use Adapter when:

- An existing interface is incompatible with the client.
- The existing class cannot or should not be modified.
- You need to integrate legacy or third-party code.
- Several external implementations must fit one internal contract.
- Translation belongs at a clear system boundary.

Common production examples include:

- Payment-provider adapters
- Cloud-storage adapters
- Legacy database clients
- Vendor-specific messaging APIs
- External analytics SDKs
- Old logging frameworks
- Third-party identity providers
- File-format readers
- API-version compatibility layers

## When not to use Adapter

Avoid Adapter when:

- You control both sides and can improve the original interface safely.
- The interfaces are already compatible.
- The translation is so large that it represents a different domain concept.
- The Adapter hides serious semantic differences.
- A simple direct call is clearer.

An Adapter should translate a meaningful interface mismatch, not hide a fundamentally incompatible business model.

## Trade-offs

### Advantages

- Reuses existing code.
- Protects clients from external API details.
- Localizes compatibility logic.
- Supports gradual migration from legacy systems.
- Makes third-party integrations replaceable.

### Costs

- Adds another object and layer of indirection.
- Translation bugs can be subtle.
- Semantic differences may be hidden behind matching method names.
- Adapters may accumulate special-case logic.
- Debugging requires following calls across the boundary.

## Common mistakes

### Changing the client instead

Adding legacy-specific conditionals to Player spreads compatibility concerns through the domain.

### Making the Adapter too intelligent

The Adapter should translate interfaces. It should not become a second business-logic engine.

### Ignoring semantic differences

Two methods may both be called `send`, but one may be synchronous and the other asynchronous, or one may return a different failure model.

### Returning invalid domain objects

An Adapter must honor the target contract and produce valid results.

### Confusing Adapter with Facade

Adapter makes one interface compatible with another. Facade simplifies access to a subsystem.

### Confusing Adapter with Decorator

Adapter changes the interface. Decorator preserves the interface while adding behavior.

## Adapter versus Facade

| Adapter | Facade |
|---|---|
| Converts an incompatible interface | Simplifies a complicated subsystem |
| Usually wraps one main adaptee | Usually coordinates several subsystem components |
| Client expects an existing target contract | Client receives a new simpler entry point |
| Example: AncientAxe → Weapon | Example: CheckoutFacade → payment, inventory, shipping |

## Adapter versus Decorator

| Adapter | Decorator |
|---|---|
| Changes the interface | Preserves the interface |
| Makes incompatible code usable | Adds responsibilities or behavior |
| Usually translates inputs and outputs | Usually delegates and augments |
| Example: AncientAxeAdapter | Example: LoggingWeapon |

## Adapter versus Proxy

| Adapter | Proxy |
|---|---|
| Translates an interface | Controls access to the same interface |
| Compatibility is the main concern | Access, lifecycle, security, or performance is the concern |
| Example: legacy API wrapper | Example: lazy-loading or authorization wrapper |

## Interview questions

### What problem does Adapter solve?

It allows incompatible interfaces to work together by translating one interface into another expected by the client.

### Does Adapter change the adaptee?

No. The Adapter wraps or references the adaptee and performs translation at the boundary.

### Why use composition instead of inheritance?

Composition avoids coupling the client to the adaptee’s implementation and can adapt existing instances, including classes that cannot be safely subclassed.

### What is the difference between Adapter and Facade?

Adapter changes an interface to match what a client already expects. Facade creates a simpler interface over a complex subsystem.

### What happens if the adaptee’s semantics are incompatible?

A method-name translation is not enough. The Adapter may need explicit mapping, validation, error conversion, or the integration may not be a good fit.

### Can Adapter be used during migration?

Yes. An Adapter can keep the existing client stable while legacy implementations are gradually replaced.

## Thirty-second interview answer

Adapter lets incompatible components collaborate by translating one interface into another. In Dungeon Arena, Player expects `Weapon.attack(...)`, while the legacy Ancient Axe exposes `strike()` and returns an integer. `AncientAxeAdapter` wraps the legacy object, calls `strike()`, converts the result into `Damage` and `AttackResult`, and presents the standard Weapon contract to Player. This isolates compatibility logic at the boundary without modifying either Player or the legacy class.

## Review checklist

Before introducing Adapter, ask:

- Is there a genuine interface mismatch?
- Can the adaptee remain unchanged?
- Is the target contract clear?
- Does the Adapter translate inputs and outputs correctly?
- Does it preserve important error and lifecycle semantics?
- Is business logic staying outside the Adapter?
- Does the adapted object satisfy the target contract?
- Would a Facade, Proxy, or Decorator be a better fit?
- Is the compatibility boundary easy to test?
- Can the external implementation eventually be replaced without changing the client?
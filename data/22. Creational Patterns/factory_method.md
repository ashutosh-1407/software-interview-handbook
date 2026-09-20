# Factory Method Pattern

## One-line definition

Factory Method defines an object-creation operation in a base abstraction and lets concrete subclasses decide which product to create.

## The problem

Different game modes share the same battle flow but need different starting weapons:

```text
Warrior mode → Sword
Archer mode  → Bow
Mage mode    → Magic Staff
```

The battle process is stable:

```text
1. Create the player.
2. Create the Dragon.
3. Start the battle loop.
4. Process attacks.
5. Finish when the Dragon is defeated.
```

Only the starting-weapon creation varies.

A naïve implementation might put mode checks inside the battle flow:

```text
if mode == "warrior":
    weapon = Sword()
elif mode == "archer":
    weapon = Bow()
elif mode == "mage":
    weapon = MagicStaff()
```

Every new mode would require modifying the existing battle flow.

## Design pressure

We want to:

- Reuse the same battle workflow.
- Allow different modes to choose different starting weapons.
- Add new modes without editing the stable workflow.
- Keep concrete creation decisions with the mode that owns them.

## Intent

> Define an object-creation method in a base abstraction, while allowing subclasses to decide which concrete object is created.

The base class owns the process. The subclass owns the product choice.

## Structure

```text
Base Creator
├── stable workflow
└── create_product()

Concrete Creator
└── overrides create_product()

Product
└── common abstraction

Concrete Products
├── Product A
├── Product B
└── Product C
```

In Dungeon Arena:

```text
GameMode
├── create_starting_weapon()
│
├── WarriorMode → Sword
├── ArcherMode  → Bow
└── MageMode    → MagicStaff
```

## Participants

| Pattern role | Project class | Responsibility |
|---|---|---|
| Creator abstraction | `GameMode` | Defines the creation method |
| Concrete Creator | `WarriorMode` | Creates a Sword |
| Concrete Creator | `ArcherMode` | Creates a Bow |
| Concrete Creator | `MageMode` | Creates a Magic Staff |
| Product abstraction | `Weapon` | Common weapon contract |
| Concrete Product | `Sword`, `Bow`, `MagicStaff` | Concrete weapons |

## How it works

The shared game setup asks the selected mode for a starting weapon:

```text
Game
  └── asks GameMode.create_starting_weapon()
          ├── WarriorMode → Sword
          ├── ArcherMode  → Bow
          └── MageMode    → MagicStaff
```

The game does not need to know which concrete weapon is returned.

The important separation is:

```text
Game owns the battle workflow.
GameMode owns the starting-weapon decision.
Weapon owns attack behavior.
```

## Why this is useful

Without Factory Method, the battle workflow needs to know about every mode and every starting weapon.

With Factory Method, adding a new mode looks like:

```text
New mode → implements create_starting_weapon() → returns its weapon
```

The existing battle workflow remains unchanged.

## Factory Method versus Simple Factory

Dungeon Arena contains both.

### Simple Factory

The Simple Factory is a function:

```text
get_weapon("bow") → Bow()
```

It centralizes creation behind one function.

Use it when:

- The creation decision is simple.
- One component can own the selection.
- You do not need different creator subclasses.
- A function is enough.

### Factory Method

Factory Method uses an abstraction and concrete creator implementations:

```text
ArcherMode.create_starting_weapon() → Bow()
```

Use it when:

- A family of creators follows the same workflow.
- Each creator has its own product-selection rule.
- The creation decision belongs to a subtype.
- You want to extend by adding new creator subclasses.

### Comparison

| Simple Factory | Factory Method |
|---|---|
| Usually a function or one helper class | Usually a base creator and subclasses |
| One centralized selection decision | Selection is distributed to concrete creators |
| Easy to implement | More structure and indirection |
| Good for small creation logic | Good when creators vary as well as products |
| Not formally a GoF pattern | GoF creational pattern |

## SOLID connections

### Single Responsibility Principle

The mode owns the decision about its starting weapon. The battle flow does not need to own that decision too.

### Open/Closed Principle

A new mode can be added without modifying the stable battle workflow.

### Liskov Substitution Principle

Every `GameMode` must provide a valid `Weapon` through `create_starting_weapon()`.

### Dependency Inversion Principle

The battle flow depends on the `GameMode` abstraction rather than directly depending on every concrete mode or weapon.

## When to use Factory Method

Consider it when:

- A common workflow needs variable products.
- Different subclasses make different creation decisions.
- The product type is stable but the creator varies.
- New product-creator combinations are expected.
- Creation is part of a polymorphic algorithm.

Common production examples include:

- Different report generators
- Cloud-provider-specific clients
- Database connection creators
- Document exporters
- Notification channel creators
- Platform-specific UI components
- Parser creators for different file formats

## When not to use it

Avoid Factory Method when:

- A simple constructor is enough.
- A small function is clearer.
- There is only one creator.
- Product creation never varies.
- Subclassing exists only to change one trivial line.
- Dependency injection already supplies the product cleanly.

A Factory Method introduces inheritance and indirection. That cost needs to be justified by variation in the creators or workflow.

## Common mistakes

### Calling every factory a Factory Method

A function such as `get_weapon("bow")` is usually a Simple Factory, not Factory Method.

### Creating subclasses too early

If a function solves the problem clearly, adding an abstract creator and several subclasses may be unnecessary.

### Putting the entire workflow in subclasses

The base creator should own the stable workflow. Subclasses should customize the creation point, not duplicate the whole algorithm.

### Returning unrelated product types

All concrete products must honor the same product abstraction. Every mode must return a valid `Weapon`.

### Confusing Factory Method with Strategy

Factory Method selects or creates an object. Strategy defines interchangeable behavior after the object exists.

## Factory Method versus Strategy

| Factory Method | Strategy |
|---|---|
| Focuses on object creation | Focuses on interchangeable behavior |
| Decides which object to instantiate | Decides which algorithm to execute |
| Often uses inheritance | Usually uses composition |
| Example: mode creates starting weapon | Example: Player delegates attack to current Weapon |

In Dungeon Arena:

```text
Factory Method:
GameMode → creates Weapon

Strategy:
Player → delegates attack to Weapon
```

The patterns can collaborate, but they solve different problems.

## Interview questions

### What problem does Factory Method solve?

It allows a base workflow to remain stable while subclasses decide which concrete product to create.

### How is it different from a Simple Factory?

A Simple Factory centralizes creation in one function or object. Factory Method distributes the creation decision across concrete creator subclasses.

### Why not use a conditional?

A conditional may be perfectly appropriate for a small stable set. Factory Method is useful when creators themselves vary and new creator-product combinations are expected.

### Does Factory Method always require inheritance?

The classic GoF version uses inheritance and overriding. In modern code, dependency injection or composition may solve the same problem more simply.

### What does the base class own?

The base class owns the stable workflow and defines the creation hook.

### What does the subclass own?

The subclass chooses or constructs the concrete product.

## Thirty-second interview answer

Factory Method defines an object-creation operation in a base abstraction and lets subclasses decide which concrete product to create. The base class owns the stable workflow, while subclasses customize the creation step. This supports extension when different creators need different products, but it introduces inheritance and indirection. For a small centralized decision, I would usually prefer a Simple Factory or dependency injection.

## Review checklist

Before introducing Factory Method, ask:

- Is there a stable workflow?
- Does product creation vary between creator types?
- Does the variation belong naturally to subclasses?
- Would a simple function be clearer?
- Do all products satisfy a common contract?
- Can a new creator be added without changing the workflow?
- Are subclasses customizing one creation point rather than duplicating the algorithm?
- Is the inheritance cost justified?
# Creational Patterns — Interview Cheat Sheet

## Factory Method

**Intent:** Let subclasses decide which concrete product to create.

**Recognize it when:**

- one product type is needed;
- creation varies by subclass or mode;
- the base workflow should remain stable.

**Game example:**

```text
GameMode.create_starting_weapon()
WarriorMode → Sword
ArcherMode  → Bow
MageMode    → MagicStaff
```

**Interview phrase:**

> Factory Method delegates creation of one product to subclasses.

---

## Abstract Factory

**Intent:** Create families of related and compatible objects.

**Recognize it when:**

- several product roles belong to one family;
- products should not be mixed accidentally;
- the whole family may change.

**Game example:**

```text
FireEquipmentFactory → FireSword, FireBow, FireStaff
IceEquipmentFactory  → IceSword, IceBow, IceStaff
```

**Interview phrase:**

> Abstract Factory creates a compatible family of products without exposing concrete classes.

---

## Builder

**Intent:** Construct a complex object step by step.

**Recognize it when:**

- constructors have many parameters;
- many values are optional;
- construction needs validation;
- readable configuration matters.

**Game example:**

```text
BattleScenarioBuilder()
    .with_player(player)
    .with_dragon(dragon)
    .with_distance(10)
    .build()
```

**Interview phrase:**

> Builder separates complex construction from the final object.

---

## Key Distinctions

```text
Factory Method   → one product, subclass decides
Abstract Factory → related product family
Builder          → step-by-step construction
```

## Common Trade-offs

- More classes and indirection.
- Better separation of creation logic.
- Easier to add product variants.
- Adding a new product role may require updating every Abstract Factory.
# Abstract Factory Pattern

## Problem

The game supports families of related weapons.

For example:

```text
Fire family:
    FireSword
    FireBow
    FireStaff

Ice family:
    IceSword
    IceBow
    IceStaff
```

The weapons share common roles:

- Sword
- Bow
- Staff

But each family provides a different theme and damage type.

The design problem is:

> How can we create a complete family of related objects while ensuring that the objects belong to the same family?

## Solution

The Abstract Factory Pattern provides an interface for creating related objects without specifying their concrete classes.

```text
EquipmentFactory
    create_sword()
    create_bow()
    create_staff()
```

Concrete factories create complete families:

```text
FireEquipmentFactory
    → FireSword
    → FireBow
    → FireStaff

IceEquipmentFactory
    → IceSword
    → IceBow
    → IceStaff
```

The caller depends on `EquipmentFactory`, not on the concrete product classes.

## Product Roles and Families

There are two dimensions:

```text
Role:
    Sword / Bow / Staff

Family:
    Fire / Ice
```

The product matrix is:

| Family | Sword | Bow | Staff |
|---|---|---|---|
| Fire | FireSword | FireBow | FireStaff |
| Ice | IceSword | IceBow | IceStaff |

Each concrete factory creates one complete row in this matrix.

## Main Participants

### Abstract Factory

`EquipmentFactory`

Defines:

```text
create_sword()
create_bow()
create_staff()
```

It describes the product roles without choosing concrete implementations.

### Concrete Factories

`FireEquipmentFactory`

Creates:

- `FireSword`
- `FireBow`
- `FireStaff`

`IceEquipmentFactory`

Creates:

- `IceSword`
- `IceBow`
- `IceStaff`

### Abstract Product

`Weapon`

Defines the common weapon contract:

```text
attack(context) → AttackResult
```

### Concrete Products

The concrete elemental weapons implement the common role behavior:

```text
FireSword / IceSword
FireBow / IceBow
FireStaff / IceStaff
```

They reuse the base weapon role and customize the damage type.

## Game Integration

The game mode chooses the factory:

```text
WarriorMode → FireEquipmentFactory
ArcherMode  → IceEquipmentFactory
MageMode    → FireEquipmentFactory
```

The game then uses the selected factory:

```text
equipment_factory.create_sword()
equipment_factory.create_bow()
equipment_factory.create_staff()
```

The game does not need to know whether it received a Fire or Ice weapon.

```text
GameMode
    → EquipmentFactory
        → themed Weapon products
```

The GUI uses the same factory, so the terminal and GUI produce consistent themed equipment.

## Why This Prevents Inconsistent Families

Without Abstract Factory, the caller could accidentally mix families:

```text
FireSword
IceBow
FireStaff
```

With Abstract Factory, the caller chooses one factory and receives a consistent family:

```text
FireEquipmentFactory
    → FireSword
    → FireBow
    → FireStaff
```

or:

```text
IceEquipmentFactory
    → IceSword
    → IceBow
    → IceStaff
```

## Connection to SOLID

### Single Responsibility Principle

Factories own family creation. Weapons own attack behavior. Game modes choose the family.

### Open/Closed Principle

A new family can be added without changing callers:

```text
LightningEquipmentFactory
    → LightningSword
    → LightningBow
    → LightningStaff
```

### Dependency Inversion Principle

The game depends on `EquipmentFactory` and `Weapon` abstractions rather than concrete Fire or Ice classes.

## Abstract Factory vs Factory Method

### Factory Method

Creates one product, often allowing subclasses to decide which concrete product to create.

```text
GameMode.create_starting_weapon()
```

### Abstract Factory

Creates a family of related products.

```text
EquipmentFactory.create_sword()
EquipmentFactory.create_bow()
EquipmentFactory.create_staff()
```

A useful distinction:

> Factory Method creates one product through inheritance or overriding.  
> Abstract Factory creates a compatible family of products.

## Abstract Factory vs Simple Factory

A simple factory might provide:

```text
get_weapon("sword")
```

It creates one weapon based on a value.

An Abstract Factory provides:

```text
factory.create_sword()
factory.create_bow()
factory.create_staff()
```

The factory object represents the selected family.

## Advantages

- Keeps related products consistent.
- Hides concrete product classes from callers.
- Makes switching product families easy.
- Supports adding new families.
- Keeps family creation in one place.
- Works naturally with dependency injection and game modes.

## Disadvantages

- Adding a new product role affects every factory.
- Creates many concrete product classes.
- Can be overkill for a small number of unrelated objects.
- Product families may require significant duplication.
- The family and role matrix must be maintained carefully.

## Common Mistakes

### Mixing families manually

```text
FireSword + IceBow
```

This defeats the purpose of the factory.

### Returning the wrong product family

`FireEquipmentFactory.create_bow()` should return `FireBow`, not `IceBow`.

### Putting business behavior in the factory

The factory should create products. Weapon attack behavior belongs in the weapon classes.

### Making the caller inspect concrete types

The caller should use the abstract interfaces:

```text
weapon.attack(...)
```

not:

```text
if isinstance(weapon, FireSword):
    ...
```

### Adding a product role without updating all factories

If a new role such as `create_axe()` is added, every concrete factory must support it.

## When to Use Abstract Factory

Use it when:

- objects come in related families;
- products must be compatible;
- the family may change at runtime;
- callers should not depend on concrete classes;
- adding a new family should be straightforward.

Examples:

- light and dark UI themes;
- database drivers;
- cloud-provider clients;
- operating-system widgets;
- payment-provider integrations;
- themed game equipment.

## When Not to Use Abstract Factory

Avoid it when:

- products are unrelated;
- there is only one product type;
- families are unlikely to change;
- the factory hierarchy is larger than the problem requires.

## Interview Explanation

> Abstract Factory provides an interface for creating families of related objects without exposing their concrete classes. It ensures that products from the same family are created consistently and can be changed as a group.

## Our Implementation Summary

```text
EquipmentFactory
    abstract family factory

FireEquipmentFactory
    creates FireSword, FireBow, FireStaff

IceEquipmentFactory
    creates IceSword, IceBow, IceStaff

Weapon
    common product abstraction

GameMode
    selects the equipment family

Game and GUI
    depend on the factory abstraction
```

## Key Lesson

The caller should choose a family, not construct individual family members manually.

Instead of:

```text
new FireSword()
new FireBow()
new FireStaff()
```

the caller uses:

```text
factory.create_sword()
factory.create_bow()
factory.create_staff()
```

The factory controls family consistency.
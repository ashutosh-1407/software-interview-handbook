# Decorator Pattern

## One-line definition

The Decorator pattern adds behavior to an object by wrapping it with another object that implements the same interface.

## The problem

Dungeon Arena supports several weapons:

- Sword
- Bow
- Magic Staff
- Ancient Axe through an Adapter

Now we want optional enhancements:

- Empowered Sword: +5 damage
- Empowered Bow: +5 damage
- Empowered Magic Staff: +5 damage
- Empowered Ancient Axe: +5 damage

Creating a subclass for every combination quickly becomes difficult:

```text
EmpoweredSword
EmpoweredBow
EmpoweredMagicStaff
EmpoweredAncientAxe
PoisonedSword
PoisonedBow
PoisonedMagicStaff
EmpoweredPoisonedSword
...
```

This is a subclass-combination problem.

## Design pressure

We want to:

- Add optional behavior to any Weapon.
- Avoid modifying existing weapon classes.
- Avoid creating one subclass for every combination.
- Allow multiple enhancements to be combined.
- Preserve the existing Weapon contract.

## Intent

> Attach additional responsibilities to an object dynamically by wrapping it with another object that implements the same interface.

The wrapper behaves like the original object from the client’s perspective.

## Structure

```text
Client → Component interface
              ▲
              │
       ┌──────┴────────┐
       │               │
Concrete Component   Decorator
                         │ wraps
                         ▼
                    Component
```

In Dungeon Arena:

```text
Player
  ↓ expects Weapon
EmpoweredWeapon
  ↓ wraps
Sword
```

The Player does not need to know whether it is using:

```text
Sword
EmpoweredWeapon(Sword)
EmpoweredWeapon(EmpoweredWeapon(Sword))
```

All three satisfy the same `Weapon` contract.

## Participants

| Pattern role | Project class | Responsibility |
|---|---|---|
| Component | `Weapon` | Common contract |
| Concrete Component | `Sword`, `Bow`, `MagicStaff` | Base attack behavior |
| Decorator | `EmpoweredWeapon` | Wraps a Weapon |
| Client | `Player` | Uses the Weapon abstraction |

## Interaction flow

```text
1. Player asks EmpoweredWeapon to attack.
2. EmpoweredWeapon delegates to its wrapped Weapon.
3. Wrapped Weapon returns an AttackResult.
4. If the attack failed, EmpoweredWeapon returns the failure unchanged.
5. If successful, EmpoweredWeapon creates a new Damage with +5 amount.
6. EmpoweredWeapon returns a new AttackResult.
```

The decorator adds behavior without owning the original weapon’s core algorithm.

## Example

### Plain Sword

```text
Sword.attack(context)
→ 10 physical damage
```

### Empowered Sword

```text
EmpoweredWeapon(Sword()).attack(context)
→ 15 physical damage
```

### Stacked decorators

```text
EmpoweredWeapon(EmpoweredWeapon(Sword()))
→ 20 physical damage
```

Each decorator adds its own behavior and delegates to the object inside it.

## Why not inheritance?

Inheritance creates a separate class for every combination:

```text
EmpoweredSword
EmpoweredBow
PoisonedSword
PoisonedBow
CriticalSword
...
```

Decorator uses composition instead:

```text
EmpoweredWeapon(Sword())
EmpoweredWeapon(Bow())
EmpoweredWeapon(MagicStaff())
```

The same decorator can enhance every compatible Weapon.

## Why preserve the same interface?

The decorator must still implement `Weapon`.

That allows the client to remain unchanged:

```text
player = Player(EmpoweredWeapon(Sword()), mana=10)
```

Player still performs:

```text
weapon.attack(context)
```

It does not need a separate code path for enhanced weapons.

This is the key principle:

> The wrapper adds behavior while remaining substitutable for the wrapped object.

## Failure behavior

EmpoweredWeapon must not turn a failed attack into a successful one.

For example:

```text
MagicStaff with insufficient mana
→ failure: "Not enough mana"
```

Wrapping it should preserve that failure:

```text
EmpoweredWeapon(MagicStaff())
→ failure: "Not enough mana"
```

The decorator only enhances successful damage. It does not change unrelated success or failure rules.

## SOLID connections

### Single Responsibility Principle

The base weapon owns its attack rules. EmpoweredWeapon owns the empowerment rule.

Neither class needs to own the other’s responsibility.

### Open/Closed Principle

New enhancements can be added as decorators without changing Sword, Bow, MagicStaff, or Player.

### Liskov Substitution Principle

EmpoweredWeapon must be usable anywhere a Weapon is expected.

It must honor the same input, output, and failure expectations.

### Interface Segregation Principle

The decorator implements only the Weapon operations required by Player.

### Dependency Inversion Principle

Player depends on Weapon, not on the concrete decorator or concrete wrapped weapon.

## When to use Decorator

Consider Decorator when:

- Optional behavior can be applied to different objects.
- Enhancements may be combined.
- Subclass combinations are multiplying.
- Behavior should be selected at runtime.
- The wrapper can preserve the original interface.
- Each enhancement has a focused responsibility.

Common production examples include:

- Logging wrappers
- Metrics and tracing
- Authorization checks
- Caching
- Compression
- Encryption
- Retry policies
- Validation
- Rate limiting
- UI styling
- Middleware pipelines

## When not to use Decorator

Avoid or delay Decorator when:

- There is only one fixed variation.
- The wrapper must fundamentally change the interface.
- Wrapping order creates confusing or unsafe behavior.
- The object has many internal operations that the decorator must understand.
- A simple configuration value is sufficient.
- Debugging nested wrappers would be harder than the original problem.

## Trade-offs

### Advantages

- Avoids subclass explosion.
- Supports runtime composition.
- Allows multiple enhancements to be combined.
- Keeps each enhancement focused.
- Preserves the client’s existing interface.

### Costs

- Creates more objects and indirection.
- Wrapper ordering can affect behavior.
- Debugging nested decorators can be difficult.
- Some decorators may need to understand details of the wrapped result.
- It can become unclear which behavior is active at runtime.

## Decorator ordering

The order of decorators may matter.

For example:

```text
Logging( Empowered( Sword ) )
```

and:

```text
Empowered( Logging( Sword ) )
```

may produce different logs.

Similarly:

```text
Retry( Cache( Request ) )
```

is not necessarily equivalent to:

```text
Cache( Retry( Request ) )
```

When decorators interact, document the intended order and test the combinations that matter.

## Decorator versus Adapter

| Decorator | Adapter |
|---|---|
| Preserves the expected interface | Converts to the expected interface |
| Adds behavior | Translates behavior |
| Can usually be stacked | Usually represents one compatibility boundary |
| Example: `EmpoweredWeapon(Sword())` | Example: `AncientAxeAdapter(AncientAxe())` |

The Adapter makes incompatible code usable. The Decorator makes compatible code richer.

## Decorator versus Proxy

| Decorator | Proxy |
|---|---|
| Adds or changes responsibilities | Controls access to the underlying object |
| Usually enhances normal behavior | May delay, restrict, cache, or remote the call |
| Example: add damage | Example: authorization wrapper |

The structures can look similar, but their intent differs.

## Decorator versus Strategy

| Decorator | Strategy |
|---|---|
| Wraps an existing behavior and adds to it | Replaces or selects an algorithm |
| Often preserves and extends the original behavior | Usually represents one complete alternative |
| Can be stacked | Usually one active strategy at a time |
| Example: empower Sword | Example: choose Sword versus Bow |

A Decorator answers:

> What extra behavior should be added?

A Strategy answers:

> Which algorithm should perform this operation?

## Interview questions

### What problem does Decorator solve?

It adds responsibilities dynamically without modifying the original class or creating subclasses for every combination.

### Why use Decorator instead of inheritance?

Decorator uses composition, so multiple enhancements can be combined at runtime without creating a subclass for every combination.

### Must a Decorator implement the same interface?

Usually yes. Preserving the component interface is what lets the client treat the wrapper and wrapped object uniformly.

### Can Decorators be stacked?

Yes. Stacking is one of the main benefits, but the order may affect behavior.

### How is Decorator different from Adapter?

Adapter changes an incompatible interface. Decorator preserves the interface and adds behavior.

### How is Decorator different from Proxy?

Decorator focuses on adding responsibilities. Proxy focuses on controlling access or representing another object.

## Thirty-second interview answer

Decorator adds behavior to an object by wrapping it with another object that implements the same interface. In Dungeon Arena, `EmpoweredWeapon` wraps any `Weapon`, delegates the attack, and adds five damage to successful results. This avoids creating separate empowered subclasses for Sword, Bow, Magic Staff, and every future weapon. Decorators can be stacked, but they introduce indirection and ordering concerns.

## Review checklist

Before introducing Decorator, ask:

- Is the additional behavior optional?
- Can it apply to multiple implementations?
- Does the wrapper preserve the original interface?
- Would inheritance create many combinations?
- Can decorators be composed safely?
- Does each decorator have one focused responsibility?
- Is wrapper order meaningful?
- Are failures and side effects preserved correctly?
- Would a simple configuration value be clearer?
- Can the client remain unaware of the concrete wrappers?
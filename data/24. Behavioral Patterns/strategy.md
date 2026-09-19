# Strategy Pattern

## One-line definition

The Strategy pattern encapsulates a family of interchangeable behaviors behind a common contract, allowing an object to change its behavior without changing its own implementation.

## The problem

Consider a game where a Player can attack using a Sword, Bow, or Magic Staff.

Each weapon follows different rules:

- Sword always causes 10 physical damage.
- Bow causes 5 damage at close range and 15 at long range.
- Magic Staff causes 20 magical damage but requires 5 mana.

A simple implementation might place all weapon rules inside Player:

```python
def attack(self, dragon, weapon_type, distance):
    if weapon_type == "sword":
        damage = 10
    elif weapon_type == "bow":
        damage = 5 if distance < 10 else 15
    elif weapon_type == "magic_staff":
        if self.mana < 5:
            return
        self.mana -= 5
        damage = 20
```

This works initially, but Player now knows:

- Every available weapon
- Every damage calculation
- Which weapons use mana
- Which weapons depend on distance
- The damage type of every weapon

Adding an Axe, Spear, or Poison Wand requires modifying Player again.

The Player class changes for two unrelated reasons:

1. Player behavior changes.
2. Weapon rules change.

The design becomes harder to extend, test, and understand.

## Design pressure

We want to support the following requirements:

- Add new weapons without rewriting Player.
- Switch weapons while the game is running.
- Keep weapon-specific rules together.
- Test every weapon independently.
- Allow Player to attack without knowing which concrete weapon it holds.

The important question is:

> What varies independently from Player?

The answer is the weapon’s attack algorithm.

## Intent

The Strategy pattern moves each interchangeable algorithm into a separate implementation behind a shared contract.

The object using the algorithm—the Context—delegates the behavior to its currently selected Strategy.

```text
Context → Strategy contract → Concrete Strategy
```

In Dungeon Arena:

```text
Player → Weapon → Sword
                → Bow
                → MagicStaff
```

Player knows that it has a Weapon. It does not need to know which particular Weapon it has.

## Participants

| Pattern role | Dungeon Arena class | Responsibility |
|---|---|---|
| Context | `Player` | Holds and invokes the current strategy |
| Strategy | `Weapon` | Defines the common attack contract |
| Concrete Strategy | `Sword` | Implements fixed physical damage |
| Concrete Strategy | `Bow` | Implements distance-based damage |
| Concrete Strategy | `MagicStaff` | Implements mana-dependent magical damage |
| Strategy input | `AttackContext` | Provides distance and available mana |
| Strategy output | `AttackResult` | Describes success, damage, mana cost, or failure |

## Structure

```text
                       ┌──────────────┐
                       │    Player    │
                       │──────────────│
                       │ mana         │
                       │ weapon       │
                       └──────┬───────┘
                              │ delegates attack
                              ▼
                       ┌──────────────┐
                       │    Weapon    │
                       │──────────────│
                       │ attack(...)  │
                       └──────┬───────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
       ┌──────────┐      ┌──────────┐    ┌────────────┐
       │  Sword   │      │   Bow    │    │ MagicStaff │
       └──────────┘      └──────────┘    └────────────┘
```

## Interaction flow

```text
1. Player holds a Weapon.
2. Player creates an AttackContext.
3. Player asks the Weapon to attack.
4. Weapon applies its own rules.
5. Weapon returns an AttackResult.
6. Player deducts mana when the attack succeeds.
7. Player sends the resulting Damage to Dragon.
8. Dragon applies its own damage-receiving rules.
```

The Weapon calculates an attack outcome but does not directly modify the Dragon.

This keeps three responsibilities separate:

- Weapon calculates the attack.
- Player coordinates the action and owns mana.
- Dragon owns health, armor, and damage resistance.

## Common strategy contract

All concrete weapons follow the same conceptual contract:

```python
class Weapon(ABC):
    @abstractmethod
    def attack(self, context: AttackContext) -> AttackResult:
        pass
```

Player can therefore invoke any weapon identically:

```python
result = self.current_weapon.attack(context)
```

There is no conditional checking whether the weapon is a Sword, Bow, or Magic Staff.

## Concrete strategies

### Sword

Sword ignores distance and mana.

```text
Input:
    Any valid AttackContext

Output:
    Success
    10 physical damage
    0 mana cost
```

### Bow

Bow uses distance but ignores mana.

```text
If distance < 10:
    5 physical damage

Otherwise:
    15 physical damage
```

### Magic Staff

Magic Staff uses available mana but ignores distance.

```text
If available mana >= 5:
    Success
    20 magical damage
    5 mana cost

Otherwise:
    Failure
    No damage
    0 mana cost
    "Not enough mana"
```

Each strategy receives the same type of input and produces the same type of output, even though its internal algorithm is different.

## Why use `AttackContext`?

One option would be to give each Weapon the entire Player object.

That would allow weapons to access mana, inventory, health, name, equipment, and every future Player capability.

This creates unnecessary coupling.

Instead, `AttackContext` provides only facts relevant to the attack:

```text
AttackContext
├── distance
└── available_mana
```

This follows the principle of giving a collaborator only the information it needs.

However, a context object can become a dumping ground. If it eventually contains twenty fields and most strategies use only one, the contract should be reconsidered.

Possible alternatives include:

- Smaller capability interfaces
- Different strategy families
- Strategy-specific configuration
- Passing individual parameters
- A richer domain object with intentionally exposed behavior

## Why use `AttackResult`?

Returning only a damage number is insufficient because an attack can fail.

For example, what would a returned value of `0` mean?

- The attack failed.
- Armor blocked the attack.
- The weapon intentionally caused zero damage.
- The target was immune.
- The player lacked mana.

`AttackResult` makes the outcome explicit:

```text
AttackResult
├── success
├── damage
├── mana_cost
└── failure_reason
```

It also protects its own valid state.

A successful result:

- Must contain Damage.
- Must not contain a failure reason.
- May contain a mana cost.

A failed result:

- Must not contain Damage.
- Must contain a failure reason.
- Must not consume mana.

This prevents contradictory states such as:

```text
success = false
damage = 20
mana_cost = 5
failure_reason = null
```

## Runtime strategy switching

Player can replace its current Weapon:

```python
player.switch_weapon(Bow())
```

Player’s attack implementation does not change.

```text
Before:
Player → Sword

After:
Player → Bow
```

This is composition: Player contains a Weapon and delegates behavior to it.

The relationship can change at runtime, unlike behavior fixed through inheritance.

## Where are concrete strategies selected?

Some part of the program must still choose a concrete Weapon.

In Dungeon Arena, Game handles the menu:

```text
1 → Sword
2 → Bow
3 → MagicStaff
```

This conditional is acceptable because Game is the composition boundary—the location where concrete objects are selected and assembled.

Strategy does not eliminate every conditional. It prevents algorithm-selection conditionals from spreading into stable domain behavior.

A future Factory could move object creation out of Game if weapon creation becomes sufficiently complex. A Factory should not be introduced merely to hide three simple constructor calls.

## SOLID connections

### Single Responsibility Principle

Before Strategy, Player would own both player behavior and every weapon calculation.

After Strategy:

- Player coordinates attacks and owns mana.
- Each Weapon owns its attack rules.
- Dragon owns damage-receiving rules.
- Game owns user interaction and concrete weapon selection.

Each class has a more coherent reason to change.

### Open/Closed Principle

A new weapon can be introduced by adding another Weapon implementation.

For example:

```text
Axe implements Weapon
```

Player does not need another `if` branch.

Open/Closed does not mean existing code must never change. It means recurring variation has an intentional extension point.

### Liskov Substitution Principle

Player should work correctly with every valid Weapon implementation.

Every Weapon must:

- Accept the agreed AttackContext.
- Return a valid AttackResult.
- Avoid violating expectations established by the contract.

Matching the method signature is not enough. A weapon that returns contradictory results or unexpectedly modifies unrelated Player state would violate the behavioral contract.

### Interface Segregation Principle

Weapon exposes only the operation its consumer requires: attacking.

Player does not depend on separate methods such as:

```text
calculate_arrow_damage()
check_magic_mana()
swing_sword()
```

Those details belong to individual strategies.

### Dependency Inversion Principle

Player depends on the Weapon abstraction rather than concrete classes.

```text
Player → Weapon
```

not:

```text
Player → Sword
Player → Bow
Player → MagicStaff
```

Concrete weapons are supplied from outside Player.

## Benefits

### Independent algorithms

Each weapon’s rules can change without modifying Player or other weapons.

### Runtime replacement

The selected behavior can change while the application runs.

### Focused testing

Sword, Bow, and Magic Staff can be tested independently.

### Reduced conditional complexity

Player no longer contains a growing weapon-type decision tree.

### Improved domain language

Names such as Sword, Bow, and MagicStaff communicate intent better than branches inside a large attack method.

## Costs and trade-offs

### More types

A simple conditional may become several classes and supporting Value Objects.

### Strategy selection still exists

Some component must decide which strategy to use.

### Clients may need awareness

The application layer may need to understand the available strategies to present a menu or load configuration.

### Shared input can grow

AttackContext may accumulate unrelated data as new strategies are introduced.

### Indirection

Understanding an attack requires following delegation from Player to Weapon and then interpreting AttackResult.

The pattern is worthwhile only when this flexibility justifies the additional structure.

## When to use Strategy

Consider Strategy when:

- A growing conditional selects among algorithms.
- Algorithms change independently.
- Behavior must be selected at runtime.
- Multiple classes differ primarily in one behavior.
- Algorithms require independent testing.
- Consumers should not know implementation details.
- New variations are expected regularly.

Common production examples include:

- Payment routing
- Pricing and discount rules
- Retry policies
- Sorting or ranking algorithms
- Compression formats
- Authentication mechanisms
- Tax calculations
- Recommendation algorithms
- Shipping-cost calculations
- Data serialization formats

## When not to use Strategy

Avoid or delay Strategy when:

- There is only one stable behavior.
- The alternatives are tiny and unlikely to grow.
- A local conditional is easier to understand.
- A simple function parameter is sufficient.
- The strategies cannot honor a meaningful common contract.
- Selection complexity is greater than the algorithms themselves.

Patterns should reduce the cost of change, not merely increase the number of files.

## Strategy using functions

In Python, a strategy does not always require a class.

If the algorithm is stateless and has a simple contract, it can be represented by a function:

```python
def calculate_standard_price(order):
    ...

def calculate_discounted_price(order):
    ...
```

The chosen function can be passed to the consumer.

A class-based Strategy is more useful when the strategy:

- Has configuration or state
- Has dependencies
- Implements several related operations
- Needs a domain-significant name
- Participates in a larger object model
- Benefits from explicit runtime type contracts

Senior-level design means selecting the simplest representation that satisfies the actual requirements.

## Common mistakes

### Introducing Strategy before variation exists

One implementation behind an abstraction is not automatically wrong, but the abstraction needs a meaningful architectural purpose.

### Moving the conditional without improving the design

Putting the same large `if` statement inside a class called `WeaponStrategy` does not create interchangeable strategies.

### Letting the Context know concrete strategies

If Player still imports and checks Sword, Bow, and MagicStaff, the abstraction has not achieved its purpose.

### Using an oversized context object

Passing the entire application state to every Strategy creates hidden coupling.

### Ignoring behavioral contracts

Concrete strategies must agree on more than method names. They must preserve result invariants and caller expectations.

### Confusing object creation with algorithm selection

Strategy defines interchangeable behavior. Factory patterns handle object creation. The patterns can collaborate, but they solve different problems.

## Strategy versus related patterns

### Strategy vs State

Both use composition and delegation.

| Strategy | State |
|---|---|
| Represents a selected algorithm or policy | Represents lifecycle-dependent behavior |
| Usually selected by a client or configuration | Usually changes through internal state transitions |
| Strategies generally do not know about each other | States may determine the next state |
| Answers “How should this be done?” | Answers “How should this behave right now?” |

A Player explicitly switching weapons is Strategy. A Dragon changing from Sleeping to Enraged based on its lifecycle would be State.

### Strategy vs Template Method

| Strategy | Template Method |
|---|---|
| Uses composition | Uses inheritance |
| Replaces the entire algorithm or policy | Customizes steps within a fixed algorithm |
| Can switch at runtime | Usually fixed by the subclass |
| Avoids inheritance coupling | Reuses a stable algorithm skeleton |

Prefer Strategy when independent behaviors must be replaceable. Consider Template Method when the overall sequence is stable and only specific steps vary.

### Strategy vs Command

| Strategy | Command |
|---|---|
| Represents how an operation is performed | Represents a request to perform an operation |
| Focuses on interchangeable algorithms | Focuses on request lifecycle |
| Usually invoked immediately | Can be queued, logged, retried, or undone |

### Strategy vs Factory

Strategy controls behavior after an object exists. Factory controls which object is created.

A Factory may select and create the appropriate Strategy.

## Interview questions

### What problem does Strategy solve?

It prevents a Context from owning every variation of an algorithm. Each variation is encapsulated behind a common contract and can be selected independently.

### Why is Strategy better than a conditional?

It is not always better. Strategy becomes useful when the alternatives grow, change independently, require separate dependencies, or must switch at runtime. For a small stable decision, a conditional may remain clearer.

### How does Strategy support Open/Closed?

New algorithms can be introduced through new Strategy implementations without repeatedly modifying the Context.

### How is the concrete Strategy selected?

Selection happens at a composition boundary, such as application setup, configuration, user input, dependency injection, or a Factory.

### Can Strategy be implemented with functions?

Yes. First-class functions are often sufficient for small stateless strategies. Classes are appropriate when strategies have state, configuration, dependencies, or richer domain meaning.

### What are its disadvantages?

It introduces more abstractions, requires a selection mechanism, can create an oversized shared context, and adds indirection.

## Thirty-second interview answer

Strategy encapsulates interchangeable algorithms behind a common interface. A Context delegates behavior to its selected Strategy instead of implementing every variation with conditionals. This supports runtime behavior changes and makes new algorithms easier to add and test. The trade-off is additional types, indirection, and the need for some composition-layer component to select the concrete strategy. I use it when algorithms vary independently—not simply whenever I see an `if` statement.

## Review checklist

Before introducing Strategy, ask:

- Is there a genuine family of varying behavior?
- Is the variation likely to change or grow?
- Does the current Context know too many algorithm details?
- Would a simple function or conditional remain clearer?
- Can every Strategy honor the same behavioral contract?
- Is the Strategy input focused?
- Are result states explicit and valid?
- Is concrete selection located at the composition boundary?
- Can a new Strategy be added without modifying the Context?
- Is the added abstraction cheaper than the change complexity it removes?

## Key takeaway

Strategy is not primarily about replacing `if` statements with classes.

It is about recognizing behavior that changes independently, assigning that behavior to the object that owns it, and allowing the rest of the system to depend on a stable contract.
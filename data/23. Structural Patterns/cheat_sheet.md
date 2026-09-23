# Structural Patterns — Interview Cheat Sheet

## Adapter

**Intent:** Make an incompatible interface match the interface clients expect.

**Game example:**

```text
AncientAxe.strike()
        ↓
AncientAxeAdapter.attack()
        ↓
Weapon interface
```

**Recognize it when:**

- integrating legacy code;
- using a third-party API;
- two interfaces represent compatible concepts but do not match.

**Interview phrase:**

> Adapter converts one interface into another without changing the adapted class.

---

## Decorator

**Intent:** Add behavior by wrapping an object.

**Game example:**

```text
Weapon
  └── EmpoweredWeapon
```

**Recognize it when:**

- behavior should be added dynamically;
- subclass combinations would explode;
- the original class should remain unchanged.

**Interview phrase:**

> Decorator adds responsibilities to an object dynamically while preserving its interface.

---

## Facade

**Intent:** Provide a simple interface to a complex subsystem.

**Game example:**

```text
BattleFacade.attack(...)
    → weapon switching
    → command creation
    → validation chain
    → Player attack
```

**Recognize it when:**

- clients coordinate too many classes;
- a common workflow repeats;
- internal subsystem details should be hidden.

**Interview phrase:**

> Facade simplifies access to a subsystem without removing its internal components.

---

## Composite

**Intent:** Treat individual objects and groups uniformly.

**Game example:**

```text
CombatTarget
├── Dragon
└── EnemyGroup
```

**Recognize it when:**

- objects form a tree;
- operations apply to both leaves and groups;
- callers should not distinguish one from many.

**Interview phrase:**

> Composite lets clients treat individual objects and compositions uniformly.

---

## Proxy

**Intent:** Control access to another object through a substitute with the same interface.

**Game example:**

```text
ProtectedTargetProxy → Dragon
```

**Recognize it when:**

- access control is needed;
- lazy loading or caching is useful;
- the real object is remote or expensive;
- logging or rate limiting should be added.

**Interview phrase:**

> Proxy controls access to a real subject without changing the subject itself.

---

## Key Distinctions

```text
Adapter   → change an incompatible interface
Decorator → add behavior
Facade    → simplify a subsystem
Composite → treat one and many uniformly
Proxy     → control access to one object
```

## Wrapper Pattern Distinction

Ask what the wrapper is trying to do:

```text
Different interface?       → Adapter
Additional behavior?       → Decorator
Simpler subsystem entry?   → Facade
Access/lifecycle control?  → Proxy
Tree/group representation? → Composite
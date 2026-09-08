# SOLID Principles — Cheat Sheet

## S — Single Responsibility Principle (SRP)

> **A class/module should have one cohesive responsibility and one primary reason to change.**

### Core idea

```text
Things that change for the same reason
→ belong together

Things that evolve independently
→ consider separating
```

SRP does **not** mean:

```text
1 class = 1 method ❌
```

Multiple methods can stay together if they are cohesive and tend to evolve for the same business reason.

### Example

```text
PriceCalculator
├── subtotal()
├── discount()
├── tax()
└── final_price()
```

All are part of pricing → can satisfy SRP.

But:

```text
PriceCalculator
├── calculate_price()
└── save_to_database()
```

may have two reasons to change:

```text
Pricing rules
Persistence/storage
```

→ SRP smell.

### Practical questions

```text
What is this class responsible for?

What would cause it to change?

Do these behaviors evolve independently?

Are different actors/business concerns driving changes?

Does separating them reduce meaningful coupling,
or just add indirection?
```

### Important nuance

Simple, stable, cohesive behavior can stay together.

```text
Don't split merely because you can.
```

### Orchestration

A service can coordinate multiple components without violating SRP:

```text
CheckoutService
→ Validator
→ PaymentProcessor
→ Repository
→ Notifier
```

Its responsibility may simply be:

```text
Coordinate checkout workflow
```

### Remember

> **Group behavior that changes together; separate behavior that evolves independently.**

---

# O — Open/Closed Principle (OCP)

> **Software entities should be open for extension but closed for modification.**

Practical meaning:

> **When a dimension of behavior is expected to grow, create an extension point so new variations don't repeatedly modify stable core code.**

### Axis of change

Ask:

> **What dimension is realistically expected to keep gaining variations?**

Examples:

```text
Payment method
→ Card / PayPal / ApplePay / GooglePay

Report format
→ PDF / CSV / Excel / JSON

Notification channel
→ Email / SMS / Push / WhatsApp
```

### Example

Before:

```python
if payment_type == "card":
    ...
elif payment_type == "paypal":
    ...
elif payment_type == "apple_pay":
    ...
```

Every new variation modifies the same core logic.

After:

```text
PaymentProcessor
       ↓
PaymentMethod
       ↑
Card / PayPal / ApplePay / ...
```

Adding:

```text
GooglePayPayment
```

doesn't require rewriting `PaymentProcessor`.

### OCP does NOT mean

```text
Existing code can never change ❌
```

If:

```text
Premium discount:
10% → 15%
```

modify `PremiumDiscount`.

The important distinction:

```text
Existing behavior changes
→ modify implementation

New variation added
→ ideally add implementation
```

### `if/else`

```text
if/else ≠ automatic OCP violation
```

It becomes an OCP concern when it represents a **growing family of interchangeable behaviors**.

### Composition

OCP does not require inheritance.

```text
CheckoutService
      HAS-A
DiscountPolicy
```

Composition, interfaces, DI, registries, plugins, etc. can all support OCP.

### Extensibility levels

```text
Level 1
Variation inside core logic
→ new variation modifies core

Level 2
Core depends on abstraction
→ new implementation added
→ wiring may change
→ core stays stable

Level 3
Registration/plugin mechanism is extensible
→ implementation can register/discover itself
→ generic wiring also stays stable
```

Don't build Level 3 unless needed.

### Overengineering test

```text
Expected cost of repeated future modification
                VS
Cost of abstraction today
```

If variation is:

```text
tiny
fixed
stable
unlikely to grow
```

keep it simple.

### Remember

> **Design for likely variation, not every imaginable variation.**

---

# L — Liskov Substitution Principle (LSP)

> **A subtype should be safely substitutable wherever its parent type is expected.**

Best mental shortcut:

> **A child should give the caller at least the same guarantees as the parent, or more — never fewer.**

LSP is about **behavioral compatibility**, not just matching method signatures.

### Inputs / Preconditions

```text
Child may accept MORE inputs ✅
Child may accept SAME inputs ✅
Child must not accept FEWER inputs ❌
```

Example:

```text
Parent: amount > 0
Child:  amount >= 100
```

Parent accepts `50`; child rejects it → violation.

Easy wording:

> **Child must not demand more from the caller.**

---

### Outputs / Postconditions

```text
Child may guarantee MORE ✅
Child may guarantee SAME ✅
Child must not guarantee LESS ❌
```

Example:

```text
Parent returns >= 10 results
Child returns >= 5
```

→ weaker guarantee → violation.

Easy wording:

> **Child must not give the caller less than the parent promised.**

---

### Exceptions

Parent:

```text
may throw ParseError
```

Child:

```text
throws JsonParseError extends ParseError
```

✅ compatible.

Child suddenly throws:

```text
NetworkError
```

not covered by parent contract → potential LSP violation.

---

### Invariants

Parent:

```text
stock >= 0
```

Child allows:

```text
stock = -5
```

→ breaks invariant → violation.

---

### Side effects

Parent:

```text
find()
→ returns user
→ does NOT modify storage
```

Child:

```text
find()
→ returns user
→ deletes user
```

→ unexpected side effect → violation.

---

### Observable behavior

Rectangle/Square:

```text
Rectangle:
set_width(5)
set_height(4)
→ area = 20

Square subtype:
same calls
→ area = 16
```

Same methods, different caller-observable semantics → violation.

---

### Unsupported operations

```python
class ReadOnlyStorage(FileStorage):
    def save(self, data):
        raise UnsupportedOperationException()
```

Parent promises `save()` is usable; child cannot honor it → violation.

---

### Subtype-specific caller logic

```python
if isinstance(sender, ScheduledSender):
    sender.schedule()

sender.send(message)
```

`isinstance` itself is not the violation.

It is a smell that the caller has to compensate for a subtype that cannot honor the parent contract directly.

### Important lesson

```text
Real-world IS-A
≠ automatically valid software inheritance
```

A valid business concept does not automatically make a valid subtype.

### Remember

> **Don't make the caller work harder, and don't give the caller less.**

---

# I — Interface Segregation Principle (ISP)

> **Clients should not be forced to depend on methods or capabilities they do not use.**

The goal is:

> **Simple, cohesive, client-focused interfaces.**

ISP does NOT mean:

```text
1 method = 1 interface ❌
```

### Basic example

Bad:

```text
Printer
├── print()
├── scan()
└── fax()

BasicPrinter
→ only needs print()
```

Better:

```text
Printable
Scannable
Faxable
```

Then:

```text
BasicPrinter
→ Printable

OfficePrinter
→ Printable + Scannable + Faxable
```

---

## ISP is client-driven

Even if one implementation supports everything:

```text
OfficeMachine
→ print()
→ scan()
→ fax()
```

a client like:

```text
PrintJob
→ only print()
```

should ideally depend only on:

```text
Printer
```

not the full machine interface.

> **ISP protects clients from unrelated capabilities even when the implementation supports them all.**

---

## Why unnecessary dependencies hurt

Suppose:

```text
PaymentGateway
→ charge()
→ refund()
→ settlement_report()
```

Checkout only needs `charge()`.

If settlement-report API changes, Checkout may still experience:

```text
mock/test churn
rebuild/recompile impact
API dependency churn
```

depending on language/framework.

Smaller client-focused interfaces reduce the blast radius of unrelated changes.

---

## Capability vs Role Interfaces

### Capability-based

```text
OrderReader
OrderCreator
InvoiceGenerator
```

Good when capabilities are reused across different clients.

### Role/client-based

```text
CheckoutOrders
BillingOrders
AdminAccountActions
```

Good when a client has a distinct cohesive view.

Both can coexist.

---

## When NOT to split

If:

```text
charge()
refund()
get_status()
```

are:

```text
used by all clients
cohesive
evolve together
```

keeping one interface may be better.

> **ISP is about meaningful dependency boundaries, not interface size.**

---

## ISP vs SRP

```text
SRP
→ looks inward at responsibility/change reasons

ISP
→ looks outward at what each client is forced to depend on
```

A class may satisfy SRP but still expose too broad an interface for some clients.

---

## ISP vs LSP

```text
ISP
→ Should this capability be forced into this interface/client dependency?

LSP
→ Can this subtype actually honor the inherited contract?
```

Same design can violate both, but they ask different questions.

Remember:

> **ISP does not require subclasses.**

It fundamentally concerns **clients and their dependencies**.

---

## Remember

> **Clients should depend only on the capabilities they actually need.**

---

# D — Dependency Inversion Principle (DIP)

> **High-level business logic should not depend directly on low-level implementation details. Both should depend on abstractions.**

Also:

> **Abstractions should not depend on details; details should depend on abstractions.**

### Core structure

Before:

```text
OrderService
     ↓
DynamoDBOrderStore
```

After:

```text
             OrderRepository
                ▲       ▲
                │       │
        OrderService   DynamoDBOrderStore
```

The high-level business logic depends on a stable abstraction.

The implementation detail adapts to that abstraction.

---

## What is inverted?

Before:

```text
Business policy
→ implementation detail
```

After:

```text
Business policy
→ abstraction
← implementation detail
```

> **The stable business policy defines what it needs; low-level details adapt to it.**

---

## Abstraction must be business-facing

Bad:

```python
class OrderRepository:
    def put_item(self, table, partition_key):
        ...
```

Good:

```python
class OrderRepository:
    def save(self, order):
        ...

    def find(self, order_id):
        ...
```

The low-level implementation internally handles:

```text
tables
partition keys
SQL
SDKs
provider-specific details
```

> **An interface alone does not guarantee DIP.**

---

## Infrastructure AND business variation

Infrastructure:

```text
PaymentGateway
→ Stripe / PayPal

OrderRepository
→ MySQL / DynamoDB

EmailSender
→ SMTP / SES
```

Business:

```text
TaxCalculator
→ US / EU / Canada

DiscountPolicy
→ Regular / Premium
```

DIP isn't limited to external providers.

---

## Don't abstract everything

Stable concrete dependency:

```text
OrderValidator
→ one implementation
→ stable
→ no meaningful variation
```

may not need an abstraction.

Use one when it removes meaningful coupling.

---

## Keep volatility at the edges

```text
Stripe SDK changes
       ↓
StripePaymentGateway changes

PaymentGateway
→ stable

CheckoutService
→ stable
```

Vendor/infrastructure volatility should ideally stay near system boundaries rather than leak into core business logic.

---

## DIP vs DI vs IoC

### DIP

```text
Design principle
→ What direction should dependencies point?
```

### DI

```text
Mechanism
→ Dependency supplied from outside
```

### IoC

```text
Broader concept
→ control/creation moves outward
```

Example:

```python
class CheckoutService:
    def __init__(self, stripe: StripePaymentGateway):
        ...
```

Passing `StripePaymentGateway` externally gives:

```text
DI ✅
IoC ✅
DIP ❌
```

because Checkout still depends directly on Stripe.

Better:

```python
class CheckoutService:
    def __init__(self, gateway: PaymentGateway):
        ...
```

> **DI can help implement DIP, but DI does not automatically imply DIP.**

---

## Composition Root

Concrete implementations still need to be created somewhere:

```python
gateway = StripePaymentGateway(...)
repo = MySQLOrderRepository(...)

service = CheckoutService(gateway, repo)
```

That outer startup/wiring location is the **composition root**.

```text
Business code:
"I need PaymentGateway."

Composition root:
"Use Stripe for this deployment."
```

---

## Testing

You can mock concrete dependencies.

But:

```text
Mock DynamoDBOrderRepository
→ test still knows DynamoDB detail

Fake OrderRepository
→ test only knows business-facing contract
```

Testability is a benefit of DIP, not its primary purpose.

---

## DIP vs other principles

```text
OCP
→ Can I add another implementation
  without rewriting core logic?

DIP
→ What should that core depend on?

LSP
→ Can all implementations safely honor the abstraction?

ISP
→ Is the abstraction appropriately scoped for this client?

SRP
→ Does provider integration introduce another
  independent reason for the high-level class to change?
```

---

# SOLID — Final Comparison

```text
S — SRP
What are this entity's reasons to change?

O — OCP
What dimension is expected to grow,
and does it deserve an extension point?

L — LSP
Can this subtype safely replace its parent
without breaking behavioral guarantees?

I — ISP
What capabilities does this client actually need?

D — DIP
What direction should dependencies point?
```

---

# SOLID — Common Theme

Across all five principles:

```text
Don't apply rules mechanically.

Look for:
→ meaningful coupling
→ independent evolution
→ stable boundaries
→ actual client needs
→ behavioral contracts
→ expected variation
```

And always balance:

```text
Benefit of abstraction / separation
                VS
Complexity and indirection introduced
```

---

# 30–60 Second SOLID Interview Summary

> **SOLID is a set of object-oriented design principles for creating maintainable and evolvable software. SRP focuses on keeping responsibilities cohesive and separating things that change for independent reasons. OCP focuses on creating extension points around expected variation. LSP ensures subtypes preserve the behavioral contract of their parent. ISP keeps clients from depending on capabilities they don't use. DIP keeps stable high-level policy from depending directly on low-level details by introducing appropriate abstractions.**
>
> **I don't apply these mechanically—the goal is to reduce meaningful coupling and improve independent evolution without introducing unnecessary abstraction or indirection.**

---

# Ultra-Quick Recall

```text
SRP
→ Reasons to change

OCP
→ Dimensions of variation

LSP
→ Behavioral guarantees

ISP
→ Client dependency boundaries

DIP
→ Dependency direction
```

```text
S → Change together
O → Extend without repeatedly rewriting core
L → Same guarantees or more, never fewer
I → Depend only on what you need
D → Business → abstraction ← details
```

![SOLID principles decision guide](data/21.%20SOLID%20Principles/image.png)

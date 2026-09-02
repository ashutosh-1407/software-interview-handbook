# Part 1 — Single Responsibility Principle (SRP)

> **A class should have one cohesive responsibility and therefore one reason to change.**

---

## 1. What is SRP?

The **Single Responsibility Principle (SRP)** is the first principle in SOLID.

A common definition is:

> **A class should have only one reason to change.**

Another useful way to think about it is:

> **Things that change for the same reason belong together. Things that change for different reasons should usually be separated.**

SRP does **not** mean:

```text
One class
→ One method
```

A class can contain many methods and still follow SRP.

What matters is whether those methods belong to the **same cohesive responsibility** and tend to evolve for the **same reason**.

---

# 2. The Core Mental Model

Consider:

```python
class PriceCalculator:

    def calculate_subtotal(self):
        ...

    def calculate_discount(self):
        ...

    def calculate_tax(self):
        ...

    def calculate_final_price(self):
        ...
```

There are four methods.

That does **not** mean there are four responsibilities.

All of them contribute to:

```text
Pricing rules
     ↓
PriceCalculator
     ↓
├── subtotal
├── discount
├── tax
└── final price
```

If pricing/business rules change, these methods may need to change.

They form one cohesive responsibility:

> **Price calculation**

Therefore, this class can satisfy SRP.

---

# 3. Multiple Methods ≠ Multiple Responsibilities

This is one of the most important SRP distinctions.

Consider:

```python
class SalaryCalculator:

    def calculate_base_salary(self):
        ...

    def calculate_bonus(self):
        ...

    def calculate_tax(self):
        ...

    def calculate_total(self):
        ...
```

Even though the class performs several operations, they are all part of:

```text
Compensation calculation
```

They are cohesive and likely to evolve because of the same general category of requirement:

```text
Compensation rules change
        ↓
SalaryCalculator changes
```

Therefore:

```text
Multiple methods
      ≠
Multiple responsibilities
```

---

# 4. What Does a Violation Look Like?

Now suppose we modify our earlier example:

```python
class PriceCalculator:

    def calculate_subtotal(self):
        ...

    def calculate_discount(self):
        ...

    def calculate_tax(self):
        ...

    def calculate_final_price(self):
        ...

    def save_price_to_database(self):
        ...
```

Now there are two independent reasons this class might change.

### Reason 1 — Pricing rules

```text
Pricing/business rules change
        ↓
calculate_subtotal()
calculate_discount()
calculate_tax()
calculate_final_price()
```

### Reason 2 — Persistence rules

```text
Database/storage changes
        ↓
save_price_to_database()
```

These responsibilities evolve independently.

A better design could be:

```python
class PriceCalculator:

    def calculate_subtotal(self):
        ...

    def calculate_discount(self):
        ...

    def calculate_tax(self):
        ...

    def calculate_final_price(self):
        ...


class PriceRepository:

    def save(self, price):
        ...
```

Now:

```text
PriceCalculator
→ pricing responsibility

PriceRepository
→ persistence responsibility
```

---

# 5. Same Entity Does NOT Mean Same Responsibility

A common mistake is grouping functionality together simply because it operates on the same entity.

For example:

```python
class InvoiceService:

    def calculate_total(self, invoice):
        ...

    def save_to_database(self, invoice):
        ...

    def generate_pdf(self, invoice):
        ...

    def send_email(self, invoice):
        ...
```

Everything operates on an `Invoice`.

It might therefore seem reasonable to say:

```text
InvoiceService
→ handles invoices
```

But "handles invoices" is too broad to be a useful responsibility.

The class could change because of:

```text
Pricing rules change
        ↓
calculate_total()

Database/storage changes
        ↓
save_to_database()

PDF requirements change
        ↓
generate_pdf()

Email requirements/provider changes
        ↓
send_email()
```

These concerns can evolve independently.

A better separation might be:

```text
InvoiceCalculator
→ invoice calculations

InvoiceRepository
→ persistence

InvoicePdfGenerator
→ PDF generation

InvoiceNotifier
→ notifications
```

Therefore:

> **Same entity ≠ same responsibility.**

---

# 6. Same Data Does NOT Automatically Mean Same Responsibility

Two operations can use exactly the same data while still serving different responsibilities.

For example:

```text
employee.hours
     │
     ├── payroll calculation
     │
     └── management hours report
```

Both use employee hours.

But imagine:

```text
Payroll team
→ changes compensation rules

HR / Management
→ changes reporting requirements
```

The fact that both operations use `employee.hours` does not prove they belong together.

At the same time, this also does **not automatically mean they must be separated**.

If both operations are:

- simple,
- stable,
- cohesive,
- and do not meaningfully evolve independently,

keeping them together may be perfectly reasonable.

The key question remains:

> **Do we gain a useful boundary by separating them?**

---

# 7. Reasons to Change

A powerful way to identify responsibilities is to ask:

> **What kinds of requirements would cause me to modify this class?**

Consider:

```python
class PaymentService:

    def calculate_processing_fee(self, payment):
        ...

    def validate_payment_limit(self, payment):
        ...

    def record_payment(self, payment):
        ...
```

Suppose:

```text
Finance
→ processing fee rules

Risk / Compliance
→ payment limit rules

Platform / Database
→ persistence rules
```

Even though everything is related to "payments," there are multiple independent sources of change.

A possible decomposition is:

```text
PaymentFeeCalculator
→ fee calculation

PaymentLimitValidator
→ risk / limit validation

PaymentRepository
→ persistence

PaymentService
→ payment workflow orchestration
```

---

# 8. Actors / Sources of Change

Another useful SRP lens is:

> **Who can request changes to this code?**

An "actor" does not necessarily mean one literal person.

It represents a business or technical concern that drives changes.

For example:

```text
Finance
   ↓
PaymentFeeCalculator

Risk / Compliance
   ↓
PaymentLimitValidator

Platform / Database
   ↓
PaymentRepository
```

If several independent actors repeatedly require changes to the same class, that is a strong signal that the class may contain multiple responsibilities.

However:

> **Different possible actors do not automatically mean we must immediately create separate classes.**

We still consider complexity, cohesion, frequency of change, and whether separation provides a meaningful benefit.

---

# 9. Orchestration Is Not Automatically an SRP Violation

Consider:

```python
class UserService:

    def register_user(self, user):
        self.validator.validate(user)
        self.repository.save(user)
        self.notifier.send_welcome_email(user)
```

This class performs several calls:

```text
validate
save
notify
```

But `UserService` is not implementing those responsibilities itself.

Instead:

```text
UserValidator
→ validation rules

UserRepository
→ persistence

UserNotifier
→ notifications
```

`UserService` simply coordinates them.

Its responsibility can be:

```text
Coordinate the user-registration workflow
```

Therefore:

> **Calling multiple components does not automatically give a class multiple responsibilities.**

An orchestration/service layer can satisfy SRP if its responsibility is coordinating a particular workflow.

---

# 10. Implementation vs Orchestration

Compare these two designs.

## Design A — Responsibilities implemented inside the service

```python
class UserService:

    def register_user(self, user):
        self.validate_user(user)
        self.save_user(user)
        self.send_email(user)

    def validate_user(self, user):
        # complex validation rules
        ...

    def save_user(self, user):
        # SQL/database logic
        ...

    def send_email(self, user):
        # provider/template logic
        ...
```

Now `UserService` may change because of:

```text
Validation rules
Database implementation
Email implementation
Registration workflow
```

This is a strong SRP violation signal.

---

## Design B — Service orchestrates responsibilities

```python
class UserService:

    def __init__(self, validator, repository, notifier):
        self.validator = validator
        self.repository = repository
        self.notifier = notifier

    def register_user(self, user):
        self.validator.validate(user)
        self.repository.save(user)
        self.notifier.send_welcome_email(user)
```

Now:

```text
UserService
→ registration workflow

UserValidator
→ validation

UserRepository
→ persistence

UserNotifier
→ notifications
```

This provides clearer responsibility boundaries.

---

# 11. Simple and Stable Logic Can Stay Together

SRP should not be applied mechanically.

Consider:

```python
class CheckoutService:

    def validate_cart(self, cart):
        ...

    def calculate_total(self, cart):
        ...
```

Suppose both operations are:

- simple,
- stable,
- closely related to checkout,
- unlikely to evolve independently.

We could create:

```text
CartValidator
PriceCalculator
CheckoutService
```

But what did we gain?

Potentially very little.

Instead we added:

```text
More classes
More dependencies
More constructor injection
More files
More navigation
More indirection
```

Keeping the simple logic inside `CheckoutService` can therefore be completely reasonable.

---

# 12. When Should We Extract It?

Suppose checkout evolves.

Initially:

```text
CheckoutService

validate_cart()
calculate_total()
```

Later, validation becomes:

```text
Inventory validation
Age restrictions
Regional restrictions
Product compatibility rules
Purchase limits
```

And pricing becomes:

```text
Regional pricing
Discount rules
Coupons
Promotions
Membership pricing
Tax calculations
```

Now these responsibilities have become:

- more complex,
- independently evolving,
- possibly owned by different concerns.

That creates a stronger reason to extract:

```text
CheckoutService
      │
      ├── CartValidator
      │
      └── PriceCalculator
```

SRP boundaries can therefore evolve as the system evolves.

---

# 13. Meaningful Coupling vs Unnecessary Indirection

This is an important practical SRP trade-off.

Ask:

> **Does separating this responsibility reduce meaningful coupling, or does it merely add indirection?**

---

## Example — Separation may add little value

```python
class CheckoutService:

    def validate_cart(self, cart):
        ...

    def calculate_total(self, cart):
        ...
```

If both are tiny and stable, splitting them may turn:

```text
CheckoutService
    ↓
calculate_total()
```

into:

```text
CheckoutService
    ↓
PriceCalculator
    ↓
calculate()
```

without solving an actual problem.

That is mostly **additional indirection**.

---

## Example — Separation reduces meaningful coupling

Now imagine:

```python
class CheckoutService:

    def calculate_total(self, cart):
        ...

    def charge_payment(self, payment):
        # payment provider integration
        # retries
        # idempotency
        # authentication
        # payment error handling
        ...
```

Payment processing can evolve independently.

Without separation:

```text
Payment provider changes
        ↓
CheckoutService changes

Payment retry policy changes
        ↓
CheckoutService changes

Payment authentication changes
        ↓
CheckoutService changes
```

Checkout is now coupled to payment implementation details.

Extracting:

```text
CheckoutService
       ↓
PaymentProcessor
```

gives:

```text
Payment implementation changes
        ↓
PaymentProcessor changes

Checkout workflow
        ↓
CheckoutService usually remains unchanged
```

Here the separation creates a **meaningful architectural boundary**.

---

# 14. Don't Over-Apply SRP

One of the biggest SRP mistakes is turning every action into its own class.

Starting with:

```python
class OrderService:

    def validate(self, order):
        ...

    def calculate_total(self, order):
        ...

    def save(self, order):
        ...
```

and immediately creating:

```text
OrderValidator
OrderTotalCalculator
OrderSaver
OrderCoordinator
OrderFactory
OrderMapper
...
```

can result in:

```text
Simple feature
     ↓
Many tiny classes
     ↓
More indirection
     ↓
Harder code navigation
     ↓
Higher cognitive overhead
```

SRP does **not** mean:

```text
One operation
→ one class
```

It means:

```text
One cohesive responsibility
→ one class/module
```

---

# 15. Practical Example — Checkout

Suppose:

```python
class CheckoutService:

    def validate_cart(self, cart):
        ...

    def calculate_total(self, cart):
        ...

    def charge_payment(self, payment):
        ...

    def send_confirmation_email(self, order):
        ...
```

Assume:

- cart validation is simple and stable,
- total calculation is simple and stable,
- payment logic evolves independently,
- email providers/templates evolve independently.

A reasonable V1 design is:

```text
CheckoutService
      │
      ├── validate cart
      ├── calculate total
      │
      ├── PaymentProcessor
      │       └── charge()
      │
      └── EmailNotifier
              └── send_confirmation()
```

Responsibilities:

```text
CheckoutService
→ coordinate checkout

PaymentProcessor
→ payment processing

EmailNotifier
→ notifications
```

We do **not** necessarily need:

```text
CartValidator
PriceCalculator
```

yet.

If validation and pricing later become complex or independently evolving, we can extract them then.

---

# 16. Practical SRP Decision Framework

When reviewing a class, ask these questions in order.

## Question 1 — What is this class responsible for?

Can its responsibility be described clearly?

```text
Good:
"Calculate product pricing"

Good:
"Persist orders"

Good:
"Coordinate checkout"

Suspicious:
"Handle everything related to orders"
```

---

## Question 2 — What would cause this class to change?

List the possible reasons.

For example:

```text
Pricing requirements
Database requirements
Email requirements
Reporting requirements
```

If several unrelated reasons appear, investigate further.

---

## Question 3 — Do these concerns evolve independently?

Ask:

```text
Could pricing change without persistence changing?

Could email requirements change without checkout rules changing?

Could reporting change without payroll changing?
```

If yes, separation may provide value.

---

## Question 4 — Are different actors driving those changes?

For example:

```text
Finance
Risk
Compliance
Platform
Product
Reporting
```

Multiple independent actors can be a strong signal of multiple responsibilities.

---

## Question 5 — Would separation actually help?

Ask:

```text
Does separation allow independent evolution?

Does it reduce coupling?

Does it isolate complexity?

Does it improve maintainability/testing?
```

If yes, extract the responsibility.

---

## Question 6 — Or are we just creating indirection?

If the functionality is:

```text
simple
stable
cohesive
unlikely to evolve independently
```

keeping it together may be better.

---

# 17. Common SRP Interview Traps

## Trap 1 — "The class has many methods, so it violates SRP."

Wrong.

```text
Many methods
+ one cohesive responsibility
+ same reason to change
→ can satisfy SRP
```

---

## Trap 2 — "Everything operates on User, so it belongs in UserService."

Wrong.

```text
Same entity
≠
same responsibility
```

User validation, persistence, reporting, notifications, and authentication may all evolve independently.

---

## Trap 3 — "These methods use the same data, so they belong together."

Not necessarily.

```text
Same data
≠
same reason to change
```

---

## Trap 4 — "Different actors exist, so I must create separate classes immediately."

Too aggressive.

Actors are a useful signal, not an automatic class-generation rule.

Consider:

```text
complexity
cohesion
frequency of change
independent evolution
benefit of separation
```

---

## Trap 5 — "Every method deserves its own class."

Wrong.

This creates class explosion and unnecessary indirection.

---

## Trap 6 — "A service calling several components violates SRP."

Not necessarily.

```text
CheckoutService
   ↓
PaymentProcessor
InventoryService
OrderRepository
Notifier
```

can have one responsibility:

> **Coordinate checkout.**

---

# 18. SRP Smells

Things that should make you investigate a class:

```text
Class changes for unrelated requirements

Different teams repeatedly modify different parts

Business logic mixed with persistence

Business logic mixed with presentation

Business logic mixed with notification/provider details

Large "Manager" or "Service" classes handling everything

Unrelated methods grouped because they use the same entity

Frequent changes to one responsibility risk breaking another
```

These are **signals**, not automatic proof of a violation.

---

# 19. SRP and Cohesion

SRP is closely related to **cohesion**.

A cohesive class contains things that naturally belong together.

For example:

```text
PriceCalculator
├── subtotal
├── discount
├── tax
└── final price
```

has high cohesion.

Compare:

```text
OrderManager
├── calculate_price
├── save_database
├── generate_pdf
├── send_email
└── upload_file
```

These operations may all involve an order, but their reasons for changing are largely independent.

SRP encourages **high cohesion and useful boundaries**.

---

# 20. Final Mental Model

When thinking about SRP, don't ask:

```text
"How many methods does this class have?"
```

Ask:

```text
"What is this class responsible for?"

"What would cause it to change?"

"Do those things evolve independently?"

"Who or what drives those changes?"

"Would separating them create a useful boundary?"

"Or would separation just add unnecessary indirection?"
```

The goal is:

```text
                    SRP

             Cohesive responsibility
                      │
            One primary reason to change
                      │
           ┌──────────┴──────────┐
           │                     │
    Evolves independently?   Evolves together?
           │                     │
          YES                    YES
           │                     │
    Consider separating      Keep cohesive
           │
           ▼
 Does separation provide
 meaningful benefit?
      │           │
     YES          NO
      │           │
   Extract      Keep simple
```

---

# 21. 30–60 Second Interview Answer

> **The Single Responsibility Principle states that a class should have one cohesive responsibility and therefore one reason to change.**
>
> This doesn't mean a class can have only one method. Multiple methods can belong together if they're cohesive and tend to evolve for the same reason.
>
> If a class contains responsibilities that evolve independently — for example, because different business or technical concerns drive their changes — that's a strong indication of an SRP violation.
>
> At the same time, I wouldn't mechanically split every operation into a separate class. If functionality is simple, cohesive, and changes together, keeping it together can avoid unnecessary indirection. As responsibilities become more complex or start evolving independently, I'd separate them.

---

# 22. Quick Recall

```text
SRP
│
├── One cohesive responsibility
│
├── One primary reason to change
│
├── Multiple methods are fine
│
├── Same entity ≠ same responsibility
│
├── Same data ≠ same responsibility
│
├── Different actors → investigate
│
├── Independent evolution → strong reason to separate
│
├── Orchestration ≠ automatic violation
│
├── Simple + stable + cohesive → can stay together
│
└── Don't over-engineer
       ↓
   Avoid class explosion
```

## The One Sentence to Remember

> **Group behavior that changes together, separate behavior that evolves independently, and don't create boundaries that provide no meaningful benefit.**
# Part 2 — Open/Closed Principle (OCP)

> **Software entities should be open for extension, but closed for modification.**

The Open/Closed Principle is the **O** in SOLID.

A practical interpretation is:

> **When a dimension of behavior is expected to grow, design an extension point so new variations can be added without repeatedly modifying stable core code.**

OCP does **not** mean existing code should never change.

The goal is to identify **expected variation** and protect the stable parts of the system from repeatedly changing because of that variation.

---

# 1. Core Mental Model

Consider:

```python
class PaymentProcessor:
    def process(self, payment_type, amount):
        if payment_type == "credit_card":
            ...
        elif payment_type == "paypal":
            ...
```

If the roadmap includes:

```text
Credit Card
PayPal
Apple Pay
Google Pay
Bank Transfer
...
```

then every new payment method requires modifying `PaymentProcessor`:

```text
New payment method
        ↓
Modify PaymentProcessor
        ↓
Add another branch
        ↓
Retest central processing code
```

The problem is **not simply the presence of `if/elif`**.

The problem is:

> **Payment method is an expected dimension of variation, but every new variation requires modifying the same stable class.**

An OCP-oriented design could be:

```python
class PaymentMethod:
    def process(self, amount):
        ...


class CreditCardPayment(PaymentMethod):
    def process(self, amount):
        ...


class PayPalPayment(PaymentMethod):
    def process(self, amount):
        ...


class PaymentProcessor:
    def process(self, payment_method, amount):
        payment_method.process(amount)
```

Now:

```text
PaymentProcessor       ← stable core
       │
       ▼
PaymentMethod          ← extension point
       ▲
       │
 ┌─────┼──────────────┐
Card  PayPal  ApplePay  GooglePay
```

Adding:

```python
class GooglePayPayment(PaymentMethod):
    ...
```

does not require changing `PaymentProcessor`.

---

# 2. Axis / Dimension of Change

One of the most useful OCP questions is:

> **What dimension of this system is realistically expected to keep gaining new variations?**

This is an **axis of change** or **variation point**.

Examples:

```text
Payment method
    ├── Card
    ├── PayPal
    ├── Apple Pay
    └── Google Pay


Report format
    ├── PDF
    ├── Excel
    ├── CSV
    ├── JSON
    └── XML


Notification channel
    ├── Email
    ├── SMS
    ├── Push
    └── WhatsApp
```

The senior-level question is not:

> "Can I abstract this?"

Almost anything can be abstracted.

Instead ask:

> **"Is this a likely axis of change that deserves an extension point?"**

Meaning:

> Is this behavior realistically expected to gain enough new variations that creating a clean way to plug them in is worth the additional abstraction?

---

# 3. What Is an Extension Point?

An **extension point** is a stable boundary through which new behavior can be added.

For example:

```python
class DiscountPolicy:
    def calculate(self, price):
        ...
```

with:

```python
class RegularDiscount(DiscountPolicy):
    ...

class PremiumDiscount(DiscountPolicy):
    ...

class VipDiscount(DiscountPolicy):
    ...
```

The stable consumer becomes:

```python
class DiscountCalculator:
    def calculate(self, policy, price):
        return policy.calculate(price)
```

Architecture:

```text
DiscountCalculator
        │
        ▼
 DiscountPolicy       ← extension point
        ▲
   ┌────┼─────┐
Regular Premium VIP
```

If `EmployeeDiscount` is introduced:

```python
class EmployeeDiscount(DiscountPolicy):
    ...
```

the stable calculator does not need to understand the new variation.

---

# 4. What Does "Closed for Modification" Actually Mean?

This is one of the most important OCP nuances.

It does **not** mean:

```text
Existing code can never change.
```

Suppose:

```python
class PremiumDiscount:
    def calculate(self, price):
        return price * 0.90
```

The business changes Premium discount from 10% to 15%.

We should modify it:

```python
class PremiumDiscount:
    def calculate(self, price):
        return price * 0.85
```

That's perfectly reasonable.

The distinction is:

```text
Existing behavior changes
        ↓
Modify that implementation


New variation appears
        ↓
Ideally add a new implementation
instead of repeatedly changing stable core code
```

For example:

```text
Premium:
10% → 15%

→ modify PremiumDiscount
```

versus:

```text
New Employee discount

→ add EmployeeDiscount
→ ideally don't modify DiscountCalculator
```

Therefore:

> **Closed for modification does not mean frozen.**

It means stable code is protected against a **particular expected kind of change**.

---

# 5. OCP Is Contextual

OCP is not absolute.

Suppose we design:

```text
PricingStrategy
      ↑
RegularPricing
HolidayPricing
PremiumPricing
```

This architecture may be designed to protect against:

```text
ADDING new pricing strategies
```

But it does not protect against every imaginable pricing change.

If:

```python
class HolidayPricing:
    def calculate(self, price):
        return price * 0.80
```

needs to become:

```python
return price * 0.75
```

we simply modify `HolidayPricing`.

So when applying OCP, think:

> **"What particular kind of expected change am I trying to protect the stable code from?"**

---

# 6. `if/elif` Is NOT Automatically an OCP Violation

A common interview mistake is:

```text
if / switch
    ↓
OCP violation
```

That is wrong.

Consider:

```python
if order.total > 100:
    return 0

return 10
```

This might simply mean:

```text
Order > $100
→ Free shipping
```

There is no reason to immediately create:

```text
ShippingPolicy
FreeShippingPolicy
PaidShippingPolicy
ShippingPolicyFactory
...
```

A better question is:

> **Does this branching represent a growing family of interchangeable behaviors that we expect to extend?**

So:

```text
if / elif / switch
        ≠
automatic OCP violation
```

---

# 7. Conditional Dispatch and Growing Variations

Consider:

```python
class DiscountCalculator:
    def calculate(self, customer_type, price):
        if customer_type == "regular":
            return price
        elif customer_type == "premium":
            return price * 0.9
        elif customer_type == "vip":
            return price * 0.8
```

If requirements are:

```text
Regular
Premium
VIP
```

and that's essentially fixed, this may be perfectly reasonable.

But suppose the roadmap is:

```text
Regular
Premium
VIP
Employee
Student
Partner
Corporate
...
```

Now `customer type` is a likely axis of change.

We may introduce:

```text
DiscountPolicy
      ↑
RegularDiscount
PremiumDiscount
VipDiscount
EmployeeDiscount
...
```

Important nuance:

When adding:

```python
elif customer_type == "employee":
    return price * 0.7
```

we are **not modifying Premium's business logic** or **VIP's business logic**.

The OCP concern is:

```text
New variation
     ↓
Same central DiscountCalculator
must be modified again
```

That's the precise problem.

---

# 8. Composition and OCP

OCP does **not** require inheritance.

Composition is often one of the cleanest ways to support OCP.

```python
class CheckoutService:
    def __init__(self, discount_policy):
        self.discount_policy = discount_policy

    def checkout(self, price):
        return self.discount_policy.calculate(price)
```

This represents:

```text
CheckoutService
      HAS-A
DiscountPolicy
```

rather than:

```text
CheckoutService
      IS-A
DiscountPolicy
```

We can plug in:

```python
CheckoutService(RegularDiscount())
CheckoutService(PremiumDiscount())
CheckoutService(EmployeeDiscount())
```

without changing `CheckoutService`.

Conceptually:

```text
CheckoutService
      │
      │ composition
      ▼
DiscountPolicy
      ▲
 ┌────┼──────────┐
Regular Premium Employee
```

OCP can therefore be achieved through mechanisms such as:

```text
Composition
Interfaces / protocols
Dependency injection
Polymorphism
Registries
Configuration
Plugins
Inheritance
```

The important idea is:

> **OCP is about extensibility, not inheritance.**

Composition will become especially important later when studying the **Strategy Pattern**.

---

# 9. Stable Core vs Variable Behavior

A useful OCP design separates:

```text
Stable behavior
      from
Expected variation
```

Suppose:

```python
class ShippingCostCalculator:
    def calculate(self, policy, weight):
        return policy.calculate(weight)
```

and the roadmap includes:

```text
Standard
Express
Same-Day
International
Drone
...
```

Then:

```text
Stable:
ShippingCostCalculator

Variable:
Shipping policies
```

Architecture:

```text
ShippingCostCalculator
          │
          ▼
    ShippingPolicy
          ▲
     ┌────┼────────┐
 Standard Express SameDay ...
```

The extension point creates a boundary between the stable and variable parts.

---

# 10. Frequent Changes vs Growing Variations

These are different.

Suppose there are only:

```text
Standard
Express
```

but their rates frequently change:

```text
Standard:
1.0 → 1.2 → 1.4

Express:
2.0 → 2.3 → 2.5
```

Those are changes to **existing behavior**.

Compare that with:

```text
Standard
Express
Same-Day
Drone
International
Pickup
Partner Carrier
...
```

That's a **growing family of variations**.

OCP becomes much more valuable in the second situation.

```text
Frequent value/logic changes
        ≠
automatically needs an extension point


Growing family of behaviors
        ↓
strong OCP candidate
```

---

# 11. Expected Variation vs Speculative Abstraction

Suppose an internal tool supports:

```text
Email
SMS
```

and requirements indicate those are the only channels it will need.

We could create:

```text
Notifier
   ↑
EmailNotifier
SMSNotifier
```

But that doesn't automatically mean we should.

If the behavior is:

```text
tiny
stable
unlikely to grow
```

then introducing:

```text
interfaces
extra classes
DI
factories
registries
```

may create more complexity than value.

Now suppose the roadmap already contains:

```text
Push
WhatsApp
Teams
Slack
```

That's different.

Notification channel is now clearly an expected axis of growth.

It makes sense to introduce the extension point earlier rather than knowingly accumulating branches around code we already expect to refactor.

Rule:

> **Design for likely variation, not every imaginable variation.**

---

# 12. OCP Does Not Eliminate Change — It Localizes Change

Consider:

```text
PaymentService
      │
      ▼
PaymentMethod
      ▲
Card / PayPal / ApplePay
```

Adding:

```python
class GooglePayPayment(PaymentMethod):
    ...
```

keeps `PaymentService` stable.

But somewhere we may still need:

```python
if payment_type == "card":
    payment_method = CardPayment()
elif payment_type == "paypal":
    payment_method = PayPalPayment()
elif payment_type == "google_pay":
    payment_method = GooglePayPayment()
```

So adding Google Pay still changed **some existing code**.

That's okay.

OCP does not promise:

```text
New feature
→ zero existing lines change
```

Instead:

```text
New variation
→ add implementation
→ possibly update wiring
→ stable core remains unchanged
```

The main win is:

> **The stable business logic does not need to understand every new variation.**

---

# 13. Selection and Wiring

Eventually something often needs to decide:

```text
Which implementation should I use?
```

For example:

```python
class DiscountPolicyFactory:
    def get_policy(self, customer_type):
        if customer_type == "regular":
            return RegularDiscount()
        elif customer_type == "premium":
            return PremiumDiscount()
        elif customer_type == "vip":
            return VipDiscount()
```

Then:

```python
policy = factory.get_policy(customer.type)
calculator.calculate(policy, price)
```

Conceptually:

```text
Application wiring
      │
      ▼
Select implementation
      │
      ▼
DiscountPolicy
      │
      ▼
Stable business logic
```

The factory or wiring may still change when new implementations are added.

That is often completely reasonable.

We should only make **the wiring itself extensible** when that provides meaningful value.

---

# 14. Three Levels of Extensibility

## Level 1 — Variations Inside Core Logic

```python
class PaymentService:
    def pay(self, payment_type, amount):
        if payment_type == "card":
            ...
        elif payment_type == "paypal":
            ...
        elif payment_type == "apple_pay":
            ...
```

```text
New payment method
      ↓
Modify core PaymentService
```

If payment methods keep growing, this provides weak protection from change.

---

## Level 2 — Stable Core Uses an Extension Point

```text
PaymentService
      │
      ▼
PaymentMethod
      ▲
 ┌────┼──────────┐
Card PayPal ApplePay
```

Adding:

```python
class GooglePayPayment(PaymentMethod):
    ...
```

gives:

```text
New variation
      ↓
Add implementation
      +
possibly update wiring
      ↓
PaymentService remains stable
```

For many applications, this is enough.

---

## Level 3 — Registration Is Extensible Too

Some systems need implementations to be added independently.

For example:

```text
Generic Core
     │
     ▼
SerializerRegistry
     ▲
     │
 ┌───┼───────────┐
JSON Plugin   XML Plugin   YAML Plugin
```

A new plugin can register itself:

```python
registry.register("yaml", YamlSerializer())
```

Conceptually:

```text
New variation
      ↓
Add/install plugin
      ↓
Plugin registers/discovers itself
      ↓
Generic wiring remains stable
      ↓
Core remains stable
```

This can be useful for:

```text
Plugin systems
IDE extensions
Serializers
Database drivers
Payment-provider integrations
```

But:

> **Do not build Level 3 just because you can.**

If Level 2 solves the actual problem, Level 3 may simply add unnecessary complexity.

---

# 15. OCP and Regression Safety

OCP also has a practical testing benefit.

Suppose:

```python
if format == "pdf":
    # 100 lines
elif format == "excel":
    # 120 lines
elif format == "csv":
    # 80 lines
```

Adding JSON requires modifying the same central method.

```text
New feature
      ↓
Modify existing central code
      ↓
Potential regression in existing paths
```

Compare:

```text
ReportFormatter
      ↑
PDFFormatter
ExcelFormatter
CSVFormatter
JSONFormatter
```

Adding JSON primarily means:

```text
Add JSONFormatter
+
wire/register it
```

The stable generator remains untouched.

This does not eliminate regression testing, but it can:

> **Reduce the blast radius of expected extensions by reducing how much already-working code must be modified.**

---

# 16. Report Generator Example

Original:

```python
class ReportGenerator:
    def generate(self, report_type, data):
        if report_type == "pdf":
            # PDF-specific logic
            ...
        elif report_type == "excel":
            # Excel-specific logic
            ...
        elif report_type == "csv":
            # CSV-specific logic
            ...
```

Suppose the roadmap includes:

```text
JSON
XML
HTML
...
```

The axis of change is:

```text
Report format
```

Introduce:

```python
class ReportFormatter:
    def generate(self, data):
        ...
```

with:

```text
ReportFormatter
      ↑
 ┌────┼─────────────┐
PDF  Excel  CSV  JSON  XML
```

Stable coordinator:

```python
class ReportGenerator:
    def generate(self, formatter, data):
        return formatter.generate(data)
```

Now:

```text
Stable:
ReportGenerator

Extension point:
ReportFormatter

Variations:
PDF / Excel / CSV / JSON / XML / ...
```

---

# 17. OCP vs SRP

SRP and OCP often improve the same design, but they answer different questions.

Consider:

```text
ReportGenerator
 ├── PDF logic
 ├── Excel logic
 └── CSV logic
```

SRP may ask:

```text
Do these format-specific responsibilities
evolve independently?
```

OCP asks:

```text
Will adding new report formats repeatedly
require modifying ReportGenerator?
```

So:

```text
SRP:
Does this class own multiple responsibilities
with independent reasons to change?


OCP:
For an expected dimension of variation,
can new variants be added without repeatedly
modifying stable code?
```

A class can:

```text
violate SRP only
violate OCP only
violate both
satisfy both
```

A violation of one does **not** automatically imply a violation of the other.

---

# 18. OCP vs Overengineering

OCP is not free.

Compare:

```python
if type == "regular":
    ...
elif type == "premium":
    ...
```

with:

```text
DiscountPolicy
RegularDiscount
PremiumDiscount
Factory
Registry
Dependency Injection
```

The second gives us extensibility.

But it also gives us:

```text
more abstractions
more classes
more files
more wiring
more dependencies
more indirection
```

Therefore:

```text
More extensibility
        ≠
automatically better architecture
```

The real trade-off is:

```text
Expected cost of repeatedly
modifying the current design
            VS
Cost of introducing and maintaining
the abstraction today
```

If there are three tiny, stable variations and no expected growth, an extension architecture may not be justified.

If the roadmap already contains many new variations, the balance changes.

---

# 19. Strong Signals to Apply OCP

OCP becomes increasingly valuable when:

```text
Variations are expected to grow
        +
implementations differ meaningfully
        +
implementations may evolve independently
        +
central code keeps changing
        +
those changes create regression/maintenance cost
```

Typical examples may include:

```text
Payment methods
Report formats
Notification channels
Shipping strategies
Serialization formats
Plugin implementations
```

depending on actual requirements.

---

# 20. Common Interview Traps

### "Every `if` or `switch` violates OCP."

False.

A conditional is only a concern when it represents a meaningful expected variation that keeps forcing stable code to change.

### "Existing classes should never change."

False.

Existing implementations should change when their own requirements change.

### "OCP requires inheritance."

False.

Composition, interfaces, DI, registries, plugins, configuration, and other mechanisms can support OCP.

### "More extensibility means better architecture."

False.

Extensibility introduces complexity and should solve an actual expected problem.

### "Adding a feature should modify zero existing code."

False.

Wiring, registration, configuration, or composition may legitimately change.

### "Frequently changing behavior automatically needs OCP."

False.

Distinguish between:

```text
changing existing behavior

and

adding new variations
```

---

# 21. Practical Decision Framework

When considering OCP, ask:

```text
1. What behavior varies?

2. Is this a realistic axis of future growth?

3. Will adding variants repeatedly modify stable code?

4. Do those variants evolve independently?

5. Does modifying the central code create meaningful
   maintenance or regression cost?

6. Would an extension point reduce that cost?

7. Is that benefit worth the abstraction and indirection?
```

Then:

```text
Known / likely growing variation
              ↓
Consider an extension point


Tiny / fixed / stable variation
              ↓
Keep the design simple
```

---

# 22. Final Mental Model

```text
Expected variation
       ↓
Identify axis of change
       ↓
Is meaningful growth likely?
      /              \
    NO                YES
    │                  │
    ▼                  ▼
Keep simple      Create extension point
                        │
                        ▼
                 Stable core depends
                 on that boundary
                        │
                        ▼
                  New variations
                  mostly add code
                  rather than
                  rewriting core
```

The most important senior-level question is:

> **"Is this a likely axis of change that deserves an extension point?"**

---

# 23. 30–60 Second Interview Answer

> **The Open/Closed Principle states that software entities should be open for extension but closed for modification. In practice, if I identify a dimension of behavior that's expected to keep growing, I introduce an extension point so new variations can be added without repeatedly modifying stable core code. This can be done through composition, interfaces, dependency injection, registries, or other mechanisms; it doesn't require inheritance.**
>
> **It doesn't mean existing code can never change. Wiring or registration may still change, and existing implementations should change when their requirements change. I also wouldn't apply OCP mechanically. If the variation is small, stable, and not expected to grow, the additional abstractions and indirection may cost more than they provide.**

---

# 24. Quick Recall

```text
OCP
=
Open for Extension
Closed for Modification
```

Practical meaning:

```text
Likely growing variation
        ↓
Extension point
        ↓
Protect stable core
        ↓
Add new variants mostly
through new code
```

Remember:

```text
if/elif
≠ automatically bad

inheritance
≠ required

composition
= important OCP technique

existing implementation changes
= perfectly valid when its requirement changes

new variation
→ ideally add implementation

wiring/registration
→ may still change

plugin architecture
→ can make registration extensible too

fixed/stable variation
→ may not deserve abstraction

more abstraction
≠ automatically better
```

Final trade-off:

```text
Expected cost of future repeated modification
                    VS
Cost of abstraction and indirection today
```

---

# OCP V1 — Complete

```text
SRP  ██████████ 100%
OCP  ██████████ 100%

SOLID V1: 40%

Next:
L — Liskov Substitution Principle (LSP)
```
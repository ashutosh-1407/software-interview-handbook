# Part 5 — Dependency Inversion Principle (DIP)

> **High-level modules should not depend directly on low-level implementation details. Both should depend on abstractions.**

Also:

> **Abstractions should not depend on details; details should depend on abstractions.**

A practical way to think about DIP:

> **Stable business logic should depend on stable contracts, while implementation details adapt to those contracts.**

The goal is not to remove dependencies. The goal is to keep high-level business policy from being unnecessarily coupled to details that can change independently.

---

## 1. Core Problem

Consider:

```python
class CheckoutService:
    def __init__(self):
        self.repository = MySQLOrderRepository()

    def checkout(self, order):
        ...
        self.repository.save(order)
```

Dependency:

```text
CheckoutService        ← high-level business logic
       ↓
MySQLOrderRepository   ← low-level implementation detail
```

Now suppose the application moves from:

```text
MySQL
→ DynamoDB
```

The checkout business rules did not change, but `CheckoutService` still needs modification because it directly knows about MySQL.

This is the coupling DIP tries to reduce.

---

## 2. Depend on an Abstraction

Introduce a business-facing abstraction:

```python
class OrderRepository:
    def save(self, order):
        ...
```

Implementations:

```python
class MySQLOrderRepository(OrderRepository):
    def save(self, order):
        ...


class DynamoDBOrderRepository(OrderRepository):
    def save(self, order):
        ...
```

Then:

```python
class CheckoutService:
    def __init__(self, repository: OrderRepository):
        self.repository = repository

    def checkout(self, order):
        ...
        self.repository.save(order)
```

Now:

```text
             OrderRepository
               ▲         ▲
               │         │
CheckoutService      MySQL / DynamoDB
```

Instead of:

```text
High-level
    ↓
Concrete detail
```

we have:

```text
High-level
    ↓
Abstraction
    ↑
Concrete detail
```

The high-level policy depends on the contract it needs, while the low-level implementation adapts to that contract.

---

## 3. Why Is It Called Dependency Inversion?

Initially:

```text
OrderService
    ↓
DynamoDBOrderStore
```

The business layer directly depends on the implementation detail.

After introducing:

```text
OrderRepository
```

we get:

```text
             OrderRepository
                ▲       ▲
                │       │
        OrderService   DynamoDBOrderStore
```

Now `DynamoDBOrderStore` conforms to a contract shaped around what `OrderService` needs.

Conceptually:

```text
BEFORE

Business policy
     ↓
Implementation detail


AFTER

Business policy
     ↓
Abstraction
     ↑
Implementation detail
```

That is the inversion.

> **The stable business policy defines the contract it needs; implementation details adapt to that contract.**

DIP does not eliminate dependencies. It changes the direction in which they point.

---

## 4. Abstractions Must Not Depend on Details

Creating an interface is not enough.

This is still a poor abstraction:

```python
class OrderRepository:
    def save(self, mysql_connection, order):
        ...
```

Why?

Because:

```text
mysql_connection
```

is a MySQL-specific implementation detail.

Likewise:

```python
class IOrderDatabase:
    def put_item(self, table_name, partition_key, attributes):
        ...
```

still forces high-level code to understand:

```text
tables
partition keys
attributes
```

A better abstraction is:

```python
class OrderRepository:
    def save(self, order):
        ...

    def find(self, order_id):
        ...
```

Then:

```text
OrderService
     ↓
OrderRepository
     ↑
DynamoDBOrderRepository
     ↓
table / partition key / SDK
```

The DynamoDB implementation performs that translation internally.

> **The abstraction should speak in high-level/business language, not in the language of the current implementation.**

---

## 5. Abstraction in Name Only

Suppose:

```python
class IOrderDatabase:
    def query_partition(self, partition_key):
        ...

    def put_item(self, table_name, attributes):
        ...
```

Technically:

```text
OrderService
→ depends on an interface
```

But it still has to understand database concepts.

So:

```text
Interface exists
≠
DIP automatically satisfied
```

A stronger boundary is:

```python
class OrderRepository:
    def save(self, order):
        ...

    def find(self, order_id):
        ...
```

The business layer talks about **orders**.

The low-level implementation talks about **tables, SDKs, partition keys, queries, etc.**

---

## 6. Provider Example

Without DIP:

```python
class NotificationService:
    def __init__(self):
        self.sender = SmtpEmailSender()
```

Dependency:

```text
NotificationService
       ↓
SmtpEmailSender
```

If the implementation later changes to SES or SendGrid, the high-level service may need modification.

Instead:

```python
class EmailSender:
    def send(self, recipient, subject, body):
        ...
```

Implementations:

```python
class SmtpEmailSender(EmailSender):
    ...

class SesEmailSender(EmailSender):
    ...

class SendGridEmailSender(EmailSender):
    ...
```

Then:

```python
class NotificationService:
    def __init__(self, sender: EmailSender):
        self.sender = sender
```

Now:

```text
NotificationService
       ↓
   EmailSender
    ▲   ▲   ▲
 SMTP SES SendGrid
```

`NotificationService` only depends on the behavior it actually needs.

---

## 7. Don't Leak Provider Details Through the Abstraction

This is still weak:

```python
class EmailSender:
    def send(self, smtp_message):
        ...
```

because `smtp_message` is already SMTP-specific.

Better:

```python
class EmailSender:
    def send(self, recipient, subject, body):
        ...
```

Then:

```python
class SmtpEmailSender(EmailSender):
    def send(self, recipient, subject, body):
        smtp_message = build_smtp_message(
            recipient,
            subject,
            body
        )
        ...
```

Another implementation can perform its own translation:

```python
class SesEmailSender(EmailSender):
    def send(self, recipient, subject, body):
        # translate into SES-specific request
        ...
```

So:

```text
High-level contract
→ provider-neutral

Concrete implementation
→ provider-specific translation
```

---

## 8. DIP Is Not Only About Infrastructure

Common infrastructure examples:

```text
PaymentGateway
→ Stripe / PayPal

OrderRepository
→ MySQL / DynamoDB

EmailSender
→ SMTP / SES
```

But DIP can also apply to business variations:

```text
TaxCalculator
→ USTaxCalculator
→ EUTaxCalculator
```

or:

```text
DiscountPolicy
→ RegularDiscount
→ PremiumDiscount
```

So DIP is not simply:

```text
"Abstract databases and vendor APIs."
```

The real question is:

> **Is the high-level policy unnecessarily coupled to a detail that varies or evolves independently?**

That detail may be infrastructure or business logic.

---

## 9. Don't Abstract Every Dependency

Suppose:

```text
OrderValidator

→ small
→ stable
→ one implementation
→ no expected variation
```

Creating:

```text
IOrderValidator
OrderValidatorImpl
```

may add abstraction without meaningful benefit.

Now compare:

```text
StripePaymentProcessor
→ external provider
→ PayPal planned
→ provider API evolves independently
```

Here an abstraction such as:

```text
PaymentProcessor
```

is much more useful.

A good rule:

> **Abstract when doing so removes meaningful coupling—not simply because a concrete class exists.**

---

## 10. Strong Signals for an Abstraction

An abstraction becomes more valuable when:

```text
Multiple implementations exist

Multiple implementations are expected

Dependency evolves independently

Provider/infrastructure APIs change separately

There is meaningful business-policy variation

Changing the detail would otherwise
modify stable business logic
```

Examples:

```text
Stripe / PayPal

MySQL / DynamoDB

SMTP / SES

US Tax / EU Tax

Different fraud strategies
```

These are signals, not mechanical rules.

---

## 11. Keep Volatility at the Edges

A useful consequence of DIP is:

> **Keep volatile/changeable details toward the outer edges of the system.**

Example:

```text
Stripe SDK changes
       ↓
StripePaymentGateway changes

PaymentGateway
→ ideally unchanged

CheckoutService
→ ideally unchanged
```

Likewise:

```text
DynamoDB SDK changes
       ↓
DynamoDBOrderRepository changes

OrderRepository
→ ideally unchanged

OrderService
→ ideally unchanged
```

Details such as:

```text
vendor SDKs
external APIs
databases
message brokers
infrastructure integrations
```

often change for reasons unrelated to business rules.

Good dependency boundaries contain that change rather than letting it spread upward.

---

## 12. Dependency Injection (DI)

Without DI:

```python
class NotificationService:
    def __init__(self):
        self.sender = SmtpEmailSender()
```

With DI:

```python
class NotificationService:
    def __init__(self, sender: EmailSender):
        self.sender = sender
```

Dependency Injection means:

> **The dependency is supplied from outside instead of being created internally by the object.**

This allows us to pass:

```text
SmtpEmailSender
SesEmailSender
SendGridEmailSender
FakeEmailSender
```

to the same service.

---

## 13. DI Is Not the Same as DIP

This is an important interview distinction.

Consider:

```python
class CheckoutService:
    def __init__(self, stripe: StripePaymentGateway):
        self.stripe = stripe
```

Caller:

```python
service = CheckoutService(
    StripePaymentGateway()
)
```

The dependency is passed from outside.

So:

```text
DI ✅
```

But the high-level service is still coupled directly to:

```text
StripePaymentGateway
```

So DIP has not really been achieved:

```text
CheckoutService
      ↓
StripePaymentGateway
```

Better:

```python
class CheckoutService:
    def __init__(self, gateway: PaymentGateway):
        self.gateway = gateway
```

Then:

```text
              PaymentGateway
                 ▲       ▲
                 │       │
CheckoutService      StripePaymentGateway
```

Remember:

```text
DI
→ How is the dependency provided?

DIP
→ What should the dependency point toward?
```

> **DI is commonly used to implement DIP, but DI alone does not imply DIP.**

---

## 14. Inversion of Control (IoC)

IoC is broader than DI.

Without IoC:

```python
class OrderService:
    def __init__(self):
        self.repo = DynamoDBOrderRepository()
```

The service controls dependency creation.

With control moved outward:

```python
repo = DynamoDBOrderRepository()
service = OrderService(repo)
```

Useful distinction:

```text
DIP
→ design principle

DI
→ mechanism for supplying dependencies

IoC
→ broader idea of moving control outward
```

DI is one form of IoC.

---

## 15. DI vs IoC vs DIP

Given:

```python
class CheckoutService:
    def __init__(self, stripe: StripePaymentGateway):
        self.stripe = stripe
```

and:

```python
service = CheckoutService(
    StripePaymentGateway()
)
```

we have:

```text
DI ✅
Dependency supplied from outside.

IoC ✅
CheckoutService no longer creates it itself.

DIP ❌
CheckoutService still directly depends on Stripe.
```

If instead:

```python
class CheckoutService:
    def __init__(self, gateway: PaymentGateway):
        self.gateway = gateway
```

then we have a much stronger DIP design.

---

## 16. Composition Root

Concrete implementations still have to be instantiated somewhere.

Example:

```python
gateway = StripePaymentGateway(config)
repository = MySQLOrderRepository(db)

checkout_service = CheckoutService(
    gateway,
    repository
)
```

This outer application-startup/wiring location is commonly called the **composition root**.

```text
Business logic:
"I need a PaymentGateway."

Composition root:
"For this deployment, use Stripe."
```

DIP does not mean:

```text
Nobody can ever know about concrete implementations.
```

It means:

> **Keep concrete implementation knowledge around the outer wiring boundary instead of spreading it throughout high-level business logic.**

This also facilitates deployment-specific configuration:

```text
Production
→ StripePaymentGateway

Other deployment
→ PayPalPaymentGateway

Tests
→ FakePaymentGateway
```

---

## 17. DIP and Testing

With:

```python
class OrderService:
    def __init__(self, repository: OrderRepository):
        self.repository = repository
```

a test can inject:

```python
class FakeOrderRepository(OrderRepository):
    def save(self, order):
        self.saved = order
```

The unit test can now focus on:

```text
OrderService business behavior
```

rather than:

```text
DynamoDB SDK
credentials
database setup
emulators
```

But you can still mock a concrete class like `DynamoDBOrderRepository`.

The difference is coupling:

```text
Mock DynamoDBOrderRepository
→ possible
→ test still knows DynamoDB-specific detail
```

versus:

```text
Fake OrderRepository
→ test only knows business-facing contract
```

> **Testing is a useful benefit of DIP, not the primary reason DIP exists.**

---

## 18. Where Should the Abstraction Live?

The physical folder is not the main concern.

The key question is:

> **Who conceptually shapes the contract?**

Poor:

```python
class OrderRepository:
    def put_item(self, table, partition_key):
        ...
```

Better:

```python
class OrderRepository:
    def save(self, order):
        ...

    def find(self, order_id):
        ...
```

Conceptually:

```text
Business/high-level need
→ shapes abstraction

Low-level implementation
→ adapts to abstraction
```

The interface does not have to physically live in the same package as `OrderService`.

Conceptual ownership matters more than file placement.

---

## 19. DIP vs OCP

Consider:

```text
CheckoutService
      ↓
PaymentGateway
      ↑
Stripe / PayPal
```

DIP asks:

```text
Should CheckoutService depend directly
on Stripe or on an abstraction?
```

OCP asks:

```text
Can another provider be added without
repeatedly modifying CheckoutService?
```

So:

```text
DIP
→ dependency direction

OCP
→ extension / variation
```

The same design may improve both principles for different reasons.

---

## 20. DIP vs ISP

Suppose:

```python
class PaymentGateway:
    def charge(self):
        ...

    def refund(self):
        ...

    def settlement_report(self):
        ...
```

Checkout only needs:

```text
charge()
```

DIP may be satisfied:

```text
CheckoutService
→ PaymentGateway abstraction
```

But ISP may still identify unnecessary coupling:

```text
CheckoutService also sees:
refund()
settlement_report()
```

So:

```text
DIP
→ Is the dependency pointing toward
  the right abstraction?

ISP
→ Is that abstraction appropriately
  scoped for this client?
```

Remember:

> **ISP does not require subclasses; it focuses on client dependencies.**

---

## 21. DIP vs LSP

Consider:

```text
CheckoutService
      ↓
PaymentGateway
      ↑
Stripe / PayPal
```

DIP gives us the abstraction boundary.

LSP asks:

> **Can Stripe and PayPal actually honor the `PaymentGateway` behavioral contract?**

So:

```text
DIP
→ abstraction / dependency boundary

LSP
→ substitutability behind that boundary
```

An abstraction is not useful if its implementations cannot safely honor it.

---

## 22. DIP vs SRP

Suppose `CheckoutService` contains:

```text
checkout business logic
Stripe SDK configuration
Stripe request construction
Stripe error translation
```

SRP may say:

```text
Provider integration
→ separate reason to change
```

DIP may say:

```text
CheckoutService
→ should not directly depend on Stripe details
```

A better design:

```text
CheckoutService
      ↓
PaymentGateway
      ↑
StripePaymentGateway
      ↓
Stripe SDK
```

The principles may improve the same design from different perspectives.

---

## 23. Overengineering Trap

Suppose:

```python
class Clock:
    def now(self):
        return datetime.now()
```

There is:

```text
one implementation
no expected variation
no independently evolving detail
no meaningful testing pain
```

Creating:

```text
IClock
ClockProvider
SystemClock
ClockFactory
ClockRegistry
```

just to claim DIP may make the code worse.

> **SOLID is not about maximizing abstraction.**

The goal is to reduce meaningful coupling.

---

## 24. Common DIP Smells

Things worth investigating:

```text
High-level code creates concrete provider classes

Business code understands provider-specific concepts

Vendor changes force business logic changes

Multiple concrete implementations keep appearing

Business strategies evolve independently

Abstractions contain low-level terms such as:
partition_key
table_name
smtp_message
stripe_token
```

These are indicators, not automatic violations.

---

## 25. Practical Decision Framework

When you see:

```text
HighLevelService
      ↓
ConcreteDependency
```

ask:

```text
Does this dependency evolve independently?

Are multiple implementations present or expected?

Is there infrastructure/provider variation?

Is there meaningful business-policy variation?

Would changing this detail force unrelated
high-level business logic to change?

Would an abstraction create a useful stable boundary?

Can the abstraction be expressed in business terms?

Or would it merely add unnecessary indirection?
```

If justified:

```text
High-level policy
       ↓
Business-facing abstraction
       ↑
Concrete implementation
       ↓
Implementation-specific details
```

---

## 26. Common DIP Interview Traps

```text
"Every concrete dependency needs an interface."
→ False

"DIP only applies to infrastructure."
→ False

"We use DI, therefore DIP is satisfied."
→ False

"We use interfaces, therefore DIP is satisfied."
→ False

"Nobody should instantiate concrete classes."
→ False

"DIP mainly exists for mocking."
→ False

"High-level code should have no dependencies."
→ False
```

---

## 27. Final Mental Model

```text
          HIGH-LEVEL BUSINESS POLICY
                    │
                    ▼
             STABLE ABSTRACTION
                ▲         ▲
                │         │
            Detail A    Detail B
                │         │
                ▼         ▼
            SDK / DB   SDK / API
```

The abstraction should speak high-level language:

```text
save(order)        ✅
find(order_id)     ✅
charge(payment)    ✅
send(message)      ✅
```

not implementation-specific language:

```text
put_item(table, partition_key) ❌
charge_stripe_token(...)       ❌
send_smtp_message(...)         ❌
```

---

## 28. 30–60 Second Interview Answer

> **The Dependency Inversion Principle states that high-level business logic should not depend directly on low-level implementation details; both should depend on abstractions. The abstraction itself should be shaped around high-level business needs rather than leaking details of a particular implementation.**
>
> **I wouldn't create an abstraction for every concrete dependency. I would introduce one when it removes meaningful coupling—for example, when implementations vary, evolve independently, or shouldn't force changes in otherwise stable business logic.**
>
> **Dependency Injection is different: DI is a mechanism for supplying a dependency from outside rather than constructing it internally. DI is commonly used to implement DIP, but using DI alone doesn't mean DIP is satisfied.**

---

## 29. Quick Recall

```text
DIP
=
High-level policy should not depend
directly on low-level details.

Both depend on abstractions.

Details adapt to abstractions.
```

Before:

```text
Business
   ↓
Concrete Detail
```

After:

```text
Business
   ↓
Abstraction
   ↑
Concrete Detail
```

Remember:

```text
DIP
→ dependency direction

DI
→ how dependency is supplied

IoC
→ control moved outward

Composition Root
→ where concrete implementations
  are selected and wired
```

Most important:

> **Abstract to remove meaningful coupling—not merely because a concrete class exists.**

---

# SOLID V1 — Complete ✅

```text
S — SRP → Reasons to change
O — OCP → Dimensions of variation
L — LSP → Behavioral substitutability
I — ISP → Client dependency boundaries
D — DIP → Dependency direction
```

```text
SRP  ██████████ 100%
OCP  ██████████ 100%
LSP  ██████████ 100%
ISP  ██████████ 100%
DIP  ██████████ 100%

SOLID V1: 100% ✅
```
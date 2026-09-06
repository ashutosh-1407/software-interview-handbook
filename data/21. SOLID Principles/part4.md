# Part 4 — Interface Segregation Principle (ISP)

> **Clients should not be forced to depend on methods or capabilities they do not use.**

The practical goal of ISP is to create **simple, cohesive, client-focused interfaces** that remove meaningful unnecessary coupling.

ISP does **not** mean:

```text
One method = one interface
```

and it does not mean:

```text
Smaller interface = always better
```

Instead:

> **Design interfaces around cohesive capabilities and actual client needs.**

---

# 1. Basic ISP Problem

Consider:

```python
class Printer:
    def print_document(self, document):
        ...

    def scan_document(self):
        ...

    def fax_document(self, document):
        ...
```

Now:

```python
class OfficePrinter(Printer):
    # supports everything
    ...


class BasicPrinter(Printer):
    def print_document(self, document):
        ...

    def scan_document(self):
        raise UnsupportedOperationException()

    def fax_document(self, document):
        raise UnsupportedOperationException()
```

`BasicPrinter` only supports printing, but the interface forces it to depend on:

```text
print()   ✅
scan()    ❌
fax()     ❌
```

This is an ISP problem.

A better design:

```python
class Printable:
    def print_document(self, document):
        ...


class Scannable:
    def scan_document(self):
        ...


class Faxable:
    def fax_document(self, document):
        ...
```

Then:

```text
BasicPrinter
→ Printable

OfficePrinter
→ Printable + Scannable + Faxable
```

Each implementation exposes only capabilities it can genuinely support.

---

# 2. ISP Is Not Just About Implementations

This is an important distinction.

Suppose:

```python
class OfficeMachine:
    def print(self): ...
    def scan(self): ...
    def fax(self): ...
```

`OfficeMachine` genuinely supports everything.

There is no problem with the implementation itself.

But:

```python
class PrintJob:
    def __init__(self, machine: OfficeMachine):
        self.machine = machine

    def run(self):
        self.machine.print()
```

`PrintJob` only needs:

```text
print()
```

yet depends on:

```text
OfficeMachine
├── print()    ← needed
├── scan()     ← unrelated
└── fax()      ← unrelated
```

ISP asks:

> **Why should `PrintJob` know that scanning and faxing even exist?**

Instead:

```python
class Printer:
    def print(self):
        ...
```

and:

```text
PrintJob → Printer
```

The concrete implementation may still implement:

```text
OfficeMachine
→ Printer
→ Scanner
→ FaxMachine
```

That's perfectly fine.

> **ISP protects clients from depending on unrelated capabilities, even when the implementation itself can support everything.**

---

# 3. Client-Driven Interface Design

ISP should often be considered from the **client outward**.

Suppose:

```python
class OrderOperations:
    def create_order(self):
        ...

    def cancel_order(self):
        ...

    def get_order(self):
        ...

    def generate_invoice(self):
        ...
```

Clients:

```text
CheckoutPage
→ create_order()

OrderHistoryPage
→ get_order()

AdminTool
→ cancel_order() + get_order()

BillingJob
→ generate_invoice()
```

Making every client depend on `OrderOperations` creates unnecessary coupling.

We could expose:

```python
class OrderCreator:
    def create_order(self):
        ...


class OrderReader:
    def get_order(self):
        ...


class OrderCanceller:
    def cancel_order(self):
        ...


class InvoiceGenerator:
    def generate_invoice(self):
        ...
```

Then:

```text
CheckoutPage
→ OrderCreator

OrderHistoryPage
→ OrderReader

AdminTool
→ OrderReader + OrderCanceller

BillingJob
→ InvoiceGenerator
```

The important point is not that we created four interfaces.

The important point is:

> **Each client now depends only on capabilities it actually needs.**

---

# 4. ISP Does NOT Mean One Method Per Interface

Suppose:

```text
charge()
refund()
get_payment_status()
```

Every client uses all three operations, they are conceptually cohesive, and they tend to evolve together.

There is little benefit in mechanically creating:

```text
PaymentCharger
PaymentRefunder
PaymentStatusReader
```

A cohesive interface may be better:

```python
class PaymentOperations:
    def charge(self):
        ...

    def refund(self):
        ...

    def get_payment_status(self):
        ...
```

This can satisfy ISP perfectly well.

Therefore:

> **ISP aims for client-focused, cohesive interfaces—not maximum interface fragmentation.**

A useful test:

> **Who actually benefits from this split?**

If splitting means:

```text
Clients stop depending on unrelated operations
Unrelated changes stop propagating
Implementations stop supporting irrelevant capabilities
```

then segregation has meaningful value.

If the only benefit is:

```text
"Every interface now contains one method."
```

we probably added indirection without solving a real problem.

---

# 5. Change Propagation / Blast Radius

This is one of the practical reasons ISP matters.

Suppose:

```python
class PaymentGateway:
    def charge(self, amount):
        ...

    def refund(self, transaction_id):
        ...

    def generate_settlement_report(self, date):
        ...
```

Clients:

```text
CheckoutService
→ charge()

FinanceService
→ refund()
→ generate_settlement_report()
```

Now settlement reporting evolves:

```python
generate_settlement_report(
    date,
    currency,
    region,
    format
)
```

Nothing about checkout changed.

But:

```text
Settlement requirements change
          ↓
PaymentGateway changes
          ↓
CheckoutService depends on PaymentGateway
          ↓
CheckoutService is exposed to an
unrelated interface change
```

Depending on the language, architecture, and testing approach, this can create unnecessary:

```text
mock/test updates
recompilation/rebuilding
implementation changes
API churn
dependency impact
```

Instead:

```python
class PaymentCharger:
    def charge(self, amount):
        ...


class PaymentRefundService:
    def refund(self, transaction_id):
        ...


class SettlementReporter:
    def generate_settlement_report(self, ...):
        ...
```

Then:

```text
CheckoutService
→ PaymentCharger

FinanceService
→ PaymentRefundService
→ SettlementReporter
```

Now:

```text
SettlementReporter changes
        ↓
CheckoutService unaffected
```

> **Smaller, client-focused interfaces reduce the blast radius of unrelated changes.**

---

# 6. What Does "Mock/Test Churn" Mean?

Suppose:

```python
class CustomerOperations:
    def get_customer(self):
        ...

    def update_customer(self):
        ...

    def generate_tax_report(self, year, region, format):
        ...
```

`CustomerProfilePage` only uses:

```text
get_customer()
update_customer()
```

But its tests mock the entire:

```text
CustomerOperations
```

If `generate_tax_report()` changes, mocks, test doubles, fixtures, or implementations of that large interface may require updates depending on the language/framework.

The profile functionality didn't change, but unrelated tests/dependencies may still require work.

That's **test churn**:

> **Unnecessary test maintenance caused by changes to functionality the client doesn't actually care about.**

ISP can reduce that unnecessary coupling.

---

# 7. Capability-Based Interfaces

A capability interface describes:

> **What can this dependency do?**

Examples:

```python
class OrderReader:
    def get_order(self):
        ...


class OrderCreator:
    def create_order(self):
        ...


class InvoiceGenerator:
    def generate_invoice(self):
        ...
```

These are useful when capabilities are shared across multiple clients.

Example:

```text
CheckoutPage
→ OrderCreator

OrderHistoryPage
→ OrderReader

BillingJob
→ OrderReader + InvoiceGenerator
```

`OrderReader` is reused wherever reading orders is needed.

---

# 8. Role / Client-Based Interfaces

Sometimes an interface is better modeled around what a particular client or role needs.

For example:

```python
class CheckoutPaymentGateway:
    def charge(self, amount):
        ...


class FinancePaymentGateway:
    def refund(self, transaction_id):
        ...

    def generate_settlement_report(self, date):
        ...
```

Both may be implemented by the same concrete service:

```text
PaymentGatewayImpl
→ CheckoutPaymentGateway
→ FinancePaymentGateway
```

The distinction:

```text
Capability interface
→ organized around reusable capability

Role interface
→ organized around a client's cohesive needs
```

A useful heuristic:

> **When capabilities overlap significantly between clients, capability-based interfaces can promote reuse. When a client has a distinct cohesive view with little useful overlap, a role-based interface may be cleaner.**

These approaches are not mutually exclusive.

A system can use both.

---

# 9. Mixing Capability and Role Interfaces

Consider:

```text
ProfilePage
→ get_account()
→ update_profile()

PasswordResetFlow
→ get_account()
→ reset_password()

AdminConsole
→ get_account()
→ suspend_account()

ComplianceJob
→ get_account()
→ generate_compliance_report()
```

`get_account()` is shared by everyone.

We might model:

```python
class AccountGetter:
    def get_account(self, account_id):
        ...


class ProfilePageActions(AccountGetter):
    def update_profile(self, account_id, profile):
        ...


class PasswordResetActions(AccountGetter):
    def reset_password(self, account_id):
        ...


class AdminAccountActions(AccountGetter):
    def suspend_account(self, account_id):
        ...


class ComplianceActions(AccountGetter):
    def generate_compliance_report(self, account_id):
        ...
```

Then:

```text
ProfilePage
→ ProfilePageActions
   → get_account()
   → update_profile()

PasswordResetFlow
→ PasswordResetActions
   → get_account()
   → reset_password()

AdminConsole
→ AdminAccountActions
   → get_account()
   → suspend_account()

ComplianceJob
→ ComplianceActions
   → get_account()
   → generate_compliance_report()
```

One concrete backend can still support everything.

The interfaces simply control **what each client needs to depend upon**.

---

# 10. ISP vs SRP

These principles can produce similar-looking decompositions, but they ask different questions.

The easiest distinction:

```text
SRP
→ looks inward at responsibility/change reasons

ISP
→ looks outward at what each client is forced to depend on
```

Suppose:

```python
class ReportService:
    def generate_report(self):
        ...

    def export_pdf(self):
        ...

    def export_csv(self):
        ...

    def email_report(self):
        ...
```

SRP asks:

> **Does this class contain responsibilities that evolve independently for different business reasons?**

ISP asks:

> **Do clients need all of these operations?**

Imagine:

```text
Dashboard
→ generate_report()

ExportJob
→ generate_report()
→ export_pdf()
→ export_csv()

NotificationJob
→ email_report()
```

Even if `ReportService` is internally cohesive enough that we decide it satisfies SRP, it can still expose an interface broader than individual clients need.

Therefore:

```text
SRP satisfied
≠
ISP automatically satisfied
```

A class can be cohesive while clients should still see narrower interfaces.

---

# 11. ISP vs LSP

These are also related but distinct.

Consider:

```python
class Printer:
    def print_document(self):
        ...

    def scan_document(self):
        ...


class BasicPrinter(Printer):
    def print_document(self):
        ...

    def scan_document(self):
        raise UnsupportedOperationException()
```

We can diagnose this from both principles:

```text
ISP
→ Why does Printer force BasicPrinter to depend on
  a scanning capability it doesn't support?

LSP
→ BasicPrinter claims to be a Printer but cannot
  honor Printer's scan() contract.
```

A useful distinction:

> **ISP asks whether the contract forces clients/implementations to depend on too much.**

> **LSP asks whether a subtype can actually honor the behavioral contract of its parent.**

---

# 12. ISP Violation Without LSP Violation

Suppose:

```python
class OfficeMachine:
    def print(self): ...
    def scan(self): ...
    def fax(self): ...
```

And:

```python
class EnterprisePrinter(OfficeMachine):
    # genuinely supports everything
```

There may be no LSP problem:

```text
EnterprisePrinter
→ can fully honor OfficeMachine
```

But:

```python
class PrintJob:
    def __init__(self, machine: OfficeMachine):
        ...
```

If `PrintJob` only uses:

```text
print()
```

then it may still have an ISP problem because it depends on:

```text
scan()
fax()
```

without needing them.

So:

```text
Implementation/subtype
→ LSP may be perfectly fine

Client dependency
→ ISP may still be poor
```

---

# 13. LSP Violation Without ISP Violation

The reverse is also possible.

```python
class Processor:
    def process(self, x):
        # x >= 0
        ...


class SpecialProcessor(Processor):
    def process(self, x):
        # x >= 10
        ...
```

The interface contains one focused method.

There is no meaningful ISP problem:

```text
ISP ✅
```

But the child accepts fewer inputs than the parent:

```text
Parent accepts:
0, 1, 2, 3...

Child accepts:
10, 11, 12...
```

So:

```text
LSP ❌
```

The subtype strengthened the precondition and weakened substitutability.

Remember:

```text
LSP input rule:

Child may demand LESS     ✅
Child must not demand MORE ❌
```

---

# 14. Unsupported Operations Can Signal Both ISP and LSP

Consider:

```python
class DocumentEditor:
    def read(self):
        ...

    def edit(self):
        ...


class ReadOnlyViewer(DocumentEditor):
    def read(self):
        ...

    def edit(self):
        raise UnsupportedOperationException()
```

From ISP:

```text
ReadOnlyViewer is forced to depend on/support
an edit capability it doesn't need.
```

From LSP:

```text
DocumentEditor promises edit()

ReadOnlyViewer cannot honor that contract.
```

Therefore the same design can reveal problems under multiple SOLID principles.

The principles are simply examining the design from different perspectives.

---

# 15. A Large Interface Is Not Automatically a Fat Interface

Suppose:

```python
class Database:
    def insert(self): ...
    def update(self): ...
    def delete(self): ...
    def find(self): ...
    def find_all(self): ...
    def count(self): ...
```

Six methods may look large.

But assume every client genuinely needs all six operations and they form one cohesive abstraction.

Then:

```text
6 methods
≠
automatic ISP violation
```

Likewise:

```text
2 methods
≠
automatic ISP compliance
```

ISP isn't about counting methods.

It is about **client dependency and cohesion**.

---

# 16. When NOT to Split an Interface

Suppose:

```python
class TransactionRepository:
    def save(self, transaction):
        ...

    def find(self, transaction_id):
        ...

    def delete(self, transaction_id):
        ...
```

There is one client:

```text
TransactionService
→ save()
→ find()
→ delete()
```

The operations:

```text
are used together
+
are conceptually cohesive
+
tend to evolve together
```

Splitting into:

```text
TransactionWriter
TransactionReader
TransactionDeleter
```

may add:

```text
more interfaces
more names
more wiring
more navigation
more conceptual overhead
```

without removing meaningful coupling.

So don't ask only:

> **Can I split this?**

Ask:

> **Who benefits from this split, and what meaningful coupling does it remove?**

---

# 17. ISP Design Smells

Things that should make us investigate:

### Clients use tiny subsets of a large interface

```text
Client A → method 1

Client B → methods 4 + 5

Client C → method 8
```

Potential ISP smell.

---

### Implementations throw unsupported-operation exceptions

```python
def fax(self):
    raise UnsupportedOperationException()
```

Strong smell that the interface may expose capabilities not universally applicable.

---

### Unrelated changes affect unrelated clients

```text
Tax-report API changes
        ↓
ProfilePage mocks/build/tests affected
```

Potential unnecessary coupling.

---

### Clients need broad dependencies for tiny capabilities

```text
PrintJob
→ depends on OfficeMachine

but only needs:
print()
```

Potential ISP smell.

---

### Interface exists around implementation rather than client needs

```text
"My service can do 20 things,
therefore every client gets one interface
containing all 20."
```

Potential ISP smell.

---

# 18. But These Are Smells, Not Mechanical Rules

Just as:

```text
if/else
≠ automatically OCP violation
```

and:

```text
isinstance
≠ automatically LSP violation
```

similarly:

```text
many methods
≠ automatically ISP violation
```

We need context:

```text
Who are the clients?

Which methods do they use?

Which capabilities belong together?

How do those capabilities evolve?

Does splitting remove meaningful coupling?

What complexity does segregation introduce?
```

SOLID should guide design reasoning rather than become mechanical rules.

---

# 19. Practical ISP Decision Framework

When evaluating an interface, ask:

```text
1. Who are the clients?

2. Which methods does each client actually use?

3. Are clients forced to depend on methods
   they don't need?

4. Do unrelated changes propagate to clients?

5. Are implementations forced to provide
   unsupported/irrelevant operations?

6. Which operations are naturally cohesive?

7. Which capabilities are reused across clients?

8. Are there distinct client roles?

9. Would splitting remove meaningful coupling?

10. Or would splitting merely add indirection?
```

Then choose between:

```text
Keep cohesive interface
        OR
Capability-based interfaces
        OR
Role/client-based interfaces
        OR
Combination of both
```

---

# 20. Relationship With SRP, OCP and LSP

At this point:

```text
SRP
→ Why does this entity change?
→ Are there multiple independent responsibilities?


OCP
→ What is the likely axis of variation?
→ Should it have an extension point?


LSP
→ Can this subtype safely replace its parent?
→ Does it preserve the behavioral contract?


ISP
→ What does this client actually need?
→ Is it forced to depend on unrelated capabilities?
```

A useful condensed version:

```text
SRP → reasons to change

OCP → dimensions of variation

LSP → behavioral substitutability

ISP → client dependency boundaries
```

---

# 21. Common ISP Traps

### "Every interface should contain one method."

False.

ISP wants cohesive interfaces, not maximum fragmentation.

---

### "Large interfaces violate ISP."

Not automatically.

If clients genuinely need the whole cohesive contract, the interface may be perfectly reasonable.

---

### "If an implementation supports every method, ISP cannot be violated."

False.

A client may still be unnecessarily coupled to capabilities it doesn't use.

---

### "ISP and SRP are basically the same."

False.

```text
SRP
→ responsibility/change perspective

ISP
→ client dependency perspective
```

---

### "ISP and LSP are the same because unsupported methods appear in both."

False.

```text
ISP
→ should this capability have been forced
  into this dependency/interface?

LSP
→ can this subtype honor the parent contract?
```

---

### "Splitting an interface is always safer."

False.

Over-segregation creates unnecessary indirection and complexity.

---

# 22. Final Mental Model

```text
                    INTERFACE
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
       Capability A  Capability B  Capability C
           │            │            │
           ▼            ▼            ▼
        Client A      Client B      Client C

Each client should depend only on
the capabilities it actually needs.
```

But if:

```text
A + B + C

are always used together
+
are cohesive
+
evolve together
```

then:

```text
One interface containing A + B + C
```

may be completely reasonable.

Therefore:

> **ISP is about meaningful dependency boundaries, not interface size.**

---

# 23. 30–60 Second Interview Answer

> **The Interface Segregation Principle states that clients should not be forced to depend on methods or capabilities they don't use. In practice, I design interfaces around cohesive capabilities or client roles so each client depends only on what it actually needs.**
>
> **A large interface isn't automatically wrong, but if different clients use only subsets of it, unrelated changes propagate to clients, or implementations are forced to support irrelevant operations, those are strong signals that the interface should be segregated.**
>
> **The goal isn't one method per interface or maximum fragmentation. The goal is simple, cohesive, client-focused contracts that remove meaningful unnecessary coupling.**

---

# 24. Quick Recall

```text
ISP
=
Clients should not be forced to depend
on capabilities they don't use.
```

Ask:

```text
Who is the client?

What does it actually need?

What is it unnecessarily coupled to?

Would segregation remove meaningful coupling?
```

Remember:

```text
Capability interfaces
→ reusable behavior

Role interfaces
→ cohesive client-specific view

Both can coexist.
```

And:

```text
Large interface
≠ automatically bad

Small interface
≠ automatically good

One method per interface
≠ ISP

Concrete implementation supporting everything
≠ every client should depend on everything
```

Most important:

> **Design interfaces around actual client needs and cohesive capabilities—not around the complete set of methods a concrete implementation happens to support.**

---

# ISP V1 — Complete

```text
SRP  ██████████ 100%
OCP  ██████████ 100%
LSP  ██████████ 100%
ISP  ██████████ 100%

SOLID V1: 80%

Next:
D — Dependency Inversion Principle (DIP)
```
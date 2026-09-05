# Part 3 — Liskov Substitution Principle (LSP)

> **A subtype should be substitutable wherever its parent type is expected without breaking the caller's expectations.**

The easiest mental model:

> **A child should give the caller at least the same guarantees as the parent, or more — never fewer.**

Matching the parent's methods and signatures is only the surface. LSP is about preserving the **behavioral contract** of the parent.

---

# 1. Core Mental Model

If:

```text
B is a subtype of A
```

then:

```text
Anywhere the system expects A,
I should be able to provide B
without surprising or breaking the caller.
```

Consider:

```python
class Bird:
    def fly(self):
        ...

class Sparrow(Bird):
    def fly(self):
        print("Flying")

class Penguin(Bird):
    def fly(self):
        raise Exception("Penguins cannot fly")
```

Existing code:

```python
def make_bird_fly(bird: Bird):
    bird.fly()
```

`Sparrow` works, but `Penguin` doesn't.

The issue is that this particular `Bird` abstraction promises:

```text
Bird
→ supports fly()
```

`Penguin` cannot honor that contract.

```text
Penguin IS-A Bird in the real world
            ≠
Penguin is necessarily a valid subtype
of this Bird abstraction
```

> **Inheritance requires behavioral substitutability, not merely a real-world "IS-A" relationship.**

A better model might separate `Bird` from the capability to fly.

---

# 2. Method Compatibility Is Not Enough

Consider:

```python
class FileStorage:
    def save(self, data):
        ...

    def delete(self, file_id):
        ...


class ReadOnlyStorage(FileStorage):
    def save(self, data):
        raise UnsupportedOperationException()

    def delete(self, file_id):
        raise UnsupportedOperationException()
```

`ReadOnlyStorage` technically has the methods.

But callers expecting `FileStorage` expect:

```text
save()   → supported
delete() → supported
```

The subtype cannot provide those guarantees.

Therefore:

```text
Same methods/signatures
        ≠
LSP compliance
```

LSP cares about what those methods **actually promise and do**.

---

# 3. Think in Terms of Guarantees

Our main LSP shortcut:

> **A child should give the caller at least the same guarantees as the parent, or more — never fewer.**

Those guarantees can include:

```text
Valid inputs
Outputs
Failure modes / exceptions
State invariants
Side effects
Observable behavior
```

A subtype that weakens the parent's behavioral guarantees is not safely substitutable.

---

# 4. Preconditions — What the Caller Must Provide

A **precondition** is a requirement the caller must satisfy before invoking an operation.

Parent:

```python
class PaymentProcessor:
    def process(self, amount):
        # amount must be > 0
        ...
```

The caller knows:

```python
processor.process(50)
```

is valid.

Now:

```python
class PremiumCardProcessor(PaymentProcessor):
    def process(self, amount):
        if amount < 100:
            raise ValueError()

        ...
```

The child requires:

```text
amount >= 100
```

while the parent only required:

```text
amount > 0
```

So:

```text
50

Parent → accepts ✅
Child  → rejects ❌
```

The child accepts **fewer valid inputs**, so it violates LSP.

### Can the child accept more?

Yes.

Suppose:

```text
Parent accepts:
amount > 0

Child accepts:
amount > -10
```

Everything valid for the parent is still valid for the child.

The child simply supports additional inputs.

So:

```text
INPUTS

Child accepts SAME inputs       ✅
Child accepts MORE inputs       ✅
Child accepts FEWER inputs      ❌
```

Formal terminology:

> **A subtype must not strengthen the parent's preconditions.**

But the easier mental model is:

> **Don't make the caller provide more than the parent required.**

---

# 5. Postconditions — What the Method Promises Back

A **postcondition** is something the operation guarantees after execution.

Suppose:

```python
class Calculator:
    def calculate(self):
        # returns a number >= 0
        ...
```

The caller can rely on:

```python
result = calculator.calculate()

assert result >= 0
```

Now suppose a subtype guarantees:

```text
result >= 10
```

That's fine.

```text
Parent promises: >= 0
Child promises:  >= 10
```

Everything the child returns still satisfies the parent's promise.

The child provides a **stronger guarantee**. ✅

Now suppose another child only guarantees:

```text
result >= -10
```

It could return:

```text
-7
```

But the caller was promised:

```text
result >= 0
```

So the child weakened the guarantee. ❌

Therefore:

```text
OUTPUT GUARANTEES

Same guarantee       ✅
Stronger guarantee   ✅
Weaker guarantee     ❌
```

Formal terminology:

> **A subtype must not weaken the parent's postconditions.**

Easy version:

> **Don't give the caller less than the parent promised.**

---

# 6. The Precondition/Postcondition Shortcut

Instead of memorizing confusing terminology:

```text
PRECONDITION
→ what caller must provide

Child can accept MORE inputs
but shouldn't accept FEWER.


POSTCONDITION
→ what implementation promises back

Child can promise MORE
but shouldn't promise LESS.
```

Or simply:

> **The replacement shouldn't make the caller work harder or give the caller less.**

---

# 7. Exceptions Are Part of the Contract

Suppose:

```python
class PaymentProcessor:
    def process(self, amount):
        """
        May raise PaymentFailedException.
        """
```

Caller:

```python
try:
    processor.process(100)
except PaymentFailedException:
    retry_payment()
```

Now:

```python
class BankTransferProcessor(PaymentProcessor):
    def process(self, amount):
        if bank_unavailable:
            raise ConnectionError()

        ...
```

If `ConnectionError` isn't covered by the parent contract:

```text
Parent:
success OR PaymentFailedException

Child:
success OR PaymentFailedException OR ConnectionError
```

the caller now encounters a failure mode it wasn't required to handle.

That's an LSP violation.

### Narrower exception types can be fine

Suppose:

```text
Parent allows:
ParseError

Child throws:
JsonParseError extends ParseError
```

That's compatible because callers prepared for `ParseError` can handle `JsonParseError`.

So:

> **A subtype shouldn't introduce unrelated failure modes outside the parent's contract.**

---

# 8. Preserve Parent Invariants

An **invariant** is a state guarantee that should remain true.

Example:

```python
class Inventory:
    def reserve(self, quantity):
        """
        quantity > 0
        stock must never become negative.
        """
```

The parent guarantees:

```text
stock >= 0
```

Now:

```python
class BackorderInventory(Inventory):
    def reserve(self, quantity):
        self.stock -= quantity
        # stock may become negative
```

The child can produce:

```text
stock = -5
```

It therefore breaks a parent invariant.

Even though **backordering is a valid business feature**, that does not make this inheritance relationship valid.

```text
Valid business concept
        ≠
Valid subtype
```

The important question is whether the child can satisfy the contract of the abstraction it inherits from.

---

# 9. Composition Does Not Magically Fix a Bad Contract

We could model reservation behavior as a policy:

```python
class ReservationPolicy:
    def can_reserve(self, stock, quantity):
        ...


class AvailableStockOnly(ReservationPolicy):
    def can_reserve(self, stock, quantity):
        return quantity <= stock


class AllowBackorder(ReservationPolicy):
    def can_reserve(self, stock, quantity):
        return True
```

Then:

```text
Inventory
   │
   │ HAS-A
   ▼
ReservationPolicy
   ▲
   ├── AvailableStockOnly
   └── AllowBackorder
```

But there is an important caveat.

If `Inventory` still universally promises:

```text
stock >= 0
```

then:

```text
Inventory + AllowBackorder
```

still breaks that contract.

So:

> **You cannot fix an incompatible behavioral contract merely by replacing inheritance with composition.**

The abstraction itself must accurately describe what all valid configurations can guarantee.

---

# 10. Observable Behavioral Semantics

**Observable behavioral semantics** means:

> **How the object behaves from the caller's point of view — behavior the caller can observe and rely on.**

This is deeper than method signatures.

## Rectangle / Square

```python
class Rectangle:
    def set_width(self, width):
        self.width = width

    def set_height(self, height):
        self.height = height
```

Caller:

```python
rectangle.set_width(5)
rectangle.set_height(4)

assert rectangle.area() == 20
```

Now:

```python
class Square(Rectangle):

    def set_width(self, width):
        self.width = width
        self.height = width

    def set_height(self, height):
        self.width = height
        self.height = height
```

Substitution:

```text
set_width(5)
→ 5 × 5

set_height(4)
→ 4 × 4

area = 16
```

The method signatures are correct, but the observable behavior changed.

The `Rectangle` abstraction allowed width and height to change independently. `Square` does not.

Therefore this mutable `Square → Rectangle` hierarchy violates LSP.

---

# 11. SortedList Example

Suppose:

```python
class List:
    def add(self, item):
        # Adds item to the end
        ...
```

Caller:

```python
items.add(5)
items.add(1)
```

Parent contract produces:

```text
[5, 1]
```

Now:

```python
class SortedList(List):
    def add(self, item):
        # adds item and automatically sorts
```

The same calls produce:

```text
[1, 5]
```

The subtype didn't remove a method or change its signature.

But it changed behavior the caller was allowed to rely on.

So under this specific `List` contract:

```text
SortedList
→ not safely substitutable
```

---

# 12. Side Effects Are Part of the Contract

Suppose:

```python
class UserRepository:
    def find(self, user_id):
        """
        Returns the user.
        Does NOT modify or delete stored data.
        """
```

Child:

```python
class OneTimeUserRepository(UserRepository):
    def find(self, user_id):
        user = self.load(user_id)
        self.delete(user_id)
        return user
```

Both return the same user.

But:

```text
Parent:
find()
→ returns user
→ data remains unchanged

Child:
find()
→ returns user
→ deletes user
```

The child introduced an incompatible observable side effect.

Therefore it violates LSP.

Important:

```text
LSP does NOT mean
"children cannot have side effects."

It means
"children shouldn't introduce side effects
that violate the parent's behavioral contract."
```

---

# 13. Caller-Specific Subtype Handling Is an LSP Smell

Suppose:

```python
class NotificationSender:
    def send(self, message):
        ...

class EmailSender(NotificationSender):
    ...

class SmsSender(NotificationSender):
    ...

class ScheduledSender(NotificationSender):
    """
    schedule() must be called before send()
    """
```

Caller:

```python
def notify(sender: NotificationSender, message):

    if isinstance(sender, ScheduledSender):
        sender.schedule()

    sender.send(message)
```

The `isinstance` itself is **not automatically an LSP violation**.

It is a smell.

The deeper problem is:

```text
NotificationSender:
send() is enough

ScheduledSender:
schedule() first
then send()
```

The child added an extra requirement.

Now generic caller code has to compensate for the subtype.

Useful heuristic:

> **If generic code keeps asking "what subtype are you?" just to use the object correctly, investigate the hierarchy for an LSP problem.**

Just like:

```text
if/else ≠ automatically OCP violation

isinstance ≠ automatically LSP violation
```

Context matters.

---

# 14. Unsupported Operations

A classic LSP smell:

```python
class FileStorage:
    def save(self, data):
        ...

class ReadOnlyStorage(FileStorage):
    def save(self, data):
        raise UnsupportedOperationException()
```

The subtype technically implements the method.

But:

```text
Parent:
save() is supported

Child:
save() exists but cannot actually be used
```

This weakens the parent's behavioral guarantee.

The fix is often to reconsider the abstraction rather than merely throwing an exception.

---

# 15. Returning Special Values Can Also Violate LSP

Exceptions aren't required for an LSP violation.

Parent:

```python
class Exporter:
    def export(self, data):
        """
        Returns a valid file path after export.
        """
```

Child:

```python
class AsyncExporter(Exporter):
    def export(self, data):
        start_background_job(data)
        return None
```

Caller:

```python
path = exporter.export(data)
upload(path)
```

Parent promised:

```text
valid file path
```

Child returns:

```text
None
```

So the child weakened the return guarantee.

The fact that asynchronous exporting is valid functionality doesn't mean it's a valid subtype of **this particular `Exporter` contract**.

---

# 16. How to Fix Broken Hierarchies

When a subtype can't honor the parent's contract, don't immediately force it to implement unsupported behavior.

Ask:

> **What is the strongest abstraction whose contract every subtype can genuinely satisfy?**

## Split capabilities

Instead of:

```text
FileStorage
 ├── read()
 ├── save()
 └── delete()
       ↑
 ReadOnlyStorage
```

consider:

```python
class ReadableStorage:
    def read(self, file_id):
        ...


class WritableStorage:
    def save(self, data):
        ...

    def delete(self, file_id):
        ...
```

Then:

```text
ReadOnlyStorage
→ ReadableStorage

LocalStorage
→ ReadableStorage + WritableStorage
```

Code that needs reading:

```python
def display(storage: ReadableStorage):
    ...
```

Code that needs writing:

```python
def upload(storage: WritableStorage):
    ...
```

Now the design expresses the actual capabilities instead of forcing every object into one oversized contract.

This idea will connect strongly with **Interface Segregation Principle (ISP)** later.

---

# 17. Bonus Eligibility Example

Suppose:

```python
class Employee:
    def calculate_bonus(self):
        """Returns the employee's annual bonus."""
        ...


class FullTimeEmployee(Employee):
    def calculate_bonus(self):
        return self.salary * 0.10


class Contractor(Employee):
    def calculate_bonus(self):
        raise UnsupportedOperationException()
```

The issue is:

```text
Employee exposes calculate_bonus()

Contractor inherits that contract
but cannot support the operation
```

A possible redesign is to separate bonus eligibility:

```python
class Employee:
    ...


class BonusEligible:
    def calculate_bonus(self):
        ...


class FullTimeEmployee(Employee, BonusEligible):
    def calculate_bonus(self):
        return self.salary * 0.10


class Contractor(Employee):
    ...
```

Then:

```python
def pay_bonus(employee: BonusEligible):
    bonus = employee.calculate_bonus()
```

A contractor cannot accidentally be passed to code requiring bonus capability.

Important design lesson:

> **Don't put a capability in the parent unless every subtype can honestly support that capability.**

---

# 18. LSP Violation Checklist + Examples

These are common ways LSP violations appear.

### 1. Unsupported operation

```text
Parent:
FileStorage.save() is supported

Child:
ReadOnlyStorage.save()
→ UnsupportedOperationException
```

### 2. Unexpected exception

```text
Parent:
may throw ParseError

Child:
throws unrelated NetworkError
```

The caller wasn't required to handle that failure mode.

### 3. Weaker return guarantee

```text
Parent:
returns >= 10 results

Child:
returns >= 5 results
```

Or:

```text
Parent:
returns valid file path

Child:
returns None
```

### 4. Stronger input requirement

```text
Parent:
amount > 0

Child:
amount >= 100
```

The child accepts fewer inputs than the parent.

### 5. Broken invariant

```text
Parent:
stock always >= 0

Child:
allows stock = -5
```

### 6. Unexpected side effect

```text
Parent:
find() reads without modifying storage

Child:
find() reads AND deletes
```

### 7. Changed observable behavior

```text
Rectangle:
setWidth(5)
setHeight(4)
→ area = 20

Square subtype:
same operations
→ area = 16
```

### 8. Caller needs subtype-specific handling

```python
if isinstance(sender, ScheduledSender):
    sender.schedule()

sender.send(message)
```

The caller must know about a specific subtype to use it correctly.

This is a strong smell that the hierarchy deserves investigation.

---

# 19. Adding Behavior Isn't Automatically a Violation

Suppose:

```python
class Logger:
    def log(self, message):
        """Writes the message to the log."""
```

Child:

```python
class TimestampLogger(Logger):
    def log(self, message):
        # writes message with timestamp
```

If the parent does **not** promise an exact output format and only guarantees that the message gets logged, adding a timestamp does not automatically violate LSP.

The child still provides the parent's guarantee.

This is why we evaluate:

```text
Parent's actual contract
```

not:

```text
"Does the child behave identically?"
```

LSP requires **compatible behavior**, not identical implementations.

---

# 20. Common LSP Traps

### "The child implements every parent method, so LSP is satisfied."

False.

Behavior matters, not just signatures.

---

### "The child behaves differently, so it violates LSP."

False.

Different behavior is allowed if the parent contract remains satisfied.

---

### "A subtype cannot throw exceptions."

False.

Its failure behavior simply needs to remain compatible with the parent's contract.

---

### "A child cannot accept more inputs."

False.

Accepting additional inputs doesn't break callers using the parent contract.

---

### "A child cannot provide stronger guarantees."

False.

Stronger guarantees are generally fine.

---

### "An `isinstance` check proves an LSP violation."

False.

It's a smell when subtype-specific handling is required to use the object correctly.

---

### "If X IS-A Y in the real world, inheritance is appropriate."

False.

```text
Real-world IS-A
       ≠
automatic software subtype
```

Behavioral substitutability is what matters.

---

# 21. Practical Decision Framework

When evaluating:

```text
Child extends Parent
```

ask:

```text
Can existing caller code receive Child
instead of Parent without breaking
its legitimate expectations?
```

Check:

```text
1. Does child support the operations
   promised by parent?

2. Does child accept all inputs
   valid for parent?

3. Does child preserve or strengthen
   output guarantees?

4. Are its failure modes compatible?

5. Does it preserve parent invariants?

6. Are its side effects compatible?

7. Does observable behavior still satisfy
   the parent's contract?

8. Does generic caller code need
   subtype-specific handling?
```

If the caller must understand:

```text
"Normally Parent behaves like X,
except when it's ChildY..."
```

investigate the abstraction.

---

# 22. Relationship With SRP and OCP

The three principles we've studied answer different questions:

```text
SRP
→ Does this entity have multiple independent
  reasons to change?


OCP
→ Is there a likely growing axis of variation
  that deserves an extension point?


LSP
→ Can implementations/subtypes behind that
  abstraction actually substitute for it
  without breaking its behavioral contract?
```

They often work together.

For example, OCP might lead us to:

```text
PaymentProcessor
       ↓
PaymentMethod
       ↑
Card / PayPal / BankTransfer
```

LSP then asks:

> **Can every `PaymentMethod` genuinely honor the `PaymentMethod` contract?**

An abstraction isn't useful merely because we created it.

Its implementations must actually be substitutable.

---

# 23. Final Mental Model

```text
                 Parent Contract
                       │
                       ▼
              What can caller rely on?
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
      Inputs         Outputs       Behavior
        │              │              │
        ▼              ▼              ▼
Child accepts     Child promises    Exceptions
same or more      same or more      Invariants
                                   Side effects
                                   Semantics
                       │
                       ▼
               Caller can substitute
                  Child for Parent
                       │
                      YES
                       │
                       ▼
                    LSP ✅
```

The simplest memory rule:

> **A child should give the caller at least the same guarantees as the parent, or more — never fewer.**

And:

> **LSP is about behavioral compatibility, not just method/signature compatibility.**

---

# 24. 30–60 Second Interview Answer

> **The Liskov Substitution Principle means a subtype should be substitutable wherever its parent type is expected without breaking the caller's expectations.**
>
> **The child should provide at least the same guarantees as the parent, or stronger — never weaker. Matching method signatures is only the surface; the subtype must preserve the parent's behavioral contract around valid inputs, outputs, failure modes, invariants, side effects, and observable behavior.**
>
> **If the subtype weakens any of those guarantees, it violates LSP. And if generic caller code needs subtype-specific knowledge or handling just to use the object correctly, that's a strong LSP smell and I would investigate the hierarchy.**

---

# 25. Quick Recall

```text
LSP
=
Child can replace Parent
without breaking caller expectations
```

Anchor:

```text
Child should give
AT LEAST the same guarantees
as Parent

or MORE

NEVER LESS
```

Remember:

```text
Inputs
→ child may accept MORE
→ not FEWER

Outputs
→ child may guarantee MORE
→ not LESS

Exceptions
→ no incompatible/unexpected failure modes

Invariants
→ preserve them

Side effects
→ remain compatible

Observable behavior
→ preserve parent's semantics

Subtype-specific caller handling
→ LSP smell
```

And:

```text
Same method signature
≠ same behavioral contract

Real-world IS-A
≠ automatically valid inheritance

Valid business behavior
≠ automatically valid subtype

Composition
≠ magically fixes a bad contract
```

When LSP breaks:

```text
Reconsider the parent contract
        OR
Split capabilities/abstractions
        OR
Use composition where appropriate
        OR
Remove the incorrect inheritance relationship
```

---

# LSP V1 — Complete

```text
SRP  ██████████ 100%
OCP  ██████████ 100%
LSP  ██████████ 100%

SOLID V1: 60%

Next:
I — Interface Segregation Principle (ISP)
```
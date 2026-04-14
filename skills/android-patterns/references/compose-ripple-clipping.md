# Compose — Ripple Clipping on Rounded / Shaped Clickables

In Jetpack Compose, a `.clickable` modifier draws a ripple the size of its layout bounds by default. If the element has rounded corners, the ripple spills past them unless the element is **clipped** before the click.

## Core principle

> **Use `Modifier.clip(shape)` to constrain the ripple.** `clip` crops everything drawn after it, including the ripple. `background(color, shape)` only paints a shaped background — it does not clip, so it does not constrain the ripple.

---

## Correct usage

### Filled clickable with rounded corners

```kotlin
Box(
    modifier = Modifier
        .clip(RoundedCornerShape(16.dp))
        .background(backgroundColor)
        .clickable(onClick = onClick),
)
```

### Outlined (no fill) clickable with rounded corners

```kotlin
Box(
    modifier = Modifier
        .clip(RoundedCornerShape(8.dp))
        .border(1.dp, borderColor, RoundedCornerShape(8.dp))
        .clickable(onClick = onClick),
)
```

### Circular button

```kotlin
Box(
    modifier = Modifier
        .clip(CircleShape)
        .background(backgroundColor)
        .clickable(onClick = onClick),
)
```

---

## The common mistake

```kotlin
// ❌ Ripple is rectangular, ignoring the rounded corners
Box(
    modifier = Modifier
        .background(backgroundColor, RoundedCornerShape(16.dp))
        .clickable(onClick = onClick),
)
```

`.background(color, shape)` paints a rounded background, but the layout bounds are still a rectangle and nothing clips the ripple. The ripple renders as a rectangle that overflows the visual corners.

---

## Quick reference

| Modifier order | Ripple shape |
|---|---|
| `.clip(shape).background(color).clickable()` | Follows shape |
| `.clip(shape).clickable()` | Follows shape |
| `.background(color, shape).clickable()` | Rectangular (incorrect) |

---

## `Card` and `Surface`

`Card` and `Surface` accept a `shape` parameter. The **clickable overloads** (`Surface(onClick = ...)`, `Card(onClick = ...)`) already clip children and ripple to that `shape`. The **non-clickable forms** (`Card { ... }`, `Surface { ... }`) do not clip children — so if you attach your own `Modifier.clickable` to a non-clickable `Card`/`Surface`, the ripple will ignore `shape` unless you also add `Modifier.clip(...)`:

```kotlin
Card(
    modifier = Modifier
        .clip(RoundedCornerShape(12.dp))
        .clickable(onClick = onClick),
    shape = RoundedCornerShape(12.dp),
) {
    // content
}
```

The `shape` on `Card` gives the card its outline; `clip` on the modifier chain ensures the ripple (drawn by `clickable`) is bounded by that same shape.

Note: Material3 also ships a `Card(onClick = ...)` overload that clips the ripple to the card's `shape` automatically. The manual `clip + clickable` pattern above is only needed when wiring `clickable` onto the parameter-less `Card { ... }` form.

# SwipeToDismissBox — Transparent Content Bleeds Background

`SwipeToDismissBox` renders a background layer (typically a red "delete" indicator) behind the foreground content. When the foreground content has any transparency — for example, an archived card drawn at `alpha = 0.7f` — the background bleeds through and is visible even before the user swipes.

```kotlin
// Problem: the archive card is 0.7 alpha, so the red "delete" background
// shows through permanently, not only while swiping.
SwipeToDismissBox(
    state = dismissState,
    backgroundContent = { /* red background + trash icon */ },
) {
    InventoryCard(
        modifier = Modifier.alpha(0.7f),  // archived state
    )
}
```

## Solution

> **Wrap the translucent content in an opaque container.** An outer `Box` with an opaque background sits between the swipe indicator and the translucent card, blocking the bleed-through while keeping the card's alpha effect intact.

```kotlin
SwipeToDismissBox(
    state = dismissState,
    backgroundContent = {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.error)
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.CenterEnd,
        ) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onError,
            )
        }
    },
) {
    // Opaque wrapper blocks the background from showing through the alpha card
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.background,
                shape = RoundedCornerShape(12.dp),
            ),
    ) {
        InventoryCard(
            modifier = Modifier.alpha(if (isArchived) 0.7f else 1f),
        )
    }
}
```

### Why it works

1. **Outer `Box` background** uses `MaterialTheme.colorScheme.background` so it matches the screen behind it — visually invisible when nothing is swiping.
2. **Matching rounded corners** on the wrapper mean no background corner pokes out past the card.
3. **Inner alpha** on the card is unaffected: it fades the card's own contents against the opaque wrapper, not against the dismiss indicator.

---

## The tempting but wrong fix: read `dismissDirection`

```kotlin
// ❌ There is a lag — at the first frame of a swipe, dismissDirection is
//    still Settled, and the background briefly flashes through.
val isBeingSwiped = dismissState.dismissDirection != SwipeToDismissBoxValue.Settled

SwipeToDismissBox(/* ... */) {
    InventoryCard(
        modifier = Modifier.alpha(
            if (isArchived && !isBeingSwiped) 0.7f else 1f
        ),
    )
}
```

The state update lags the gesture by at least one frame, so you still see a visible flash at the start of every swipe. The opaque-wrapper approach has no such timing window.

---

## Quick reference

| Foreground content | Handling |
|---|---|
| Has any alpha (e.g. archived / disabled state) | Wrap in an opaque `Box` |
| Fully opaque | No special handling needed |
| Transparent background (e.g. plain text over screen background) | Wrap in an opaque `Box` |

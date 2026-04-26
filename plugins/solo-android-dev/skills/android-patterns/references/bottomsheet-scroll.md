# ModalBottomSheet — Scroll Jitter at the Top

## The problem

When a `ModalBottomSheet` contains a scrollable child (`Modifier.verticalScroll(...)` or `LazyColumn`), flinging the content up to the top causes visible **jitter**: the remaining **fling velocity** propagates through the nested-scroll chain to the sheet's own drag gesture, which starts to react mid-fling.

Switching from `Column + verticalScroll` to `LazyColumn` does **not** fix this on its own — both participate in the same nested-scroll chain.

## Two fixes

### Fix 1: Intercept overscroll with a `NestedScrollConnection` (recommended)

Wrap the scrollable content in a `Modifier.nestedScroll(...)` that consumes the leftover **fling velocity** once the inner scroller reaches its bounds, so the velocity does not leak into the sheet drag gesture. Critically, we only override `onPostFling` — we do **not** touch `onPostScroll`, so normal scroll deltas still propagate and swipe-down-to-dismiss continues to work when the user drags from inside the scrollable content.

**Pros**: genuinely keeps swipe-to-dismiss working (scroll deltas propagate), no structural change to the content.
**Applies to**: any scroll-inside-sheet case, both `verticalScroll` and `LazyColumn`.

**Why this works**: the jitter is caused by the fling **velocity** leaking past the inner scroller's boundary into the sheet's drag gesture — not by scroll deltas. Consuming only the post-fling velocity kills the jitter without blocking intentional drag-to-dismiss gestures that originate inside the scroll area.

```kotlin
// Consume only the leftover fling velocity at the inner scroller's boundary,
// so it doesn't propagate into the bottom sheet's drag gesture (which is
// what causes the jitter). We deliberately do NOT override onPostScroll,
// so scroll deltas still propagate and swipe-down-to-dismiss works when the
// user drags from inside the scrollable content.
val consumeOverscrollConnection = remember {
    object : NestedScrollConnection {
        override suspend fun onPostFling(
            consumed: Velocity,
            available: Velocity,
        ): Velocity = available  // consume leftover fling velocity at boundary
    }
}

ModalBottomSheet(
    onDismissRequest = { /* ... */ },
    sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    dragHandle = { BottomSheetDefaults.DragHandle() },
    containerColor = MaterialTheme.colorScheme.background,
) {
    Box(
        modifier = Modifier
            .heightIn(max = maxSheetHeight)
            .nestedScroll(consumeOverscrollConnection),  // wrap the scroller
    ) {
        // Content can be Column + verticalScroll, LazyColumn, or Scaffold + LazyColumn
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            // ...
        }
    }
}
```

### Fix 2: Disable swipe-to-dismiss entirely

Eliminate the conflict at its source by turning off the sheet's drag gesture.

**Pros**: absolute — jitter is impossible.
**Cons**: user cannot swipe down to dismiss, so you must provide an explicit close button.
**Applies to**: edit-mode sheets where swipe-down would risk data loss.

```kotlin
ModalBottomSheet(
    onDismissRequest = { /* ... */ },
    sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { it != SheetValue.Hidden },  // block swipe-to-dismiss
    ),
    dragHandle = null,  // remove drag handle to match the disabled gesture
    containerColor = MaterialTheme.colorScheme.background,
) { /* ... */ }
```

## Choosing between them

| Situation | Pick |
|---|---|
| Browse-style sheet (detail, info) | Fix 1 |
| Edit-style sheet (forms, unsaved state) | Fix 2 |
| Already using `LazyColumn` but still jittering | Fix 1 (`LazyColumn` is not a cure on its own) |

## Height control

`skipPartiallyExpanded = true` defaults to full height. To cap the sheet, apply `heightIn(max)` to the **content `Box`**, not to the `ModalBottomSheet` modifier:

```kotlin
val maxSheetHeight = (LocalConfiguration.current.screenHeightDp * 0.8f).dp

ModalBottomSheet(sheetState = sheetState, /* ... */) {
    Box(
        modifier = Modifier
            .heightIn(max = maxSheetHeight)
            .nestedScroll(consumeOverscrollConnection),
    ) {
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            // content
        }
    }
}
```

`Modifier.fillMaxHeight(0.8f)` applied to the sheet itself leaves a transparent 20% gap at the bottom — don't use it. The 80% threshold also matters: **above ~85%** the sheet triggers the full-screen animation path (it opens rounded and then snaps to edges), which looks broken.

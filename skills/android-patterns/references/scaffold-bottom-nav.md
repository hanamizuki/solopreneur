# Scaffold + Bottom Navigation + Status Bar Insets

A layout recipe for an edge-to-edge Compose app with a root `Scaffold` holding a `NavigationBar`, where inner screens may be tabs (no `TopAppBar`) or child pages (with `TopAppBar`).

## Insets responsibility model

```
MainScreen Scaffold
├── Owns: bottom padding (the NavigationBar)
├── Does NOT own: top padding (status bar)
│
├── Tab screens (no TopAppBar)
│   └── Apply statusBarsPadding() themselves
│
└── Child pages (with TopAppBar)
    └── Let TopAppBar consume the status-bar insets
```

**Core principle:** each inner screen handles its own status-bar insets. The root `Scaffold` only handles the bottom navigation bar.

### Why this layout?

`enableEdgeToEdge()` makes the status bar transparent so content renders behind it. If the root `Scaffold` absorbs the status-bar inset and applies it as padding, the status-bar region fills with the root container's background color — which usually differs from the inner `TopAppBar`'s `surface` color, producing a visible color seam.

By pushing status-bar handling down to each screen, a child page's `TopAppBar` can extend seamlessly behind the status bar with the correct tint.

---

## Root `Scaffold`

The root must set `contentWindowInsets = WindowInsets(0, 0, 0, 0)`. Otherwise the `Scaffold` consumes the status-bar insets up the tree, and every inner `statusBarsPadding()` or `TopAppBarDefaults.windowInsets` silently becomes zero.

```kotlin
Scaffold(
    // Critical: don't consume status-bar insets here — let child screens handle them.
    contentWindowInsets = WindowInsets(0, 0, 0, 0),
    bottomBar = { NavigationBar(/* ... */) },
) { paddingValues ->
    // Only apply the bottom (nav bar) padding; each screen owns its top.
    Box(modifier = Modifier.padding(bottom = paddingValues.calculateBottomPadding())) {
        when (currentTab) {
            "home"      -> HomeScreen(/* ... */)
            "dashboard" -> DashboardScreen(/* ... */)
            "report"    -> ReportScreen(/* ... */)
            "settings"  -> SettingsScreen(/* ... */)
        }
    }
}
```

---

## Tab screens (no `TopAppBar`)

Apply `statusBarsPadding()` to the root modifier of the screen:

```kotlin
// Home tab
PullToRefreshBox(
    modifier = Modifier
        .statusBarsPadding()
        .fillMaxSize(),
) { /* ... */ }

// Dashboard tab
Box(
    modifier = Modifier
        .statusBarsPadding()
        .fillMaxSize(),
) { /* ... */ }

// Settings tab (scrollable)
Column(
    modifier = Modifier
        .statusBarsPadding()
        .fillMaxSize()
        .verticalScroll(rememberScrollState()),
) { /* ... */ }
```

---

## Child pages (with `TopAppBar`)

### Case A: supports both full-screen and bottom-sheet presentation

When the same screen can open full-screen *or* inside a `ModalBottomSheet`, take a `showTopBar: Boolean` parameter. Full-screen delegates status-bar insets to the `TopAppBar`; bottom-sheet zeroes them out (a sheet doesn't need status-bar padding).

```kotlin
@Composable
fun SomeManagementScreen(
    onBack: () -> Unit,
    showTopBar: Boolean = true,
) {
    BackHandler(enabled = showTopBar, onBack = onBack)

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.screen_title)) },
                navigationIcon = if (showTopBar) {
                    { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } }
                } else {
                    {}
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = if (showTopBar) {
                        MaterialTheme.colorScheme.surface
                    } else {
                        Color.Transparent
                    },
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
                // Full-screen: extend behind the status bar via TopAppBar insets.
                // Bottom-sheet: zero insets (sheet has no status bar to worry about).
                windowInsets = if (showTopBar) {
                    TopAppBarDefaults.windowInsets
                } else {
                    WindowInsets(0, 0, 0, 0)
                },
            )
        },
    ) { /* content */ }
}
```

### Case B: always full-screen

Let the `TopAppBar` own status-bar insets via its default (`TopAppBarDefaults.windowInsets`).

```kotlin
@Composable
fun SomeFullScreenScreen(onBack: () -> Unit) {
    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.screen_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
                windowInsets = TopAppBarDefaults.windowInsets,  // default, can also be omitted
            )
        },
    ) { /* content */ }
}
```

---

## Presenting a full screen inside a `ModalBottomSheet`

If the sheet content is scrollable, also apply the `NestedScrollConnection` from `bottomsheet-scroll.md` to avoid drag jitter at the top of the scroll.

Reuse the screen in case A with `showTopBar = false`:

```kotlin
if (showManagementSheet) {
    val configuration = LocalConfiguration.current
    val maxSheetHeight = (configuration.screenHeightDp * 0.8f).dp

    ModalBottomSheet(
        onDismissRequest = { showManagementSheet = false },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        dragHandle = { BottomSheetDefaults.DragHandle() },
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        Box(modifier = Modifier.heightIn(max = maxSheetHeight)) {
            SomeManagementScreen(
                onBack = { showManagementSheet = false },
                showTopBar = false,  // hide back button, zero out insets
            )
        }
    }
}
```

### Bottom-sheet conventions

| Property | Value | Note |
|---|---|---|
| Max height | `screenHeight * 0.8f` | Above ~85% triggers Compose's full-screen sheet animation (opens rounded, then snaps flat) — avoid. |
| Drag handle | `BottomSheetDefaults.DragHandle()` | Omit only if swipe-to-dismiss is disabled (see `bottomsheet-scroll.md`). |
| Container color | `colorScheme.background` | Matches screen background when sheet is at max height. |
| TopAppBar background | `Color.Transparent` | Inside a sheet — lets the sheet's `containerColor` show through. |
| `BackHandler` | Disabled in sheet mode | Avoid interfering with the swipe-down gesture. |

---

## Snackbar

With the root `Scaffold`, a snackbar is simply:

```kotlin
val snackbarHostState = remember { SnackbarHostState() }

Scaffold(
    contentWindowInsets = WindowInsets(0, 0, 0, 0),
    snackbarHost = { SnackbarHost(snackbarHostState) },
    // ...
) { /* ... */ }
```

---

## Decision table

| Screen type | Status bar | `contentWindowInsets` on Scaffold |
|---|---|---|
| Tab (no `TopAppBar`) | `statusBarsPadding()` on the root modifier | N/A (no `Scaffold` here, or use `WindowInsets(0, 0, 0, 0)`) |
| Child page, full-screen | `TopAppBarDefaults.windowInsets` on the `TopAppBar` | `WindowInsets(0, 0, 0, 0)` |
| Child page, inside `ModalBottomSheet` | `WindowInsets(0, 0, 0, 0)` on the `TopAppBar` | `WindowInsets(0, 0, 0, 0)` |

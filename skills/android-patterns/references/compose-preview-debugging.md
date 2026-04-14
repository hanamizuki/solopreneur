# Compose Preview — Debugging Guide

When a `@Preview` is blank or wrong, work through these checks in order. For the solution catalogue, see `compose-preview-overview.md` and `compose-preview-solutions.md`.

---

## 1. Verify the data

Before blaming the framework, confirm the preview actually has data to render. Drop a temporary `Text` next to the component:

```kotlin
@Preview(showBackground = true, widthDp = 360, heightDp = 200)
@Composable
private fun ChartPreview_Debug() {
    val today = LocalDate.now()
    val previewData = (0..29).map { dayOffset ->
        ChartDataPoint(
            date = today.minusDays((29 - dayOffset).toLong()),
            value = 70.0 + (dayOffset % 5) * 0.5,
            hasValue = true,
        )
    }

    AppTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("points: ${previewData.size}")
            Text("valid:  ${previewData.count { it.hasValue }}")
            Text("first:  ${previewData.firstOrNull()?.value}")
            Text("last:   ${previewData.lastOrNull()?.value}")
            Spacer(modifier = Modifier.height(8.dp))

            SingleLineChart(
                data = previewData,
                dateRange = today.minusDays(29)..today,
                lineColor = Color.Black,
                modifier = Modifier.height(105.dp),
            )
        }
    }
}
```

Check: point count > 0, valid count > 0, numeric range plausible.

---

## 2. Look for async initialization

These never run inside a preview:

- `LaunchedEffect { ... }`
- `DisposableEffect { ... }`
- `rememberCoroutineScope().launch { ... }`

Fix by branching on `LocalInspectionMode.current` (see `compose-preview-overview.md` solution 1):

```kotlin
val isInPreview = LocalInspectionMode.current
if (isInPreview) {
    remember(data) { runBlocking { updateChart() } }
} else {
    LaunchedEffect(data) { updateChart() }
}
```

---

## 3. Check library versions

Some libraries need a minimum version for preview support. Vico, for example, only supports preview rendering from 2.1.0+:

```kotlin
dependencies {
    implementation("com.patrykandpatrick.vico:compose:2.2.1")  // preview-compatible
    // implementation("com.patrykandpatrick.vico:compose:2.0.0")  // no preview
}
```

Inspect:

```bash
./gradlew :app:dependencies | grep vico
```

---

## 4. Rebuild and refresh

Preview is cached aggressively. After a code change:

1. `./gradlew assembleDebug`
2. Click the refresh icon in the Preview panel (or `Cmd+R` / `Ctrl+R`)
3. If still stale: **File → Invalidate Caches / Restart → Invalidate and Restart**

---

## 5. Verify fake data sources

If the preview builds the component through a ViewModel backed by a fake DAO, check the fake returns non-empty data:

```kotlin
// ❌ Empty — chart will be blank
private class FakeDao : BodyMeasurementDao {
    override fun getMeasurementsForDateRange(...): Flow<List<BodyMeasurement>> =
        flowOf(emptyList())
}

// ✅ Generates realistic fake data
private class FakeDao : BodyMeasurementDao {
    private val fakeMeasurements = (0..29).map { dayOffset ->
        BodyMeasurement(
            id = "fake-$dayOffset",
            measurementTime = today.minusDays((29 - dayOffset).toLong())
                .atStartOfDay(ZoneId.systemDefault()).toInstant(),
            weight = 70.0 + (dayOffset % 5) * 0.5,
            // ...
        )
    }

    override fun getMeasurementsForDateRange(
        startTime: Instant,
        endTime: Instant,
    ): Flow<List<BodyMeasurement>> = flowOf(
        fakeMeasurements.filter { it.measurementTime in startTime..<endTime }
    )
}
```

---

## Common pitfalls

### Pitfall 1: calling `stringResource` inside `remember`

```kotlin
// ❌ Compile error — stringResource is @Composable and can only be
//    called at the top of a composable body.
val chartConfigs = remember(data) {
    val label = stringResource(R.string.weight)
    ChartConfig(label = label, ...)
}

// ✅ Resolve strings first, pass into remember as keys
val weightLabel = stringResource(R.string.weight)
val muscleLabel = stringResource(R.string.muscle)
val fatLabel = stringResource(R.string.body_fat)

val chartConfigs = remember(data, weightLabel, muscleLabel, fatLabel) {
    ChartConfig(label = weightLabel, ...)
}
```

Adding the labels to the `remember` key list ensures the config recomposes when the user changes app language.

### Pitfall 2: forgetting the theme wrapper

```kotlin
// ❌ MaterialTheme.colorScheme is not initialized
@Preview
@Composable
private fun ChartPreview() {
    SingleLineChart(...)
}

// ✅ Wrap in the app theme
@Preview
@Composable
private fun ChartPreview() {
    AppTheme {
        SingleLineChart(...)
    }
}
```

Anything that reads `MaterialTheme.colorScheme`, `MaterialTheme.typography`, or custom spacing tokens will crash or render wrong without the theme wrapper.

### Pitfall 3: forgetting to guard empty data

```kotlin
// ❌ Vico rejects empty series
LaunchedEffect(validEntries) {
    modelProducer.runTransaction {
        lineSeries { series(x = validEntries.map { it.first }, ...) }
    }
}

// ✅ Guard
LaunchedEffect(validEntries) {
    if (validEntries.isNotEmpty()) {
        modelProducer.runTransaction {
            lineSeries { series(x = validEntries.map { it.first }, ...) }
        }
    }
}
```

### Pitfall 4: `LocalWindowInfo.containerSize` returns zero in preview

Any width calculation that depends on `LocalWindowInfo` needs a fallback:

```kotlin
val containerWidth = with(LocalDensity.current) {
    val width = LocalWindowInfo.current.containerSize.width.toDp()
    if (width > 0.dp) width else 360.dp  // preview fallback
}
```

### Pitfall 5: `LaunchedEffect` without an inspection-mode branch

This is the #1 reason charts appear blank in preview. Always pair async initialization with the `LocalInspectionMode` branch (see `compose-preview-overview.md` solution 1).

---

## Quick reference

### Symptom → first thing to try

| Symptom | Likely cause | Fix |
|---|---|---|
| Preview blank | `LaunchedEffect` not running | `LocalInspectionMode` + `runBlocking` |
| Preview blank | Fake DAO returns empty | Generate sample data |
| Preview blank | No theme wrapper | Wrap in `AppTheme` |
| Compile error | `stringResource` inside `remember` | Resolve strings at top, pass as keys |
| NPE in preview | `colorScheme` null | Missing theme wrapper |
| Flow never emits | Preview does not run coroutines | Use internal-implementation pattern (solution 3) |

### Checklist for a new composable with preview

**Component design**
- [ ] Depends on ViewModel/Flow? Use solution 3 (internal-implementation)
- [ ] Define a data-provider interface if multiple flows
- [ ] Mark internal implementation as `private`

**Preview**
- [ ] Call the internal implementation, not a parallel simplified copy
- [ ] Use realistic sample data (not an empty list, not 3 points)
- [ ] Wrap in the app theme

**Code quality**
- [ ] `stringResource` only at composable top level
- [ ] Guard `isNotEmpty()` before initializing the chart model
- [ ] Fallback for `LocalWindowInfo` returning zero

**Coverage**
- [ ] Multiple preview states: full data, empty, partial
- [ ] Different screen sizes (e.g. 360 / 411 / 768)
- [ ] Dark mode preview

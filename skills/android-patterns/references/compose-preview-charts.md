# Compose Preview — Chart Best Practices

Patterns for writing high-quality previews of chart components (especially Vico). For the general preview solutions, see `compose-preview-overview.md` and `compose-preview-solutions.md`.

---

## Choosing a solution

| Scenario | Recommended solution |
|---|---|
| Chart has complex business logic or depends on ViewModel/Flow | Solution 3 (internal-implementation) |
| Standalone chart, no ViewModel, only async-init issue | Solution 1 (`LocalInspectionMode`) |
| Legacy / can't refactor right now | Solution 2 (simplified copy, as last resort) |

### Why solution 3 is usually right for charts

Charts tend to accumulate logic: dynamic series ordering, scroll-to-latest behaviour, auto-scaling, responsive width. Mirroring all of that in a simplified preview copy ends badly — the preview drifts from production and becomes a lie. The internal-implementation pattern keeps a single source of truth.

Skeleton:

```kotlin
// 1. Interface
interface ChartDataProvider {
    val data: Flow<List<DataPoint>>
}

// 2. Public API — collects flows, delegates
@Composable
fun MyChart(dataProvider: ChartDataProvider) {
    val data by dataProvider.data.collectAsState(emptyList())
    MyChartInternal(data = data)
}

// 3. Internal — real logic
@Composable
private fun MyChartInternal(data: List<DataPoint>) {
    // sorting, scrolling, scaling, rendering
}

// 4. Preview drives the real internal composable
@Preview
@Composable
private fun MyChartPreview() {
    val testData = (0..29).map { /* ... */ }
    AppTheme { MyChartInternal(data = testData) }
}
```

---

## Provide multiple preview states

A single preview is rarely enough. Chart bugs often hide in edge cases.

```kotlin
@Preview(name = "full data")
@Composable
private fun ChartPreview_WithData() {
    val data = (0..29).map { /* full series */ }
    AppTheme { SingleLineChart(data = data, /* ... */) }
}

@Preview(name = "empty")
@Composable
private fun ChartPreview_Empty() {
    val emptyData = (0..29).map { ChartDataPoint(/* ... */, hasValue = false) }
    AppTheme { SingleLineChart(data = emptyData, /* ... */) }
}

@Preview(name = "partial (every other day)")
@Composable
private fun ChartPreview_PartialData() {
    val data = (0..29).map { dayOffset ->
        ChartDataPoint(/* ... */, hasValue = dayOffset % 2 == 0)
    }
    AppTheme { SingleLineChart(data = data, /* ... */) }
}

@Preview(name = "debug stats", heightDp = 200)
@Composable
private fun ChartPreview_Debug() {
    val data = (0..29).map { /* ... */ }
    AppTheme {
        Column {
            Text("points: ${data.size}")
            Text("valid:  ${data.count { it.hasValue }}")
            SingleLineChart(data = data, /* ... */)
        }
    }
}
```

Cover: normal, empty, boundary (partial), and an optional debug state.

---

## Use realistic sample data

```kotlin
// ✅ Plausible range (weight 60–80 kg)
val weight = 70.0 + (dayOffset % 10) * 1.0

// ✅ Plausible body-fat % (15–25)
val bodyFat = 20.0 + (dayOffset % 5) * 1.0

// ❌ Nonsense — values too small to render
val weight = dayOffset.toDouble()
```

Simulate different shapes of data so the preview reveals layout issues:

```kotlin
// Rising trend
val weight = 70.0 + dayOffset * 0.1

// Falling trend
val weight = 80.0 - dayOffset * 0.1

// Oscillating
val weight = 70.0 + sin(dayOffset * 0.5) * 2.0

// Sparse data — every third day
val hasValue = dayOffset % 3 == 0

// Front half populated, back half missing
val hasValue = dayOffset < 15
```

Prefer a realistic *size* of series too — 60 points is a better stress test than 3.

---

## Test different screen sizes

```kotlin
@Preview(name = "small",  widthDp = 360, heightDp = 640)
@Preview(name = "medium", widthDp = 411, heightDp = 891)
@Preview(name = "large",  widthDp = 480, heightDp = 1024)
@Preview(name = "tablet", widthDp = 768, heightDp = 1024)
@Composable
private fun ChartPreview_Sizes() { /* ... */ }
```

Compose's multi-preview annotations (`@Preview` applied multiple times) are the concise way to do this.

---

## Test dark mode

```kotlin
@Preview(name = "light", uiMode = Configuration.UI_MODE_NIGHT_NO)
@Composable
private fun ChartPreview_Light() {
    AppTheme { SingleLineChart(/* ... */) }
}

@Preview(name = "dark", uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun ChartPreview_Dark() {
    AppTheme { SingleLineChart(/* ... */) }
}
```

Dark mode surfaces color-contrast problems that light-mode previews hide.

---

## Fake DAO pattern for ViewModel-backed previews

When a screen composes multiple ViewModels, fake DAOs are the most pragmatic way to drive a realistic preview:

```kotlin
private class FakeBodyMeasurementDao : BodyMeasurementDao {
    private val today = LocalDate.now()

    private val fakeMeasurements = (0..29).map { dayOffset ->
        val date = today.minusDays((29 - dayOffset).toLong())
        BodyMeasurement(
            id = "fake-$dayOffset",
            measurementTime = date.atStartOfDay(ZoneId.systemDefault()).toInstant(),
            weight = 70.0 + (dayOffset % 5) * 0.5,
            bodyFatPercentage = if (dayOffset % 3 == 0) 20.0 else null,
            muscle = if (dayOffset % 2 == 0) 30.0 else null,
            source = "Manual",
            sourcePackageName = null,
            healthConnectId = null,
        )
    }

    override fun getMeasurementsForDateRange(
        startTime: Instant,
        endTime: Instant,
    ): Flow<List<BodyMeasurement>> = flowOf(
        fakeMeasurements.filter { it.measurementTime in startTime..<endTime }
    )

    override fun getAllMeasurements(): Flow<List<BodyMeasurement>> =
        flowOf(fakeMeasurements)

    // ... other DAO methods
}
```

Key points:

- Generate enough data to exercise the chart meaningfully (30–60 points)
- Implement every query the ViewModel actually calls — an empty return from one method will silently break the preview
- Keep fakes deterministic (no random) so the preview is stable across refreshes

---

## References

- Vico official: https://www.patrykandpatrick.com/vico/guide
- Vico samples: https://github.com/patrykandpatrick/vico/tree/master/sample
- `LocalInspectionMode`: https://developer.android.com/reference/kotlin/androidx/compose/ui/platform/LocalInspectionMode
- Compose Preview tooling: https://developer.android.com/jetpack/compose/tooling/previews
- Vico discussion on preview rendering: https://github.com/patrykandpatrick/vico/discussions/795

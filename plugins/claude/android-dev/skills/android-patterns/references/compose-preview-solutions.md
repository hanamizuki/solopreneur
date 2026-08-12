# Compose Preview — Solutions 2 and 3

For the problem statement and solution 1 (`LocalInspectionMode`), see `compose-preview-overview.md`. For chart-specific preview patterns (Vico, fake data providers, multi-state previews), see `compose-preview-charts.md`.

---

## Solution 2: Simplified preview-only component

### When to consider

- The component depends on a complex ViewModel with `flatMapLatest`, `refreshTrigger`, etc.
- Flows do not emit synchronously in the preview environment
- You need to bypass complex state management just to render the view

### Example

```kotlin
/**
 * Preview-only simplified copy: takes data directly, bypassing the
 * ViewModel. Keep this thin — any real ordering / scroll / sizing logic
 * belongs in the production component. For the full ordering logic see
 * Solution 3 (`TrendChartViewInternal`) below.
 */
@Composable
private fun TrendChartViewSimplified(
    weightData: List<ChartDataPoint>,
    muscleData: List<ChartDataPoint>,
    fatData: List<ChartDataPoint>,
    dateRange: ClosedRange<LocalDate>,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        listOf(weightData, muscleData, fatData).forEach { data ->
            SingleLineChart(data = data, dateRange = dateRange, lineColor = Color.Black)
        }
    }
}
```

### Pros

- Sidesteps ViewModel / Flow async issues
- Preview function is lightweight and easy to edit
- Convenient for trying different data shapes

### Cons

- **Two copies** of the rendering logic must be maintained
- Changes to the real component can drift from the preview
- Increases code complexity and review surface

### When to use — and when to stop

Only use solution 2 if **solution 3 is not feasible** (e.g. inherited code you cannot refactor right now). If you do use it, mark the preview copy clearly in a comment and schedule the refactor to solution 3.

---

## Solution 3: Internal-implementation pattern (preferred for complex components)

### Core principle

> **Preview must exercise the real logic.** Don't build a parallel simplified copy — extract the real rendering logic into an internal composable that takes direct parameters, and have both the production entry point and the preview call it.

### Structure

1. **Data-provider interface** — defines the data contract (Flows)
2. **Public API** — takes the data provider, collects flows, delegates to internal
3. **Internal implementation** — takes direct parameters, contains all UI + business logic
4. **Preview** — calls the internal implementation directly with static test data

### Full example

```kotlin
/**
 * Data contract for the component. Production code supplies a ViewModel
 * implementation; previews can call the internal implementation directly
 * with static data.
 */
interface ChartDataProvider {
    val weightChartData: Flow<List<ChartDataPoint>>
    val muscleChartData: Flow<List<ChartDataPoint>>
    val fatChartData: Flow<List<ChartDataPoint>>
    val unifiedDateRange: Flow<ClosedRange<LocalDate>>
}

/**
 * Public API — a thin wrapper that collects Flows.
 */
@Composable
fun TrendChartView(
    dataProvider: ChartDataProvider,
    modifier: Modifier = Modifier,
) {
    val weightData by dataProvider.weightChartData.collectAsState(initial = emptyList())
    val muscleData by dataProvider.muscleChartData.collectAsState(initial = emptyList())
    val fatData by dataProvider.fatChartData.collectAsState(initial = emptyList())
    // Cache `today` once so the 60-day range can't straddle midnight
    // between the two LocalDate.now() calls.
    val today = LocalDate.now()
    val dateRange by dataProvider.unifiedDateRange.collectAsState(
        initial = today.minusDays(59)..today
    )

    TrendChartViewInternal(
        weightData = weightData,
        muscleData = muscleData,
        fatData = fatData,
        dateRange = dateRange,
        modifier = modifier,
    )
}

/**
 * Internal implementation — all the real UI + business logic lives here.
 * Takes direct parameters so it can be driven from either collected flows
 * (production) or static data (preview).
 */
@Composable
private fun TrendChartViewInternal(
    weightData: List<ChartDataPoint>,
    muscleData: List<ChartDataPoint>,
    fatData: List<ChartDataPoint>,
    dateRange: ClosedRange<LocalDate>,
    modifier: Modifier = Modifier,
) {
    val weightColor = MaterialTheme.colorScheme.onBackground
    val muscleColor = MaterialTheme.colorScheme.secondary
    val fatColor = MaterialTheme.colorScheme.secondary.copy(alpha = 0.6f)

    val weightLabel = stringResource(R.string.weight)
    val muscleLabel = stringResource(R.string.muscle)
    val fatLabel = stringResource(R.string.body_fat)

    val chartConfigs = remember(
        muscleData, fatData, weightData,
        weightColor, muscleColor, fatColor,
        weightLabel, muscleLabel, fatLabel,
    ) {
        val latestMuscle = muscleData.lastOrNull { it.hasValue }?.value
        val latestFat = fatData.lastOrNull { it.hasValue }?.value
        val weightConfig = ChartConfig(weightData, weightColor, weightLabel)

        if (latestFat != null && latestMuscle != null && latestFat > latestMuscle) {
            listOf(
                weightConfig,
                ChartConfig(fatData, fatColor, fatLabel),
                ChartConfig(muscleData, muscleColor, muscleLabel),
            )
        } else {
            listOf(
                weightConfig,
                ChartConfig(muscleData, muscleColor, muscleLabel),
                ChartConfig(fatData, fatColor, fatLabel),
            )
        }
    }

    // Chart width calculation — defend against preview returning 0
    val density = LocalDensity.current
    val containerWidth = with(density) {
        // Requires Compose UI 1.6+. On older Compose use
        // `LocalConfiguration.current.screenWidthDp.dp`.
        val width = LocalWindowInfo.current.containerSize.width.toDp()
        if (width > 0.dp) width else 360.dp  // fallback for preview
    }
    val dayCount = ChronoUnit.DAYS.between(dateRange.start, dateRange.endInclusive) + 1
    val pointWidth = 55.dp
    val minWidth = containerWidth * 2
    val chartWidth = maxOf(dayCount.toInt() * pointWidth.value, minWidth.value).dp

    val scrollState = rememberScrollState()

    // Scroll to latest data on mount. Guard against preview: in Layoutlib
    // `maxValue` stays 0 and `.first { it > 0 }` would suspend forever.
    val isInPreview = LocalInspectionMode.current
    LaunchedEffect(Unit) {
        if (!isInPreview) {
            snapshotFlow { scrollState.maxValue }.first { it > 0 }
            scrollState.animateScrollTo(scrollState.maxValue)
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .padding(horizontal = 20.dp),
        ) {
            Column(modifier = Modifier.width(chartWidth)) {
                chartConfigs.forEachIndexed { index, config ->
                    val isLastChart = index == chartConfigs.size - 1
                    val isMainChart = index == 0

                    SingleLineChart(
                        data = config.data,
                        dateRange = dateRange,
                        lineColor = config.color,
                        modifier = Modifier.height(105.dp),
                        showXAxis = isLastChart,
                        isMainChart = isMainChart,
                    )
                }
            }
        }
    }
}
```

### ViewModel implements the interface

```kotlin
class HomeViewModel(
    private val repository: BodyMeasurementRepository,
) : ViewModel(), ChartDataProvider {

    override val weightChartData: Flow<List<ChartDataPoint>> =
        dailySummaries.map { it.map(::toChartPoint) }

    override val muscleChartData: Flow<List<ChartDataPoint>> = /* ... */
    override val fatChartData: Flow<List<ChartDataPoint>> = /* ... */
    override val unifiedDateRange: Flow<ClosedRange<LocalDate>> = /* ... */
}
```

### Call site

```kotlin
@Composable
fun HomeScreen(viewModel: HomeViewModel) {
    TrendChartView(dataProvider = viewModel)
}
```

### Preview — drives the internal implementation

```kotlin
@Preview(showBackground = true, widthDp = 360, heightDp = 400)
@Composable
private fun TrendChartViewPreview() {
    val today = LocalDate.now()

    val weightData = (0..59).map { dayOffset ->
        ChartDataPoint(
            date = today.minusDays((59 - dayOffset).toLong()),
            value = 70.0 + (dayOffset % 5) * 0.5,
            hasValue = true,
        )
    }
    val muscleData = (0..59).map { dayOffset ->
        ChartDataPoint(
            date = today.minusDays((59 - dayOffset).toLong()),
            value = if (dayOffset % 2 == 0) 30.0 + (dayOffset % 3) * 0.3 else null,
            hasValue = dayOffset % 2 == 0,
        )
    }
    val fatData = (0..59).map { dayOffset ->
        ChartDataPoint(
            date = today.minusDays((59 - dayOffset).toLong()),
            value = if (dayOffset % 3 == 0) 14.0 + (dayOffset % 4) * 0.3 else null,
            hasValue = dayOffset % 3 == 0,
        )
    }

    AppTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            // Drive the real internal implementation with static data
            TrendChartViewInternal(
                weightData = weightData,
                muscleData = muscleData,
                fatData = fatData,
                dateRange = today.minusDays(59)..today,
            )
        }
    }
}
```

### Pros

- ✅ Zero duplication — single source of truth for UI logic
- ✅ Preview matches production 1:1 — any change flows through to both
- ✅ Easy to maintain — logic only exists in one place
- ✅ Full fidelity — scrolling, animations, dynamic ordering all present in preview
- ✅ Type-safe — depend on an interface, not a concrete ViewModel, easier to test

### Solution 2 vs Solution 3

| Property | Solution 2 (simplified copy) | Solution 3 (internal impl) |
|---|---|---|
| Duplication | Two copies to maintain | Single source |
| Preview fidelity | May diverge | Identical to production |
| Maintenance cost | High (sync two places) | Low |
| Feature completeness | Often simplified | 100% |

### Use solution 3 when

- Component depends on a ViewModel or Flow
- Component has non-trivial business or UI logic (sorting, scroll, animation)
- You want the preview to match production exactly

### Skip solution 3 when

- Component is stateless and already takes direct parameters (no wrapper needed)
- No ViewModel / Flow dependency

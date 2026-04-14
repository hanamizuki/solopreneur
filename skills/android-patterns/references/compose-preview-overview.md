# Compose Preview — Problem and Solution Overview

A guide to making Jetpack Compose `@Preview` render correctly, especially with charts (Vico) and components that rely on asynchronous data loading.

## Symptoms

- ✅ The chart (or component) renders correctly in the running app
- ❌ Android Studio `@Preview` is blank
- ❌ No error message — data simply never reaches the view

## Root cause

**The preview environment is non-interactive and does not run coroutines.**

- `LaunchedEffect`, `DisposableEffect`, and `rememberCoroutineScope().launch` **do not execute** inside a preview
- Any component that initializes its data inside `LaunchedEffect` will therefore have empty state in preview
- For Vico charts, this means `CartesianChartModelProducer` is never populated

```kotlin
// This block never runs in @Preview
LaunchedEffect(validEntries) {
    modelProducer.runTransaction {
        lineSeries { ... }
    }
}
```

Reference: [Vico GitHub Discussion #795](https://github.com/patrykandpatrick/vico/discussions/795). Vico 2.1.0+ officially supports previews, but the component author still needs to handle the async-initialization gap.

## Three solutions

| # | Name | When to use | Recommendation |
|---|---|---|---|
| 1 | `LocalInspectionMode` branch | Self-contained component, no ViewModel dependency, just needs to bypass async init | ⭐⭐⭐⭐ Recommended for simple components |
| 2 | Simplified preview-only copy | Legacy code or special cases where refactoring is too costly | ⭐⭐ Avoid when possible — two copies diverge |
| 3 | Internal-implementation pattern | Component depends on ViewModel / Flow and has non-trivial logic | ⭐⭐⭐⭐⭐ Best choice for complex components |

**Solution 1 is covered below.** For solutions 2 and 3, see `compose-preview-solutions.md`. For debugging when previews still fail, see `compose-preview-debugging.md`.

---

## Solution 1: `LocalInspectionMode` branch

### Core idea

Use `LocalInspectionMode.current` to detect the environment and branch:

- **Preview**: initialize synchronously with `runBlocking`
- **Production**: initialize asynchronously with `LaunchedEffect`

One function supports both paths — no duplication.

### Full example

```kotlin
import androidx.compose.ui.platform.LocalInspectionMode
import kotlinx.coroutines.runBlocking

@Composable
fun SingleLineChart(
    data: List<ChartDataPoint>,
    dateRange: ClosedRange<LocalDate>,
    lineColor: Color,
    modifier: Modifier = Modifier,
) {
    val validEntries = remember(data) {
        data.mapIndexedNotNull { index, point ->
            if (point.hasValue && point.value != null) {
                index.toFloat() to point.value.toFloat()
            } else null
        }
    }

    // Detect preview environment
    val isInPreview = LocalInspectionMode.current
    val modelProducer = remember { CartesianChartModelProducer() }

    if (isInPreview) {
        // Preview: initialize synchronously
        remember(validEntries) {
            if (validEntries.isNotEmpty()) {
                runBlocking {
                    modelProducer.runTransaction {
                        lineSeries {
                            series(
                                x = validEntries.map { it.first },
                                y = validEntries.map { it.second },
                            )
                        }
                    }
                }
            }
        }
    } else {
        // Production: initialize asynchronously
        LaunchedEffect(validEntries) {
            if (validEntries.isNotEmpty()) {
                modelProducer.runTransaction {
                    lineSeries {
                        series(
                            x = validEntries.map { it.first },
                            y = validEntries.map { it.second },
                        )
                    }
                }
            }
        }
    }

    CartesianChartHost(
        chart = rememberCartesianChart(rememberLineCartesianLayer(/* ... */)),
        modelProducer = modelProducer,
        modifier = modifier,
    )
}
```

### Preview usage

```kotlin
@Preview(showBackground = true, widthDp = 360, heightDp = 105)
@Composable
private fun SingleLineChartPreview_MainChart() {
    val today = LocalDate.now()
    val previewData = (0..29).map { dayOffset ->
        ChartDataPoint(
            date = today.minusDays((29 - dayOffset).toLong()),
            value = 70.0 + (dayOffset % 5) * 0.5,
            hasValue = true,
        )
    }

    AppTheme {
        SingleLineChart(
            data = previewData,
            dateRange = today.minusDays(29)..today,
            lineColor = Color.Black,
        )
    }
}
```

### Why this works

- `LocalInspectionMode.current` returns `true` when the composable is being rendered inside a tool preview
- `runBlocking` is normally forbidden in UI code, but the preview environment is single-shot rendering, not a live app — synchronous init is acceptable there
- Branching keeps production code on the proper async path

### Required imports

```kotlin
import androidx.compose.ui.platform.LocalInspectionMode
import kotlinx.coroutines.runBlocking
```

### Pros

- Zero code duplication — one function handles both paths
- Auto-detecting — no manual flag to pass
- Low maintenance — logic lives in one place

### Limitations

Solution 1 works well for self-contained components. If the component reads from a `ViewModel` or `Flow`, those will not emit in preview either, and `LocalInspectionMode` alone is not enough. For that case, use **solution 3** (see `compose-preview-solutions.md`).

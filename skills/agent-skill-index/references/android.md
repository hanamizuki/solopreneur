# Android Skills Index

When facing an Android development issue, find the appropriate skill by description,
then use Read to load the corresponding SKILL.md.

## How to Read Skills

Read: `~/.claude/skills/{skill-name}/SKILL.md`

## Skills

### Cross-platform Tools
- `deploy-to-device`: Deploy to physical iOS/Android devices (xcodebuild + devicectl / gradlew installDebug)

### Architecture & Build
- `android-architecture`: Clean Architecture + Hilt DI setup, module structure, dependency injection
- `android-gradle-logic`: Gradle Convention Plugins + Version Catalogs setup
- `android-gradle-build-performance`: Build performance optimization, CI/CD analysis, compilation bottlenecks

### Jetpack Compose UI
- `android-jetpack-compose`: Compose basics (remember, mutableStateOf, declarative UI patterns)
- `android-compose-ui`: Compose best practices (state hoisting, performance optimization, theming)
- `android-compose-performance-audit`: Compose performance audit (recomposition, janky scrolling, slow rendering)
- `android-xml-to-compose-migration`: XML layouts → Jetpack Compose migration
- `android-mobile-design`: Material Design 3 + Jetpack Compose UI design (theming, components, adaptive layout)

### Navigation
- `android-compose-navigation`: Navigation Compose (NavHost, screen arguments, deep links, multi-screen)

### Data & State
- `android-data-layer`: Repository pattern + Room + Retrofit + offline-first sync
- `android-viewmodel`: ViewModel best practices (StateFlow for UI state, SharedFlow for events)

### Concurrency
- `android-coroutines`: Kotlin Coroutines (structured concurrency, lifecycle integration, reactive streams)
- `android-kotlin-concurrency-expert`: Coroutine code review, thread safety, lifecycle issues

### Testing
- `android-testing`: Testing strategy (Unit, Integration, Hilt, Screenshot tests)

### Accessibility
- `android-accessibility`: Accessibility audit checklist (Jetpack Compose focus)

### Patterns
- `android-patterns-hana`: Android development patterns (Kotlin, Compose, Preview, Navigation, i18n)

## Common Combinations

- New feature → read `android-patterns-hana` for conventions first, then the relevant feature skill
- Compose UI + jank → `android-compose-ui` + `android-compose-performance-audit`
- Coroutine issues → `android-coroutines` for basics, `android-kotlin-concurrency-expert` for review
- Build slow vs runtime slow → `android-gradle-build-performance` (build time) vs `android-compose-performance-audit` (runtime)
- XML migration → `android-xml-to-compose-migration` + `android-compose-navigation` (migrate navigation together)

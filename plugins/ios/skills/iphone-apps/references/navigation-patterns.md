# Navigation Patterns

NavigationStack, deep linking, and programmatic navigation for iOS apps.

## NavigationStack Basics

### Value-Based Navigation

```swift
struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List(items) { item in
                NavigationLink(value: item) {
                    ItemRow(item: item)
                }
            }
            .navigationTitle("Items")
            .navigationDestination(for: Item.self) { item in
                ItemDetail(item: item, path: $path)
            }
            .navigationDestination(for: Category.self) { category in
                CategoryView(category: category)
            }
        }
    }
}
```

### Programmatic Navigation

```swift
struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            VStack {
                Button("Go to Settings") {
                    path.append(Route.settings)
                }

                Button("Go to Item") {
                    path.append(items[0])
                }

                Button("Deep Link") {
                    // Push multiple screens
                    path.append(Route.settings)
                    path.append(SettingsSection.account)
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .settings:
                    SettingsView(path: $path)
                case .profile:
                    ProfileView()
                }
            }
            .navigationDestination(for: Item.self) { item in
                ItemDetail(item: item)
            }
            .navigationDestination(for: SettingsSection.self) { section in
                SettingsSectionView(section: section)
            }
        }
    }

    func popToRoot() {
        path.removeLast(path.count)
    }

    func popOne() {
        if !path.isEmpty {
            path.removeLast()
        }
    }
}

enum Route: Hashable {
    case settings
    case profile
}

enum SettingsSection: Hashable {
    case account
    case notifications
    case privacy
}
```

## Tab-Based Navigation

### TabView with NavigationStack per Tab

```swift
struct MainTabView: View {
    @State private var selectedTab = Tab.home
    @State private var homePath = NavigationPath()
    @State private var searchPath = NavigationPath()
    @State private var profilePath = NavigationPath()

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack(path: $homePath) {
                HomeView()
            }
            .tabItem {
                Label("Home", systemImage: "house")
            }
            .tag(Tab.home)

            NavigationStack(path: $searchPath) {
                SearchView()
            }
            .tabItem {
                Label("Search", systemImage: "magnifyingglass")
            }
            .tag(Tab.search)

            NavigationStack(path: $profilePath) {
                ProfileView()
            }
            .tabItem {
                Label("Profile", systemImage: "person")
            }
            .tag(Tab.profile)
        }
        .onChange(of: selectedTab) { oldTab, newTab in
            // Pop to root when re-tapping current tab
            if oldTab == newTab {
                switch newTab {
                case .home: homePath.removeLast(homePath.count)
                case .search: searchPath.removeLast(searchPath.count)
                case .profile: profilePath.removeLast(profilePath.count)
                }
            }
        }
    }

    enum Tab {
        case home, search, profile
    }
}
```

## Deep Linking

### URL Scheme Handling

Configure in Info.plist:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>myapp</string>
        </array>
    </dict>
</array>
```

Handle in App:
```swift
@main
struct MyApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        // myapp://item/123
        // myapp://settings/account
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return }

        let pathComponents = components.path.split(separator: "/").map(String.init)

        switch pathComponents.first {
        case "item":
            if let id = pathComponents.dropFirst().first {
                appState.navigateToItem(id: id)
            }
        case "settings":
            let section = pathComponents.dropFirst().first
            appState.navigateToSettings(section: section)
        default:
            break
        }
    }
}

@Observable
class AppState {
    var selectedTab: Tab = .home
    var homePath = NavigationPath()

    func navigateToItem(id: String) {
        selectedTab = .home
        homePath.removeLast(homePath.count)
        if let item = findItem(id: id) {
            homePath.append(item)
        }
    }

    func navigateToSettings(section: String?) {
        selectedTab = .profile
        // Navigate to settings
    }
}
```

### Universal Links

Configure in `apple-app-site-association` on your server:
```json
{
    "applinks": {
        "apps": [],
        "details": [
            {
                "appID": "TEAMID.com.yourcompany.app",
                "paths": ["/item/*", "/user/*"]
            }
        ]
    }
}
```

Add Associated Domains entitlement:
```xml
<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:example.com</string>
</array>
```

Handle same as URL schemes with `onOpenURL`.

## Modal Presentation

### Sheet Navigation

```swift
struct ContentView: View {
    @State private var selectedItem: Item?
    @State private var showingNewItem = false

    var body: some View {
        NavigationStack {
            List(items) { item in
                Button(item.name) {
                    selectedItem = item
                }
            }
            .toolbar {
                Button {
                    showingNewItem = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        // Item-based presentation
        .sheet(item: $selectedItem) { item in
            NavigationStack {
                ItemDetail(item: item)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") {
                                selectedItem = nil
                            }
                        }
                    }
            }
        }
        // Boolean-based presentation
        .sheet(isPresented: $showingNewItem) {
            NavigationStack {
                NewItemView()
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") {
                                showingNewItem = false
                            }
                        }
                    }
            }
        }
    }
}
```

### Full Screen Cover

```swift
.fullScreenCover(isPresented: $showingOnboarding) {
    OnboardingFlow()
}
```

### Detents (Sheet Sizes)

```swift
.sheet(isPresented: $showingOptions) {
    OptionsView()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
}
```

## Navigation State Persistence

### Codable Navigation Path

```swift
struct ContentView: View {
    @State private var path: [Route] = []

    var body: some View {
        NavigationStack(path: $path) {
            // Content
        }
        .onAppear {
            loadNavigationState()
        }
        .onChange(of: path) { _, newPath in
            saveNavigationState(newPath)
        }
    }

    private func saveNavigationState(_ path: [Route]) {
        if let data = try? JSONEncoder().encode(path) {
            UserDefaults.standard.set(data, forKey: "navigationPath")
        }
    }

    private func loadNavigationState() {
        guard let data = UserDefaults.standard.data(forKey: "navigationPath"),
              let savedPath = try? JSONDecoder().decode([Route].self, from: data) else {
            return
        }
        path = savedPath
    }
}

enum Route: Codable, Hashable {
    case item(id: UUID)
    case settings
    case profile
}
```

## Navigation Coordinator

For complex apps, centralize navigation logic:

```swift
@Observable
class NavigationCoordinator {
    var homePath = NavigationPath()
    var searchPath = NavigationPath()
    var selectedTab: Tab = .home

    enum Tab {
        case home, search, profile
    }

    func showItem(_ item: Item) {
        selectedTab = .home
        homePath.append(item)
    }

    func showSearch(query: String) {
        selectedTab = .search
        searchPath.append(SearchQuery(text: query))
    }

    func popToRoot() {
        switch selectedTab {
        case .home:
            homePath.removeLast(homePath.count)
        case .search:
            searchPath.removeLast(searchPath.count)
        case .profile:
            break
        }
    }

    func handleDeepLink(_ url: URL) {
        // Parse and navigate
    }
}

// Inject via environment
@main
struct MyApp: App {
    @State private var coordinator = NavigationCoordinator()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(coordinator)
                .onOpenURL { url in
                    coordinator.handleDeepLink(url)
                }
        }
    }
}
```

## Search Integration

### Searchable Modifier

```swift
struct ItemList: View {
    @State private var searchText = ""
    @State private var searchScope = SearchScope.all

    var filteredItems: [Item] {
        items.filter { item in
            searchText.isEmpty || item.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            List(filteredItems) { item in
                NavigationLink(value: item) {
                    ItemRow(item: item)
                }
            }
            .navigationTitle("Items")
            .searchable(text: $searchText, prompt: "Search items")
            .searchScopes($searchScope) {
                Text("All").tag(SearchScope.all)
                Text("Recent").tag(SearchScope.recent)
                Text("Favorites").tag(SearchScope.favorites)
            }
            .navigationDestination(for: Item.self) { item in
                ItemDetail(item: item)
            }
        }
    }

    enum SearchScope {
        case all, recent, favorites
    }
}
```

### Search Suggestions

```swift
.searchable(text: $searchText) {
    ForEach(suggestions) { suggestion in
        Text(suggestion.text)
            .searchCompletion(suggestion.text)
    }
}
```

Language: .NET
Upgrade versions: >= 1.7
Package: https://www.nuget.org/packages/Neo4j.Driver

# Upgrade paths

## Upgrading from version 1.7

If you're upgrading from version 1.7, first run the upgrade to version 4.0 by following [this guide](https://raw.githubusercontent.com/wiki/neo4j/neo4j-dotnet-driver/Migrating-from-1.7-to-4.0.md)

## Upgrading from versions >= 4.0

Important: Do not ever start upgrading the codebase before collecting all changelogs between the current, and the requested version

Check the changelog between the major versions by following these links:
- [4.1 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-dotnet-driver/4.1-Changelog.md)
- [4.2 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-dotnet-driver/4.2-Change-Log.md)
- [4.3 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-dotnet-driver/4.3-Change-Log.md)
- [4.4 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-dotnet-driver/4.4-Change-Log.md)
- every other major version changelog URL follows this pattern: `https://raw.githubusercontent.com/wiki/neo4j/neo4j-dotnet-driver/{MAJOR_VERSION}.X-Change-Log.md` where `{MAJOR_VERSION}` should be replaced with the major version you check the changelog for. E.g. for version 6.1 you'd fetch URL https://raw.githubusercontent.com/wiki/neo4j/neo4j-dotnet-driver/6.X-Change-Log.md . Do not replace the `.x` part of the URL
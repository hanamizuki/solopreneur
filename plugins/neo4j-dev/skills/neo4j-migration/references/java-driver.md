Language: Java
Upgrade versions: >= 1.0
Package: https://central.sonatype.com/artifact/org.neo4j.driver/neo4j-java-driver

# Upgrade paths

Important: Before performing the upgrade, make sure that the new version of the driver is compatible with Java version used in the project

## Upgrading

Important: Do not ever start upgrading the codebase before collecting all changelogs between the current, and the requested version

Check the changelog between the major versions by following these links:
- [4.4 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-java-driver/4.4-changelog.md)
- every other major version changelog URL follows this pattern: `https://raw.githubusercontent.com/wiki/neo4j/neo4j-java-driver/{MAJOR_VERSION}.x-changelog.md` where `{MAJOR_VERSION}` should be replaced with the version you check the changelog for. E.g. for version 6.1 you'd fetch URL https://raw.githubusercontent.com/wiki/neo4j/neo4j-java-driver/6.x-changelog.md . Do not replace the `.x` part of the URL
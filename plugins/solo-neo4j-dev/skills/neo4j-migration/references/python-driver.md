Language: Python
Upgrade versions: >= 1.7
Package: https://pypi.org/project/neo4j/

# Driver's package name change

The driver's package name has changed from `neo4j-driver` to `neo4j`. If the project is using the former, it needs to be changed before any actions performed

# Upgrade paths

## Upgrading from version 1.7

If you're upgrading from version 1.7, first run the upgrade to version 4.0 by following [this guide](https://neo4j.com/docs/upgrade-migration-guide/current/version-4/migration/drivers/python-driver/)

## Upgrading from versions >= 4.0

Important: Do not ever start upgrading the codebase before collecting all changelogs between the current, and the requested version

Check the changelog between the major versions by following these links:
- [4.1 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-python-driver/4.1-changelog.md)
- [4.2 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-python-driver/4.2-changelog.md)
- [4.3 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-python-driver/4.3-Changelog.md)
- [4.4 changelog](https://raw.githubusercontent.com/wiki/neo4j/neo4j-python-driver/4.4-Changelog.md)
- every other major version changelog URL follows this pattern: `https://raw.githubusercontent.com/wiki/neo4j/neo4j-python-driver/{MAJOR_VERSION}.x-Changelog.md` where `{MAJOR_VERSION}` should be replaced with the major version you check the changelog for. E.g. for version 6.1 you'd fetch URL https://raw.githubusercontent.com/wiki/neo4j/neo4j-python-driver/6.x-Changelog.md . Do not replace the `.x` part of the URL
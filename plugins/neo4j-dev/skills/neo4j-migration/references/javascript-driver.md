Language: Javascript/Node.JS
Upgrade versions: >= 1.0
Package: https://www.npmjs.com/package/neo4j

# Upgrade paths

Important: Do not ever start upgrading the codebase before collecting all changelogs between the current, and the requested version

## Upgrading

Check the changelog between the major versions by following these links:
- changelogs for versions <= 5.0 follow this pattern: `https://raw.githubusercontent.com/wiki/neo4j/neo4j-javascript-driver/{VERSION}-changelog.md` where `{VERSION}` should be replaced with both major and minor version number. E.g. for version 4.1 you'd fetch URL https://raw.githubusercontent.com/wiki/neo4j/neo4j-javascript-driver/4.1-changelog.md. Version numbers that can be accessed that way are: 1.0,1.1,1.2,1.3,1.4,4.0,4.1,4.2,4.3,4.4,5.0
- every other major version changelog URL follows this pattern: `https://raw.githubusercontent.com/wiki/neo4j/neo4j-javascript-driver/{MAJOR_VERSION}.x-changelog.md` where `{MAJOR_VERSION}` should be replaced with the major version you check the changelog for. E.g. for version 6.1 you'd fetch URL https://raw.githubusercontent.com/wiki/neo4j/neo4j-javascript-driver/6.x-changelog.md . Do not replace the `.x` part of the URL
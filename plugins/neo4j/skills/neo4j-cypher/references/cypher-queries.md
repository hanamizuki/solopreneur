This reference file should be used to upgrade Cypher queries for different versions of the Neo4j database

# Upgrade paths

Important: Do not ever start upgrading the queries before collecting all changelogs between the current, and the requested version

## Upgrading

If your target version is 4.x, include [4.x changelog](https://neo4j.com/docs/cypher-manual/4.4/deprecations-additions-removals-compatibility/)
If your target version is 5.x, or a version <2025.06, ALSO include [5.x changelog](https://neo4j.com/docs/cypher-manual/5/deprecations-additions-removals-compatibility/)

## Upgrading to versions >= 2025.06

If a user says that the target Neo4j version is going to be >= 2025.06, ALWAYS ask the user what Cypher version is going to be used, there are two possible options: Cypher 5, Cypher 25
If the user chooses Cypher 25, ALSO include [25 changelog](https://neo4j.com/docs/cypher-manual/25/deprecations-additions-removals-compatibility/)
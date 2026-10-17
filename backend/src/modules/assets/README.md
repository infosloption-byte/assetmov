# Asset lifecycle module

The current module is domain-only. It defines lifecycle statuses and transition guards that service operations must call before persisting state changes.

## Integration requirements

- Call `assertAssetTransition` inside the database transaction that updates the asset and writes its `AssetTransaction` event.
- Load the asset by both its ID and the authenticated tenant ID. Never use an unscoped record lookup.
- Use conditional updates or row locking/version checks for transfer and assignment races.
- Verify the caller's tenant membership, permission, and permitted location subtree before changing state.
- Do not let a browser-provided status override workflow logic.
- Add workflow-specific rules for dispatch, receipt/rejection, and maintenance start/completion before implementing those APIs.

The helpers are covered by unit tests; they do not replace database authorization or transaction-level invariants.

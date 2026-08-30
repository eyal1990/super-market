# Offline issue contracts

These files are checked-in snapshots of the GitHub issue bodies that define the
current implementation contracts. They are a fallback for agents running
without an in-app browser or unrestricted HTTPS access; they are not a second
backlog.

GitHub remains the source of truth. When access is available, refresh the
relevant snapshot from the repository root:

```text
npm run issues:sync -- 20
```

The sync command uses the read-only GitHub Issues API and needs network access.
If the command cannot connect, continue from the matching snapshot and record
the limitation in the implementation notes. Do not block a task merely because
browser discovery returned no connected browser.

Each snapshot includes its GitHub URL, state, and synchronization timestamp.

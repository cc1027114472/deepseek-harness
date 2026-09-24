# Agent Note: Persistent Git Branch Indicator on Conversation Hero and Header

Status: implemented

English | [中文](2026-09-24-git-branch-display.zh.md)

## Problem

Developers working inside the web client frequently need to know which Git branch their workspace is currently checked out on. Prior to this change, the UI provided no indication of the current Git branch anywhere in the conversation or composer views. Users had to repeatedly switch to a terminal to run `git branch`, creating friction and cognitive overhead when interacting across multiple branches or workspaces.

## Decision

1. **Native zero-process backend endpoint `/api/git-branch`**:
   Registered an exact HTTP route `/api/git-branch` in `packages/client/connection/src/index.ts`. It parses `.git/HEAD` directly through Node.js filesystem APIs (`resolveGitBranch`), resolving detached HEADs and worktree references without spawning subprocesses or risking permission issues on Windows.
2. **Dedicated `GitBranchChip` presentation component**:
   Implemented `GitBranchChip` under `packages/client/ui-conversation/src/client/skeleton/GitBranchChip.tsx` using `@deepseek-ai/dsh-client-ui-primitives`'s `IconBranchOutline16`. It adopts the standard 28px height rounded pill styling matching `WorkspaceChip` and `AgentPresetSeat`. Clicking the chip triggers an on-demand re-fetch, enabling instant refresh when branches change outside the browser.
3. **Dual placement in conversation flow**:
   - **Hero composer row**: Placed in `heroWorkspaceRow` right beside the `conversation.hero.agentPreset` slot above the main input composer.
   - **Active conversation header**: Mounted in `ConversationSessionHeader` inside `headerActions` so the active branch remains visible and clickable while chatting.

## Alternatives considered

- **Shell spawn (`git branch --show-current`)**:
  Spawning git as a child process introduces platform process creation latency (100–300ms on Windows) and risks `EPERM` issues under restricted host or sandbox policies. Direct reading of `.git/HEAD` completes in under 1ms with zero subprocess overhead.
- **Wire data projection on `WorkspaceView`**:
  Adding a `gitBranch` field to `WorkspaceView` would require modifying SQLite storage schemas and `apiproxy` schemas. Because Git branches are live, rapidly mutable host facts rather than durable workspace properties, an on-demand endpoint avoids unnecessary schema churn.

## Consequences

- The active Git branch is immediately visible above the composer on new session screens and in the session header during ongoing chats.
- Users can click the branch chip at any time to sample the latest branch state from disk.
- Non-git workspaces silently omit the chip without layout shifts or error notices.

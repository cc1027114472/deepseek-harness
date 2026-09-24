# Agent Note: Dual Directory Picker Buttons for Web Modal and Native Dialog

Status: implemented

English | [中文](2026-09-30-dual-directory-picker-buttons.zh.md)

## Problem

In the DeepSeek Harness Web GUI, workspace directory selection previously relied on `directory-picker-auto` to dynamically choose between the native OS folder dialog (`-native`) and the in-app web modal (`-browse`). Because only one backend and surface was mounted per boot, users could not access both interactions simultaneously. On local desktop sessions, clicking the directory button opened the OS file dialog directly, preventing users from browsing or creating folders inside the web GUI without leaving the browser. Conversely, in remote or non-display sessions, the native OS dialog was inaccessible. Users needed two independent buttons to explicitly choose between the in-app web modal and the native OS dialog.

## Decision

1. **Dual-capability browse backend**:
   Enhanced `@deepseek-ai/dsh-host-directory-picker-browse` by delegating `pick(signal)` to `pickNativeDirectory(signal)` from `@deepseek-ai/dsh-host-directory-picker-native`. This allows the browse backend to act as a complete superset serving both in-app directory listing/creation and native OS dialog invocation.
2. **API proxy capability allowance**:
   Updated `host.pickDirectory` in `packages/host/apiproxy/src/api-proxy.ts` to allow capabilities that define a `pick` method even when `capability.kind !== 'native'`, enabling seamless dispatch to `capability.pick(signal)`.
3. **Dual button presentation in sidebar**:
   In `packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx`, split the single workspace picker into two side-by-side action buttons:
   - **In-app web browser button** (`IconBrowseOutline16`): Opens `WorkspacePickFlow`, rendering the in-app `DirectoryBrowser` modal dialog for directory navigation and folder creation.
   - **Native OS dialog button** (`IconProjectAddOutline16`): Directly invokes `ctx.workspaces.pickDirectory()`, launching the OS-native folder chooser. On selection, it creates the workspace and starts the session; on cancellation, it exits silently. Any errors surface in a dedicated modal.

## Alternatives considered

- **Dropdown menu on a single add button**:
  Providing a popover or menu with "Open system dialog" and "Open web browser" choices adds an extra click to every directory selection action. Distinct icon buttons in the header actions offer direct, one-click access with clear tooltips.
- **Mounting both native and browse plugins simultaneously**:
  Cordis forbids multiple service registrations under the same service identifier (`directoryPicker`), throwing a duplicate-service error. Additionally, `sidebar.workspaces.directoryFlow` is a single-occupancy slot. Extending the browse backend to delegate `pick` maintains clean single-occupancy while offering full dual-capability support.

## Consequences

- Users can independently choose between the in-app web browser modal and the native OS file picker directly from the sidebar.
- Both operations cleanly create and activate the new workspace upon user selection.
- Host environments without a display or native chooser binary continue to run the web modal seamlessly, while native picker calls report clear diagnostic errors via the dedicated error modal.

# Git Pull Reminder

A smart VS Code extension that helps you stay synchronized with your Git repositories by automatically checking for remote commits and providing friendly reminders to pull changes.

## Features

- 🔄 **Automatic Checking**: Periodically checks for new commits on remote branches
- 📊 **Status Bar Integration**: Shows repository status directly in the status bar
- ⚙️ **Configurable Intervals**: Set your preferred check frequency (1-60 minutes)
- 🎯 **Smart Notifications**: Configurable notification levels (info, warning, error)
- 🚀 **One-Click Actions**: Pull changes or view diffs with a single click
- 🎛️ **Toggle Control**: Enable/disable auto-checking as needed
- 🌿 **Branch-Specific Monitoring**: Only watch specific branches with auto-detection of remote default
- 🧠 **Smart Timing**: Pauses checks when you're actively coding to avoid interruptions
- ⚠️ **Conflict Detection**: Warns about potential merge conflicts before pulling
- 📦 **Stash & Pull**: Automatically stash uncommitted changes when conflicts are detected
- 🔍 **Auto-Discovery**: Automatically detects and includes remote default branch in watch list

## Usage

### Commands

- **Git Pull Reminder: Check for Remote Commits** - Manually check for new commits
- **Git Pull Reminder: Pull Now** - Pull changes immediately
- **Git Pull Reminder: Toggle Auto Check** - Enable/disable automatic checking

### Status Bar

The extension adds a status indicator to your status bar showing:
- ✅ Repository is up to date
- 📥 Number of commits available to pull
- ⚠️ Warnings (no remote, no upstream branch)
- ❌ Errors (not a git repo, fetch failed)

Click the status bar item to manually check for updates.

## Configuration

Open VS Code settings and search for "Git Pull Reminder" to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| `gitPullReminder.checkInterval` | Check interval in minutes (1-60) | 5 |
| `gitPullReminder.autoCheck` | Enable automatic checking | true |
| `gitPullReminder.showStatusBar` | Show status in status bar | true |
| `gitPullReminder.notificationLevel` | Notification level (info/warning/error) | info |
| `gitPullReminder.watchedBranches` | Array of branch names to monitor (auto-detects remote default, empty = all branches) | ["main", "master", "develop"] |
| `gitPullReminder.smartTiming` | Pause checks when actively typing | true |
| `gitPullReminder.conflictDetection` | Check for potential merge conflicts | true |
| `gitPullReminder.gitTimeout` | Git command timeout in seconds (5-120) | 30 |

## Requirements

- VS Code 1.80.0 or higher
- Git installed and accessible from command line
- A Git repository with configured remote

## Installation

1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions view (Ctrl+Shift+X)
4. Click "..." menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

## Contributing

Found a bug or have a feature request? Please open an issue on the project repository.

## License

MIT License - see LICENSE file for details.

# Git Pull Reminder

A smart VS Code extension that helps you stay synchronized with your Git repositories by automatically checking for remote commits and providing friendly reminders to pull changes.

## Features

- 🔄 **Automatic Checking**: Periodically checks for new commits on remote branches
- 📊 **Status Bar Integration**: Shows repository status directly in the status bar
- ⚙️ **Configurable Intervals**: Set your preferred check frequency (1-60 minutes)
- 🎯 **Smart Notifications**: Configurable notification levels (info, warning, error)
- 🚀 **One-Click Actions**: Pull changes or view diffs with a single click
- 🎛️ **Toggle Control**: Enable/disable auto-checking as needed

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

## Release Notes

### 1.1.0

- Added status bar integration
- Configurable check intervals
- Better error handling and user feedback
- Multiple notification levels
- One-click pull functionality
- Toggle auto-check feature

### 1.0.0

- Initial release with basic pull reminder functionality

## Contributing

Found a bug or have a feature request? Please open an issue on the project repository.

## License

MIT License - see LICENSE file for details.
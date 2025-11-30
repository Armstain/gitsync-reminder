# Change Log



## [1.2.3] - 2025-11-30
### Added
- Refactored extension to use async/await for cleaner logic.
- New status bar display showing both incoming (↓) and outgoing (↑) commit counts.
- Smart timing logic retained for non‑intrusive checks.
- Improved conflict detection workflow.
- Added detailed notifications with optional snooze (future improvement).

### Fixed
- Correct handling of workspace path when no remote is configured.
- Minor UI text inconsistencies.

### Changed
- Updated internal command execution to use `util.promisify`.
- Streamlined configuration handling.

## [1.2.2] - 2025-09-24

### Changed
- **Ephemeral Notifications**: Info and warning notifications now appear as brief status-bar messages that auto-dismiss after 5 seconds to reduce persistent popups. Error messages remain persistent.

## [1.2.1] - 2024-09-24

### Changed
- **Improved Status Messages**: Updated status bar text to be more user-friendly and intuitive
  - "Up to date" → "All caught up" 
  - "Branch not watched" → "Not monitoring"
  - "3 commits" → "Pull 3 commits"
  - "3 commits (conflicts)" → "3 commits (conflicts ahead)"
  - "Checking..." → "Checking..." (with loading icon)
  - "Pulling..." → "Pulling changes..."

## [1.2.0] - 2024-09-24

### Added
- **Branch-Specific Monitoring**: Configure which branches to monitor with auto-detection of remote default branch
- **Smart Timing**: Automatically pause checks when actively coding to avoid interruptions
- **Conflict Detection**: Detect potential merge conflicts before suggesting pulls
- **Stash & Pull**: Automatically stash uncommitted changes when conflicts are detected
- **Auto-Discovery**: Automatically detect and include remote default branch in watch list
- **Cross-Platform Support**: Improved Git command execution for Windows compatibility
- **Configurable Timeouts**: Set Git command timeouts (5-120 seconds)
- **Memory Leak Prevention**: Proper cleanup of timers and event listeners
- **Enhanced Error Handling**: Better error messages and timeout handling

### Fixed
- **Windows Compatibility**: Fixed shell command issues with proper cross-platform Git commands
- **Memory Management**: Fixed potential memory leaks in activity tracking
- **Git Command Safety**: Added timeouts and proper error handling to prevent hanging
- **Resource Cleanup**: Proper disposal of VS Code resources in deactivate function

### Changed
- Improved remote default branch detection with fallback strategies
- Enhanced conflict detection using cross-platform Git merge-tree approach
- Better activity tracking with proper timeout management
- Upgraded version to 1.2.0 for significant feature additions

## [1.1.0] - 2024-09-24

### Added
- Status bar integration showing repository sync status
- Configurable check intervals (1-60 minutes)
- Multiple commands for better user control
- Configuration options for customization
- Better error handling and user feedback
- One-click pull functionality
- Toggle auto-check feature
- Smart notifications with configurable levels
- Initial repository check on startup

### Changed
- Improved activation event to `onStartupFinished` for better performance
- Enhanced notification messages with emojis and better descriptions
- Better command titles with proper categorization

### Fixed
- Proper error handling for non-git repositories
- Better handling of repositories without remotes
- Improved fetch error handling

## [1.0.0] - 2024-09-24

### Added
- Initial release
- Basic automatic checking for remote commits
- Simple notification system
- Manual check command
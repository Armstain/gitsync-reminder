# Change Log

All notable changes to the "Git Pull Reminder" extension will be documented in this file.

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
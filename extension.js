const vscode = require("vscode");
const { exec } = require("child_process");

let statusBarItem;
let autoCheckInterval;
let isAutoCheckEnabled = true;

function getConfig() {
  return vscode.workspace.getConfiguration('gitPullReminder');
}

function updateStatusBar(text, tooltip = '', color = '') {
  if (!statusBarItem) return;
  
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
  statusBarItem.color = color;
  statusBarItem.show();
}

function showNotification(message, level = 'info') {
  const config = getConfig();
  const notificationLevel = config.get('notificationLevel', 'info');
  
  if (level === 'error' || (level === 'warning' && notificationLevel !== 'error') || notificationLevel === 'info') {
    switch (level) {
      case 'error':
        vscode.window.showErrorMessage(message);
        break;
      case 'warning':
        vscode.window.showWarningMessage(message);
        break;
      default:
        vscode.window.showInformationMessage(message);
    }
  }
}

function checkForRemoteCommits(workspacePath, isManual = false) {
  if (!workspacePath) {
    if (isManual) {
      showNotification("No workspace folder found", 'error');
    }
    return;
  }

  if (isManual) {
    updateStatusBar("$(sync~spin) Checking...", "Checking for remote commits");
  }

  // First check if it's a git repository
  exec("git rev-parse --git-dir", { cwd: workspacePath }, (gitErr) => {
    if (gitErr) {
      if (isManual) {
        showNotification("This folder is not a Git repository", 'error');
        updateStatusBar("$(error) Not a Git repo", "This folder is not a Git repository", 'red');
      }
      return;
    }

    // Check if there's a remote configured
    exec("git remote", { cwd: workspacePath }, (remoteErr, remoteStdout) => {
      if (remoteErr || !remoteStdout.trim()) {
        if (isManual) {
          showNotification("No Git remote configured", 'warning');
          updateStatusBar("$(warning) No remote", "No Git remote configured", 'yellow');
        }
        return;
      }

      exec("git fetch", { cwd: workspacePath }, (fetchErr) => {
        if (fetchErr) {
          if (isManual) {
            showNotification("Failed to fetch from remote. Check your connection.", 'error');
            updateStatusBar("$(error) Fetch failed", "Failed to fetch from remote", 'red');
          }
          return;
        }

        exec("git rev-list HEAD..@{u} --count", { cwd: workspacePath }, (err, stdout) => {
          if (err) {
            if (isManual) {
              showNotification("Unable to check remote commits. Make sure you have an upstream branch.", 'warning');
              updateStatusBar("$(warning) No upstream", "No upstream branch configured", 'yellow');
            }
            return;
          }

          const count = parseInt(stdout.trim(), 10);
          if (count > 0) {
            const message = `🚨 Remote has ${count} new commit${count > 1 ? 's' : ''}. Pull now?`;
            updateStatusBar(`$(arrow-down) ${count} commit${count > 1 ? 's' : ''}`, `${count} new commit${count > 1 ? 's' : ''} available`, 'orange');
            
            vscode.window.showInformationMessage(
              message,
              "Pull Now", "View Changes", "Later"
            ).then(selection => {
              if (selection === "Pull Now") {
                pullChanges(workspacePath);
              } else if (selection === "View Changes") {
                vscode.commands.executeCommand('git.viewChanges');
              }
            });
          } else {
            if (isManual) {
              showNotification("✅ Repository is up to date!");
            }
            updateStatusBar("$(check) Up to date", "Repository is up to date", 'green');
          }
        });
      });
    });
  });
}

function pullChanges(workspacePath) {
  updateStatusBar("$(sync~spin) Pulling...", "Pulling changes from remote");
  
  exec("git pull", { cwd: workspacePath }, (err, stdout, stderr) => {
    if (err) {
      showNotification(`Failed to pull: ${stderr || err.message}`, 'error');
      updateStatusBar("$(error) Pull failed", "Failed to pull changes", 'red');
    } else {
      showNotification("✅ Successfully pulled changes!");
      updateStatusBar("$(check) Pulled", "Successfully pulled changes", 'green');
      
      // Reset to normal status after 3 seconds
      setTimeout(() => {
        updateStatusBar("$(repo) Git Pull Reminder", "Click to check for remote commits");
      }, 3000);
    }
  });
}

function setupAutoCheck(context) {
  const config = getConfig();
  const interval = config.get('checkInterval', 5) * 60 * 1000; // Convert minutes to milliseconds
  
  if (autoCheckInterval) {
    clearInterval(autoCheckInterval);
  }

  if (isAutoCheckEnabled && config.get('autoCheck', true)) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      autoCheckInterval = setInterval(() => {
        checkForRemoteCommits(workspacePath, false);
      }, interval);
    }
  }
}

function activate(context) {
  const config = getConfig();
  
  // Create status bar item
  if (config.get('showStatusBar', true)) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'gitPullReminder.checkCommits';
    updateStatusBar("$(repo) Git Pull Reminder", "Click to check for remote commits");
    context.subscriptions.push(statusBarItem);
  }

  // Register commands
  const checkCommand = vscode.commands.registerCommand("gitPullReminder.checkCommits", () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification("No workspace folder open.", 'error');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    checkForRemoteCommits(workspacePath, true);
  });

  const pullCommand = vscode.commands.registerCommand("gitPullReminder.pullNow", () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification("No workspace folder open.", 'error');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    pullChanges(workspacePath);
  });

  const toggleCommand = vscode.commands.registerCommand("gitPullReminder.toggleAutoCheck", () => {
    isAutoCheckEnabled = !isAutoCheckEnabled;
    const status = isAutoCheckEnabled ? 'enabled' : 'disabled';
    showNotification(`Auto-check ${status}`);
    setupAutoCheck(context);
  });

  context.subscriptions.push(checkCommand, pullCommand, toggleCommand);

  // Setup auto-check
  setupAutoCheck(context);

  // Listen for configuration changes
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('gitPullReminder')) {
      setupAutoCheck(context);
      
      // Update status bar visibility
      const showStatusBar = getConfig().get('showStatusBar', true);
      if (showStatusBar && !statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.command = 'gitPullReminder.checkCommits';
        updateStatusBar("$(repo) Git Pull Reminder", "Click to check for remote commits");
        context.subscriptions.push(statusBarItem);
      } else if (!showStatusBar && statusBarItem) {
        statusBarItem.hide();
      }
    }
  });

  context.subscriptions.push(configChangeListener);

  // Initial check after 5 seconds
  setTimeout(() => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      checkForRemoteCommits(workspacePath, false);
    }
  }, 5000);
}

function deactivate() {
  if (autoCheckInterval) {
    clearInterval(autoCheckInterval);
  }
}

module.exports = { activate, deactivate };

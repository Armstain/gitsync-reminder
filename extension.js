const vscode = require("vscode");
const { exec } = require("child_process");

let statusBarItem;
let autoCheckInterval;
let isAutoCheckEnabled = true;
let lastActivityTime = Date.now();
let isUserActive = false;

function getConfig() {
  return vscode.workspace.getConfiguration('gitPullReminder');
}

function execGitCommand(command, workspacePath, callback) {
  const config = getConfig();
  const timeout = config.get('gitTimeout', 30) * 1000; // Convert to milliseconds
  
  const options = {
    cwd: workspacePath,
    timeout: timeout,
    maxBuffer: 1024 * 1024, // 1MB buffer
    encoding: 'utf8'
  };
  
  exec(command, options, callback);
}

function updateStatusBar(text, tooltip = '', color = '') {
  if (!statusBarItem) return;
  
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
  statusBarItem.color = color;
  statusBarItem.show();
}

function showNotification(message, level = 'info', timeoutMs = 5000) {
  const config = getConfig();
  const notificationLevel = config.get('notificationLevel', 'info');

  const shouldShow =
    level === 'error' ||
    (level === 'warning' && notificationLevel !== 'error') ||
    notificationLevel === 'info';

  if (!shouldShow) return;

  // Keep errors as persistent popups
  if (level === 'error') {
    vscode.window.showErrorMessage(message);
    return;
  }

  // For info/warning, show an ephemeral status bar message that auto-dismisses
  // This avoids long-lived popup notifications while still informing the user.
  try {
    vscode.window.setStatusBarMessage(message, timeoutMs);
  } catch (e) {
    // Fallback to an information message if setStatusBarMessage is unavailable
    vscode.window.showInformationMessage(message);
  }
}

function checkForRemoteCommits(workspacePath, isManual = false) {
  if (!workspacePath) {
    if (isManual) {
      showNotification("No workspace folder found", 'error');
    }
    return;
  }

  const config = getConfig();
  
  // Smart timing - skip if user is actively typing (unless manual)
  if (!isManual && config.get('smartTiming', true) && isUserActive) {
    const timeSinceActivity = Date.now() - lastActivityTime;
    if (timeSinceActivity < 30000) { // Skip if activity in last 30 seconds
      return;
    }
  }

  if (isManual) {
    updateStatusBar("$(loading~spin) Checking...", "Checking for remote commits");
  }

  // First check if it's a git repository
  execGitCommand("git rev-parse --git-dir", workspacePath, (gitErr) => {
    if (gitErr) {
      if (isManual) {
        showNotification("This folder is not a Git repository", 'error');
        updateStatusBar("$(error) Not a Git repo", "This folder is not a Git repository", 'red');
      }
      return;
    }

    // Check if there's a remote configured
    execGitCommand("git remote", workspacePath, (remoteErr, remoteStdout) => {
      if (remoteErr || !remoteStdout.trim()) {
        if (isManual) {
          showNotification("No Git remote configured", 'warning');
          updateStatusBar("$(warning) No remote", "No Git remote configured", 'yellow');
        }
        return;
      }

      execGitCommand("git fetch", workspacePath, (fetchErr) => {
        if (fetchErr) {
          if (isManual) {
            showNotification("Failed to fetch from remote. Check your connection.", 'error');
            updateStatusBar("$(error) Fetch failed", "Failed to fetch from remote", 'red');
          }
          return;
        }

        // Check if current branch should be watched
        execGitCommand("git branch --show-current", workspacePath, (branchErr, branchStdout) => {
          if (branchErr) {
            if (isManual) {
              showNotification("Unable to determine current branch", 'warning');
            }
            return;
          }

          const currentBranch = branchStdout.trim();
          let watchedBranches = config.get('watchedBranches', ['main', 'master', 'develop']);
          
          // Auto-detect remote default branch and add to watched list if using defaults
          if (JSON.stringify(watchedBranches) === JSON.stringify(['main', 'master', 'develop'])) {
            // Try to get remote default branch (cross-platform approach)
            execGitCommand("git symbolic-ref refs/remotes/origin/HEAD", workspacePath, (symbolicErr, symbolicStdout) => {
              if (!symbolicErr && symbolicStdout.trim()) {
                const remoteDefault = symbolicStdout.trim().replace('refs/remotes/origin/', '');
                if (remoteDefault && !watchedBranches.includes(remoteDefault)) {
                  watchedBranches = [...watchedBranches, remoteDefault];
                  // Automatically update the config to persist this change
                  config.update('watchedBranches', watchedBranches, vscode.ConfigurationTarget.Workspace);
                  showNotification(` Now monitoring '${remoteDefault}' (auto-detected default branch)`, 'info');
                }
                checkBranchAndContinue(currentBranch, watchedBranches, workspacePath, isManual);
              } else {
                // Fallback: try git remote show origin
                execGitCommand("git remote show origin", workspacePath, (remoteShowErr, remoteShowStdout) => {
                  if (!remoteShowErr && remoteShowStdout) {
                    const headBranchMatch = remoteShowStdout.match(/HEAD branch:\s*(\S+)/);
                    if (headBranchMatch && headBranchMatch[1] && !watchedBranches.includes(headBranchMatch[1])) {
                      watchedBranches = [...watchedBranches, headBranchMatch[1]];
                      // Automatically update the config to persist this change
                      config.update('watchedBranches', watchedBranches, vscode.ConfigurationTarget.Workspace);
                      showNotification(` Now monitoring '${headBranchMatch[1]}' (auto-detected default branch)`, 'info');
                    }
                  }
                  checkBranchAndContinue(currentBranch, watchedBranches, workspacePath, isManual);
                });
              }
            });
          } else {
            checkBranchAndContinue(currentBranch, watchedBranches, workspacePath, isManual);
          }
        });
      });
    });
  });
}

function checkBranchAndContinue(currentBranch, watchedBranches, workspacePath, isManual) {
  const config = getConfig();
  
  if (watchedBranches.length > 0 && !watchedBranches.includes(currentBranch)) {
    if (isManual) {
      vscode.window.showInformationMessage(
        `Branch '${currentBranch}' is not being monitored. Currently watching: ${watchedBranches.join(', ')}`,
        "Add This Branch", "Settings"
      ).then(selection => {
        if (selection === "Add This Branch") {
          const newWatchedBranches = [...watchedBranches, currentBranch];
          config.update('watchedBranches', newWatchedBranches, vscode.ConfigurationTarget.Workspace);
          showNotification(`Now monitoring branch '${currentBranch}'`, 'info');
          // Re-run the check now that the branch is watched
          setTimeout(() => checkForRemoteCommits(workspacePath, false), 1000);
        } else if (selection === "Settings") {
          vscode.commands.executeCommand('workbench.action.openSettings', 'gitPullReminder.watchedBranches');
        }
      });
      updateStatusBar("$(bell-slash) Not monitoring", `Branch '${currentBranch}' is not in watched list`);
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
      // Conflict detection before suggesting pull
      if (config.get('conflictDetection', true)) {
        checkForPotentialConflicts(workspacePath, count, isManual);
      } else {
        showPullNotification(count, workspacePath);
      }
    } else {
      if (isManual) {
        showNotification(" Repository is up to date!");
      }
      updateStatusBar("$(check) All caught up", "Repository is up to date");
    }
  });
}

function checkForPotentialConflicts(workspacePath, commitCount, isManual) {
  // Check for uncommitted changes
  exec("git status --porcelain", { cwd: workspacePath }, (statusErr, statusStdout) => {
    const hasUncommittedChanges = statusStdout && statusStdout.trim().length > 0;
    
    if (hasUncommittedChanges) {
      // Check for potential conflicts with cross-platform approach
      exec("git merge-base HEAD @{u}", { cwd: workspacePath }, (baseErr, baseStdout) => {
        if (baseErr) {
          // If we can't get merge base, just show pull notification
          showPullNotification(commitCount, workspacePath);
          return;
        }
        
        const mergeBase = baseStdout.trim();
        exec(`git merge-tree ${mergeBase} HEAD @{u}`, { cwd: workspacePath }, (mergeErr, mergeStdout) => {
          const hasConflicts = mergeStdout && mergeStdout.trim().length > 0;
          
          if (hasConflicts) {
            const message = ` ${commitCount} new commit${commitCount > 1 ? 's' : ''} available, but potential conflicts detected!`;
            updateStatusBar(`$(alert) ${commitCount} commit${commitCount > 1 ? 's' : ''} (conflicts ahead)`, `${commitCount} new commit${commitCount > 1 ? 's' : ''} with potential conflicts`, 'yellow');
            
            vscode.window.showWarningMessage(
              message,
              "Stash & Pull", "View Changes", "Pull Anyway", "Later"
            ).then(selection => {
              if (selection === "Stash & Pull") {
                stashAndPull(workspacePath);
              } else if (selection === "View Changes") {
                vscode.commands.executeCommand('git.viewChanges');
              } else if (selection === "Pull Anyway") {
                pullChanges(workspacePath);
              }
            });
          } else {
            showPullNotification(commitCount, workspacePath);
          }
        });
      });
    } else {
      showPullNotification(commitCount, workspacePath);
    }
  });
}

function showPullNotification(commitCount, workspacePath) {
  const message = ` Remote has ${commitCount} new commit${commitCount > 1 ? 's' : ''}. Pull now?`;
  updateStatusBar(`$(download) Pull ${commitCount} commit${commitCount > 1 ? 's' : ''}`, `${commitCount} new commit${commitCount > 1 ? 's' : ''} available`, 'orange');
  
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
}

function stashAndPull(workspacePath) {
  updateStatusBar("$(download~spin) Stashing & Pulling...", "Stashing changes and pulling from remote");
  
  exec("git stash push -m 'Auto-stash before pull'", { cwd: workspacePath }, (stashErr) => {
    if (stashErr) {
      showNotification(`Failed to stash: ${stashErr.message}`, 'error');
      updateStatusBar("$(error) Stash failed", "Failed to stash changes", 'red');
      return;
    }
    
    exec("git pull", { cwd: workspacePath }, (pullErr, pullStdout, pullStderr) => {
      if (pullErr) {
        showNotification(`Failed to pull: ${pullStderr || pullErr.message}`, 'error');
        updateStatusBar("$(error) Pull failed", "Failed to pull changes", 'red');
        
        // Try to restore stash
        exec("git stash pop", { cwd: workspacePath }, () => {});
      } else {
        showNotification(" Successfully stashed and pulled changes!");
        updateStatusBar("$(check) Stashed & Pulled", "Successfully stashed and pulled changes", 'green');
        
        // Ask if user wants to restore stash
        vscode.window.showInformationMessage(
          "Changes stashed and pull completed. Restore stashed changes?",
          "Restore", "Keep Stashed"
        ).then(selection => {
          if (selection === "Restore") {
            exec("git stash pop", { cwd: workspacePath }, (popErr) => {
              if (popErr) {
                showNotification(" Couldn't auto-restore stash. Check for conflicts.", 'warning');
              } else {
                showNotification(" Stashed changes restored!");
              }
            });
          }
        });
        
        // Reset to normal status after 5 seconds
        setTimeout(() => {
          updateStatusBar("$(repo) Git Pull Reminder", "Click to check for remote commits");
        }, 5000);
      }
    });
  });
}

function pullChanges(workspacePath) {
  updateStatusBar("$(download~spin) Pulling changes...", "Pulling changes from remote");
  
  exec("git pull", { cwd: workspacePath }, (err, stdout, stderr) => {
    if (err) {
      showNotification(`Failed to pull: ${stderr || err.message}`, 'error');
      updateStatusBar("$(error) Pull failed", "Failed to pull changes", 'red');
    } else {
      showNotification(" Successfully pulled changes!");
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

  // Activity tracking for smart timing
  let activityTimeout;
  
  const activityTracker = vscode.workspace.onDidChangeTextDocument(() => {
    lastActivityTime = Date.now();
    isUserActive = true;
    
    // Clear existing timeout to prevent memory leaks
    if (activityTimeout) {
      clearTimeout(activityTimeout);
    }
    
    // Reset activity flag after 60 seconds of inactivity
    activityTimeout = setTimeout(() => {
      if (Date.now() - lastActivityTime >= 60000) {
        isUserActive = false;
      }
    }, 60000);
  });

  const focusTracker = vscode.window.onDidChangeWindowState((state) => {
    if (state.focused) {
      lastActivityTime = Date.now();
      isUserActive = true;
    }
  });

  context.subscriptions.push(activityTracker, focusTracker);

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
  
  // Clean up status bar item
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  
  // Reset state variables
  isAutoCheckEnabled = true;
  isUserActive = false;
}

module.exports = { activate, deactivate };

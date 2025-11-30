const vscode = require("vscode");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

let statusBarItem;
let autoCheckInterval;
let isAutoCheckEnabled = true;
let lastActivityTime = Date.now();
let isUserActive = false;

function getConfig() {
  return vscode.workspace.getConfiguration('gitPullReminder');
}

/**
 * Executes a git command using async/await.
 * @param {string} command 
 * @param {string} workspacePath 
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function execGitCommand(command, workspacePath) {
  const config = getConfig();
  const timeout = config.get('gitTimeout', 30) * 1000;

  const options = {
    cwd: workspacePath,
    timeout: timeout,
    maxBuffer: 1024 * 1024, // 1MB buffer
    encoding: 'utf8'
  };

  return exec(command, options);
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

  if (level === 'error') {
    vscode.window.showErrorMessage(message);
    return;
  }

  try {
    vscode.window.setStatusBarMessage(message, timeoutMs);
  } catch (e) {
    vscode.window.showInformationMessage(message);
  }
}

async function checkForRemoteCommits(workspacePath, isManual = false) {
  if (!workspacePath) {
    if (isManual) showNotification("No workspace folder found", 'error');
    return;
  }

  const config = getConfig();

  if (!isManual && config.get('smartTiming', true) && isUserActive) {
    const timeSinceActivity = Date.now() - lastActivityTime;
    if (timeSinceActivity < 30000) return;
  }

  if (isManual) {
    updateStatusBar("$(loading~spin) Checking...", "Checking for remote commits");
  }

  try {
    // 1. Check if it's a git repo
    try {
      await execGitCommand("git rev-parse --git-dir", workspacePath);
    } catch (err) {
      if (isManual) {
        showNotification("This folder is not a Git repository", 'error');
        updateStatusBar("$(error) Not a Git repo", "This folder is not a Git repository", 'red');
      }
      return;
    }

    // 2. Check for remote
    try {
      const { stdout: remoteStdout } = await execGitCommand("git remote", workspacePath);
      if (!remoteStdout.trim()) throw new Error("No remote");
    } catch (err) {
      if (isManual) {
        showNotification("No Git remote configured", 'warning');
        updateStatusBar("$(warning) No remote", "No Git remote configured", 'yellow');
      }
      return;
    }

    // 3. Fetch
    try {
      await execGitCommand("git fetch", workspacePath);
    } catch (err) {
      if (isManual) {
        showNotification("Failed to fetch from remote. Check your connection.", 'error');
        updateStatusBar("$(error) Fetch failed", "Failed to fetch from remote", 'red');
      }
      return;
    }

    // 4. Get current branch
    let currentBranch;
    try {
      const { stdout } = await execGitCommand("git branch --show-current", workspacePath);
      currentBranch = stdout.trim();
    } catch (err) {
      if (isManual) showNotification("Unable to determine current branch", 'warning');
      return;
    }

    // 5. Handle Watched Branches & Auto-detection
    let watchedBranches = config.get('watchedBranches', ['main', 'master', 'develop']);
    const isDefaultConfig = JSON.stringify(watchedBranches) === JSON.stringify(['main', 'master', 'develop']);

    if (isDefaultConfig) {
      const detectedDefault = await detectDefaultBranch(workspacePath);
      if (detectedDefault) {
        const autoAdd = config.get('autoAddDetectedDefaultBranch', true);
        if (autoAdd && !watchedBranches.includes(detectedDefault)) {
          watchedBranches = [...watchedBranches, detectedDefault];
          await config.update('watchedBranches', watchedBranches, vscode.ConfigurationTarget.Workspace);
          showNotification(`Now monitoring '${detectedDefault}' (auto-detected)`, 'info');
        }
      }
    }

    // 6. Check status
    await checkBranchStatus(currentBranch, watchedBranches, workspacePath, isManual);

  } catch (error) {
    console.error("Git Pull Reminder Error:", error);
    if (isManual) showNotification(`Error: ${error.message}`, 'error');
  }
}

async function detectDefaultBranch(workspacePath) {
  try {
    // Try getting origin/HEAD
    const { stdout: branchesStdout } = await execGitCommand("git branch -r", workspacePath);
    const lines = branchesStdout.split(/\r?\n/).map(l => l.trim());
    for (const line of lines) {
      const match = line.match(/origin\/HEAD\s*->\s*origin\/(\S+)/);
      if (match && match[1]) return match[1];
    }

    // Fallback: git remote show origin
    const { stdout: remoteShowStdout } = await execGitCommand("git remote show origin", workspacePath);
    const headMatch = remoteShowStdout.match(/HEAD branch:\s*(\S+)/);
    if (headMatch && headMatch[1]) return headMatch[1];

  } catch (e) {
    // Ignore errors during detection
  }
  return null;
}

async function checkBranchStatus(currentBranch, watchedBranches, workspacePath, isManual) {
  const config = getConfig();

  if (watchedBranches.length > 0 && !watchedBranches.includes(currentBranch)) {
    if (isManual) {
      const selection = await vscode.window.showInformationMessage(
        `Branch '${currentBranch}' is not being monitored.`,
        "Add This Branch", "Settings"
      );

      if (selection === "Add This Branch") {
        const newWatchedBranches = [...watchedBranches, currentBranch];
        await config.update('watchedBranches', newWatchedBranches, vscode.ConfigurationTarget.Workspace);
        showNotification(`Now monitoring branch '${currentBranch}'`, 'info');
        setTimeout(() => checkForRemoteCommits(workspacePath, false), 1000);
      } else if (selection === "Settings") {
        vscode.commands.executeCommand('workbench.action.openSettings', 'gitPullReminder.watchedBranches');
      }
      updateStatusBar("$(bell-slash) Not monitoring", `Branch '${currentBranch}' is not in watched list`);
    }
    return;
  }

  // Check Ahead/Behind counts
  // Returns: "behind_count\tahead_count" (e.g. "2\t0")
  try {
    const { stdout } = await execGitCommand("git rev-list --left-right --count HEAD...@{u}", workspacePath);
    const [behind, ahead] = stdout.trim().split(/\s+/).map(n => parseInt(n, 10));

    if (behind > 0) {
      // Incoming commits available
      if (config.get('conflictDetection', true)) {
        await checkForPotentialConflicts(workspacePath, behind, ahead, isManual);
      } else {
        showPullNotification(behind, ahead, workspacePath);
      }
    } else if (ahead > 0) {
      // Only outgoing changes
      updateStatusBar(`$(arrow-up) ${ahead} Pending Push`, `${ahead} commit(s) ready to push`, 'white');
      if (isManual) showNotification("Repository is ahead of remote. Don't forget to push!");
    } else {
      // Up to date
      updateStatusBar("$(check) Synced", "Repository is up to date");
      if (isManual) showNotification("Repository is up to date!");
    }

  } catch (err) {
    if (isManual) {
      showNotification("Unable to check commits. No upstream configured?", 'warning');
      updateStatusBar("$(warning) No upstream", "No upstream branch configured", 'yellow');
    }
  }
}

async function checkForPotentialConflicts(workspacePath, behindCount, aheadCount, isManual) {
  try {
    // Check for uncommitted changes
    const { stdout: statusStdout } = await execGitCommand("git status --porcelain", workspacePath);
    const hasUncommittedChanges = statusStdout && statusStdout.trim().length > 0;

    if (hasUncommittedChanges) {
      // Check for conflicts
      const { stdout: baseStdout } = await execGitCommand("git merge-base HEAD @{u}", workspacePath);
      const mergeBase = baseStdout.trim();

      const { stdout: mergeStdout } = await execGitCommand(`git merge-tree ${mergeBase} HEAD @{u}`, workspacePath);
      const hasConflicts = mergeStdout && mergeStdout.trim().length > 0;

      if (hasConflicts) {
        updateStatusBar(`$(alert) ${behindCount}↓ ${aheadCount}↑ (Conflicts)`, `${behindCount} incoming commits with potential conflicts`, 'yellow');

        const selection = await vscode.window.showWarningMessage(
          `${behindCount} new commit(s) available, but potential conflicts detected!`,
          "Stash & Pull", "View Changes", "Pull Anyway", "Later"
        );

        if (selection === "Stash & Pull") await stashAndPull(workspacePath);
        else if (selection === "View Changes") vscode.commands.executeCommand('git.viewChanges');
        else if (selection === "Pull Anyway") await pullChanges(workspacePath);

        return;
      }
    }

    // No conflicts detected
    showPullNotification(behindCount, aheadCount, workspacePath);

  } catch (e) {
    // Fallback if conflict check fails
    showPullNotification(behindCount, aheadCount, workspacePath);
  }
}

function showPullNotification(behind, ahead, workspacePath) {
  const aheadText = ahead > 0 ? ` (+${ahead} to push)` : '';
  const message = `Remote has ${behind} new commit(s)${aheadText}. Pull now?`;

  // Status bar shows both arrows: ↓ 2 ↑ 1
  updateStatusBar(`$(arrow-down) ${behind} $(arrow-up) ${ahead}`, `${behind} incoming, ${ahead} outgoing`, 'orange');

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

async function stashAndPull(workspacePath) {
  updateStatusBar("$(sync~spin) Stashing & Pulling...", "Stashing changes and pulling from remote");

  try {
    await execGitCommand("git stash push -m 'Auto-stash before pull'", workspacePath);

    try {
      await execGitCommand("git pull", workspacePath);
      showNotification("Successfully stashed and pulled changes!");
      updateStatusBar("$(check) Stashed & Pulled", "Successfully stashed and pulled changes", 'green');

      const selection = await vscode.window.showInformationMessage(
        "Changes stashed and pull completed. Restore stashed changes?",
        "Restore", "Keep Stashed"
      );

      if (selection === "Restore") {
        try {
          await execGitCommand("git stash pop", workspacePath);
          showNotification("Stashed changes restored!");
        } catch (popErr) {
          showNotification("Couldn't auto-restore stash. Check for conflicts.", 'warning');
        }
      }
    } catch (pullErr) {
      showNotification(`Failed to pull: ${pullErr.message}`, 'error');
      updateStatusBar("$(error) Pull failed", "Failed to pull changes", 'red');
      // Try to restore stash since pull failed
      await execGitCommand("git stash pop", workspacePath).catch(() => { });
    }
  } catch (stashErr) {
    showNotification(`Failed to stash: ${stashErr.message}`, 'error');
    updateStatusBar("$(error) Stash failed", "Failed to stash changes", 'red');
  }

  setTimeout(() => {
    updateStatusBar("$(repo) Git Pull Reminder", "Click to check for remote commits");
  }, 5000);
}

async function pullChanges(workspacePath) {
  updateStatusBar("$(sync~spin) Pulling changes...", "Pulling changes from remote");

  try {
    await execGitCommand("git pull", workspacePath);
    showNotification("Successfully pulled changes!");
    updateStatusBar("$(check) Pulled", "Successfully pulled changes", 'green');
  } catch (err) {
    showNotification(`Failed to pull: ${err.message}`, 'error');
    updateStatusBar("$(error) Pull failed", "Failed to pull changes", 'red');
  }

  setTimeout(() => {
    updateStatusBar("$(repo) Git Pull Reminder", "Click to check for remote commits");
  }, 3000);
}

function setupAutoCheck(context) {
  const config = getConfig();
  const interval = config.get('checkInterval', 5) * 60 * 1000;

  if (autoCheckInterval) clearInterval(autoCheckInterval);

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

  if (config.get('showStatusBar', true)) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'gitPullReminder.checkCommits';
    updateStatusBar("$(repo) Git Pull Reminder", "Click to check for remote commits");
    context.subscriptions.push(statusBarItem);
  }

  const checkCommand = vscode.commands.registerCommand("gitPullReminder.checkCommits", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification("No workspace folder open.", 'error');
      return;
    }
    await checkForRemoteCommits(workspaceFolders[0].uri.fsPath, true);
  });

  const pullCommand = vscode.commands.registerCommand("gitPullReminder.pullNow", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification("No workspace folder open.", 'error');
      return;
    }
    await pullChanges(workspaceFolders[0].uri.fsPath);
  });

  const toggleCommand = vscode.commands.registerCommand("gitPullReminder.toggleAutoCheck", () => {
    isAutoCheckEnabled = !isAutoCheckEnabled;
    const status = isAutoCheckEnabled ? 'enabled' : 'disabled';
    showNotification(`Auto-check ${status}`);
    setupAutoCheck(context);
  });

  context.subscriptions.push(checkCommand, pullCommand, toggleCommand);
  setupAutoCheck(context);

  const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('gitPullReminder')) {
      setupAutoCheck(context);
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

  let activityTimeout;
  const activityTracker = vscode.workspace.onDidChangeTextDocument(() => {
    lastActivityTime = Date.now();
    isUserActive = true;
    if (activityTimeout) clearTimeout(activityTimeout);
    activityTimeout = setTimeout(() => {
      if (Date.now() - lastActivityTime >= 60000) isUserActive = false;
    }, 60000);
  });

  const focusTracker = vscode.window.onDidChangeWindowState((state) => {
    if (state.focused) {
      lastActivityTime = Date.now();
      isUserActive = true;
    }
  });

  context.subscriptions.push(activityTracker, focusTracker);

  setTimeout(() => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      checkForRemoteCommits(workspaceFolders[0].uri.fsPath, false);
    }
  }, 5000);
}

function deactivate() {
  if (autoCheckInterval) clearInterval(autoCheckInterval);
  if (statusBarItem) statusBarItem.dispose();
  isAutoCheckEnabled = true;
  isUserActive = false;
}

module.exports = { activate, deactivate };

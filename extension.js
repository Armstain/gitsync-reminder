const vscode = require("vscode");
const { exec } = require("child_process");

function checkForRemoteCommits(workspacePath) {
  if (!workspacePath) return;

  exec("git fetch", { cwd: workspacePath }, (fetchErr) => {
    if (fetchErr) return;

    exec("git rev-list HEAD..@{u} --count", { cwd: workspacePath }, (err, stdout) => {
      if (err) return;

      const count = parseInt(stdout.trim(), 10);
      if (count > 0) {
        vscode.window.showInformationMessage(
          `🚨 Remote has ${count} new commit(s). Pull now?`,
          "Yes", "Later"
        ).then(selection => {
          if (selection === "Yes") {
            exec("git pull", { cwd: workspacePath });
          }
        });
      }
    });
  });
}

function activate(context) {
  let disposable = vscode.commands.registerCommand("gitPullReminder.checkCommits", () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    checkForRemoteCommits(workspacePath);
  });

  context.subscriptions.push(disposable);

  // Auto check every 5 minutes
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    const workspacePath = workspaceFolders[0].uri.fsPath;
    setInterval(() => checkForRemoteCommits(workspacePath), 5 * 60 * 1000);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };

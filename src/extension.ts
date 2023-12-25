// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as cp from "child_process";

const ID = "rr-vs-code-extension";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const extOutput = vscode.window.createOutputChannel(ID);
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  extOutput.appendLine(`Activated ${ID}`);

  const shell = getConfiguredShell(extOutput);

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(`${ID}.helloWorld`, () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    vscode.window.showInformationMessage(`Hello World from ${ID}!`);
  });

  context.subscriptions.push(disposable);

  const gitStatusSub = vscode.commands.registerCommand(
    `${ID}.showConfiguredShell`,
    () => {
      extOutput.show();
      cp.exec('echo "$SHELL"', (error, stdout, stderr) => {
        extOutput.show();
        console.log(error, stderr, stdout);
        if (error) {
          extOutput.appendLine(error.message);
        }
        if (stdout) {
          extOutput.appendLine(stdout);
        }
        if (stderr) {
          extOutput.appendLine(stderr);
        }
      });
    }
  );

  context.subscriptions.push(gitStatusSub);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function getConfiguredShell(extOutput: vscode.OutputChannel): string | void {
  cp.exec('echo "$SHELL"', (error, stdout, stderr) => {
    if (error || stderr) {
      const errorStr = error ? `${error.name}: ${error.message}` : stderr;
      extOutput.appendLine(errorStr);
      return;
    }
    return stdout.trim();
  });
}

function shouldBail(
  extOutput: vscode.OutputChannel,
  shellLocation: string | undefined
): boolean {
  if (!shellLocation) {
    extOutput.appendLine(
      'Could not get a configured shell location, ensure that `echo "$SHELL"` returns a valid binary.'
    );
    return true;
  }
  return false;
}

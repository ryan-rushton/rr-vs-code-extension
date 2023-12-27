// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as cp from "child_process";
import { promisify } from "util";
import { text } from "stream/consumers";
import * as path from "path";

const ID = "rr-vs-code-extension";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const extOutput = vscode.window.createOutputChannel(ID);

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  extOutput.appendLine(`Activated ${ID}`);

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let helloWorldDisposable = vscode.commands.registerCommand(
    `${ID}.helloWorld`,
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage(`Hello World from ${ID}!`);
    }
  );

  const showConfiguredShellDisposable = vscode.commands.registerCommand(
    `${ID}.showConfiguredShell`,
    async () => {
      extOutput.show();
      try {
        const { stderr, stdout } = await createProcess('echo "$SHELL"');
        extOutput.show();
        console.log(stderr, stdout);
        if (stdout) {
          extOutput.appendLine(stdout);
        }
        if (stderr) {
          extOutput.appendLine(stderr);
        }
      } catch (e: unknown) {
        if (e instanceof Error) {
          console.error(e);
          extOutput.appendLine(`Error: ${e.message}`);
        }
      }
    }
  );

  const grepDisposable = vscode.commands.registerCommand(
    `${ID}.grepForSymbol`,
    async () => {
      extOutput.show();
      const highlighted = getHighlightedText();
      if (!highlighted) {
        extOutput.appendLine(`No highlighted text: ${highlighted}`);
        return;
      }
      extOutput.appendLine(`Grepping for symbol ${highlighted}`);
      try {
        const { stderr, stdout } = await createProcess(
          `git grep -rin ${highlighted}`
        );
        console.log(stderr, stdout);
        if (stdout) {
          if (stdout.trim().length === 0) {
            extOutput.appendLine(`Found no occurrences of: ${highlighted}`);
            return;
          }
          const lines = stdout.trim().split("\n").filter(Boolean);
          const items: {
            file: string;
            ln: number;
            start: number;
            end: number;
            text: string;
          }[] = [];
          for (const line of lines) {
            console.log(line);
            const [file, ln, ...rest] = line.split(":");
            const text = rest.join(":");
            const start = text.indexOf(highlighted);
            const end = start + highlighted.length;
            extOutput.appendLine(`${file}:${ln}:${start}:${end}`);
            items.push({
              file,
              ln: parseInt(ln),
              start,
              end,
              text,
            });
          }
          const rootPath =
            vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders.length > 0
              ? vscode.workspace.workspaceFolders[0].uri.fsPath
              : undefined;
          vscode.window.createTreeView("rrGrepView", {
            treeDataProvider: new GitGrepProvider(rootPath, items),
          });
        }
        if (stderr) {
          extOutput.appendLine(stderr);
        }
      } catch (e: unknown) {
        console.log(e);
        if (e instanceof Error) {
          console.error(e);
          extOutput.appendLine(`Error: ${e.message}`);
        }
      }
    }
  );

  context.subscriptions.push(
    helloWorldDisposable,
    showConfiguredShellDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}

function createProcess(command: string) {
  const config = vscode.workspace.getConfiguration("rr");
  const shellPath = config.get("shellPath");
  const shellConfig = config.get("shellProfile");

  if (!shellPath || typeof shellPath !== "string") {
    vscode.window.showWarningMessage(
      "Could not get a configured shell location. Please set a shell path in settings (rr.shellPath)"
    );
    return Promise.resolve({ stderr: undefined, stdout: undefined });
  }

  let sourcedCommand = command;
  if (shellConfig && typeof shellConfig === "string") {
    sourcedCommand = `source ${shellConfig}; ${command}`;
  }

  const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
  if (!workspaceUri) {
    vscode.window.showWarningMessage("There is no workspace folder open");
    return Promise.resolve({ stderr: undefined, stdout: undefined });
  }

  const cwd =
    typeof workspaceUri === "string" ? workspaceUri : workspaceUri.fsPath;

  console.log(`Running command: ${sourcedCommand}, in directory ${cwd}`);
  return promisify(cp.exec)(sourcedCommand, { shell: shellPath, cwd });
}

function getHighlightedText() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }
  const selection = editor?.selection;
  const selectionRange = new vscode.Range(
    selection.start.line,
    selection.start.character,
    selection.end.line,
    selection.end.character
  );
  return editor.document.getText(selectionRange);
}

export class GitGrepProvider implements vscode.TreeDataProvider<GitGrepItem> {
  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly items: {
      file: string;
      ln: number;
      start: number;
      end: number;
      text: string;
    }[]
  ) {}

  getTreeItem(element: GitGrepItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: GitGrepItem): Thenable<GitGrepItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage("No grepping in empty workspace");
      return Promise.resolve([]);
    }

    // workspace root
    if (!element) {
      return Promise.resolve(
        this.items.map(
          (i) =>
            new GitGrepItem(
              path.join(this.workspaceRoot!, i.file),
              i.ln,
              i.start,
              i.end,
              i.text,
              vscode.TreeItemCollapsibleState.None
            )
        )
      );
    }

    return Promise.resolve([]);
  }
}

class GitGrepItem extends vscode.TreeItem {
  constructor(
    public readonly file: string,
    public readonly ln: number,
    public readonly start: number,
    public readonly end: number,
    public readonly text: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    const uri = vscode.Uri.file(file);
    super(uri, collapsibleState);

    if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
      this.command = {
        title: `Open ${file}`,
        command: `vscode.openWith`,
        arguments: [
          uri,
          "viewId",
          {
            selection: new vscode.Range(
              new vscode.Position(ln - 1, start),
              new vscode.Position(ln - 1, end)
            ),
          },
        ],
      };
    }
  }
}

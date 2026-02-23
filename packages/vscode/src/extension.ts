// VS Code Extension entry point (ТЗ §7)
import * as vscode from 'vscode';
import { QueryWebViewProvider } from './webview/webview-provider.js';

let provider: QueryWebViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  provider = new QueryWebViewProvider(context);

  // Register WebView provider for .1cquery files
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      '1c-query.queryConstructor',
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Command: Open Query Constructor for current editor text
  context.subscriptions.push(
    vscode.commands.registerCommand('1c-query.openConstructor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      const text = editor.document.getText();
      await provider!.openForText(text, editor.document.uri);
    }),
  );

  // Command: Parse query and show model JSON
  context.subscriptions.push(
    vscode.commands.registerCommand('1c-query.parseQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.document.getText();
      const doc = await vscode.workspace.openTextDocument({
        content: 'Parsing query... (core not loaded yet)',
        language: 'json',
      });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
    }),
  );

  // Command: Format query
  context.subscriptions.push(
    vscode.commands.registerCommand('1c-query.formatQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      vscode.window.showInformationMessage('Query formatting will be available after core is loaded');
    }),
  );
}

export function deactivate(): void {
  provider = undefined;
}

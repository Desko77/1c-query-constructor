// State synchronization between WebView and Editor (ТЗ §7.2)
import * as vscode from 'vscode';
import type { WebViewToHostMessage, ExtensionSettings } from '../protocol/messages.js';

export class StateManager {
  private document: vscode.TextDocument;
  private panel: vscode.WebviewPanel;
  private settings: ExtensionSettings;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    settings: ExtensionSettings,
  ) {
    this.document = document;
    this.panel = panel;
    this.settings = settings;
  }

  handleWebViewMessage(msg: WebViewToHostMessage): void {
    if (this.disposed) return;

    switch (msg.type) {
      case 'parseText':
        this.parseAndUpdate(msg.text);
        break;
      case 'applyPatch':
        // Will apply patch to model, regenerate text, update editor
        break;
      case 'requestMetadata':
        // Will load metadata lazily
        break;
      case 'insertToEditor':
        this.insertToEditor(msg.text, msg.mode);
        break;
    }
  }

  onDocumentChanged(text: string): void {
    if (this.disposed) return;

    // Debounce parsing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.parseAndUpdate(text);
    }, this.settings.syncDebounceMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  private parseAndUpdate(text: string): void {
    // Will use parseQuery from @1c-query/core when available
    // For now, send a placeholder response
    this.panel.webview.postMessage({
      type: 'parseResult',
      model: { version: '1.0', queries: [] },
      diagnostics: [],
    });
  }

  private async insertToEditor(text: string, mode: 'insert' | 'replace' | 'clipboard'): Promise<void> {
    if (mode === 'clipboard') {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('Query copied to clipboard');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const edit = new vscode.WorkspaceEdit();
    if (mode === 'replace') {
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length),
      );
      edit.replace(editor.document.uri, fullRange, text);
    } else {
      edit.insert(editor.document.uri, editor.selection.active, text);
    }
    await vscode.workspace.applyEdit(edit);
  }
}

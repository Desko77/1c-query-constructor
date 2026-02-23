// WebView ↔ Extension Host protocol (ТЗ §7.2)

import type {
  QueryModel,
  Source,
  Join,
  SelectItem,
  BoolExpr,
  Expr,
  QueryOptions,
  ParameterSpec,
  Diagnostic,
} from '@1c-query/core';

// ---------------------------------------------------------------------------
// Metadata tree types for WebView
// ---------------------------------------------------------------------------

export interface MetadataNode {
  path: string;
  name: string;
  type: string;
  children?: MetadataNode[];
  isLeaf?: boolean;
}

export interface MetadataTree {
  roots: MetadataNode[];
}

export interface ExtensionSettings {
  preserveFormatting: boolean;
  formattingMode: 'preserve' | 'canonical';
  syncDebounceMs: number;
  undoStackSize: number;
  smartJoinsEnabled: boolean;
  smartJoinsMinScore: number;
}

// ---------------------------------------------------------------------------
// Host → WebView messages
// ---------------------------------------------------------------------------

export type HostToWebViewMessage =
  | { type: 'init'; model: QueryModel; metadata: MetadataTree; settings: ExtensionSettings }
  | { type: 'parseResult'; model: QueryModel; diagnostics: Diagnostic[] }
  | { type: 'modelUpdated'; model: QueryModel; text: string }
  | { type: 'diagnostics'; diagnostics: Diagnostic[] }
  | { type: 'metadataLoaded'; parentPath: string; children: MetadataNode[] };

// ---------------------------------------------------------------------------
// WebView → Host messages
// ---------------------------------------------------------------------------

export type WebViewToHostMessage =
  | { type: 'parseText'; text: string }
  | { type: 'applyPatch'; patch: QueryModelPatch }
  | { type: 'requestMetadata'; parentPath: string }
  | { type: 'insertToEditor'; text: string; mode: 'insert' | 'replace' | 'clipboard' };

// ---------------------------------------------------------------------------
// QueryModelPatch — incremental updates from visual constructor
// ---------------------------------------------------------------------------

export type QueryModelPatch =
  | { op: 'addSource'; queryIndex: number; source: Source }
  | { op: 'removeSource'; queryIndex: number; alias: string }
  | { op: 'updateSource'; queryIndex: number; alias: string; changes: Partial<Source> }
  | { op: 'addJoin'; queryIndex: number; join: Join }
  | { op: 'removeJoin'; queryIndex: number; leftAlias: string; rightAlias: string }
  | { op: 'updateJoin'; queryIndex: number; leftAlias: string; rightAlias: string; changes: Partial<Join> }
  | { op: 'addSelectItem'; queryIndex: number; item: SelectItem; position?: number }
  | { op: 'removeSelectItem'; queryIndex: number; index: number }
  | { op: 'updateSelectItem'; queryIndex: number; index: number; item: SelectItem }
  | { op: 'reorderSelectItems'; queryIndex: number; fromIndex: number; toIndex: number }
  | { op: 'updateWhere'; queryIndex: number; where: BoolExpr | null }
  | { op: 'updateGroupBy'; queryIndex: number; groupBy: Expr[] | null }
  | { op: 'updateHaving'; queryIndex: number; having: BoolExpr | null }
  | { op: 'updateOptions'; queryIndex: number; options: Partial<QueryOptions> }
  | { op: 'renameParameter'; oldName: string; newName: string }
  | { op: 'updateParameter'; name: string; changes: Partial<ParameterSpec> }
  | { op: 'removeParameter'; name: string };

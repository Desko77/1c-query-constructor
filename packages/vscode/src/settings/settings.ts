// Extension settings management (ТЗ §11)
import type { ExtensionSettings } from '../protocol/messages.js';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  preserveFormatting: true,
  formattingMode: 'preserve',
  syncDebounceMs: 300,
  undoStackSize: 50,
  smartJoinsEnabled: true,
  smartJoinsMinScore: 50,
};

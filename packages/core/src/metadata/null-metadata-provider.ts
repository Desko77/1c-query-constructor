// NullMetadataProvider — for Degraded Mode (ТЗ §3.1)
// All methods return empty/null.

import type {
  MetadataProvider,
  MetadataTypeGroup,
  MetadataObject,
  MetadataField,
  VirtualTableInfo,
} from './metadata-provider.js';

export class NullMetadataProvider implements MetadataProvider {
  async getRootTypes(): Promise<MetadataTypeGroup[]> {
    return [];
  }

  async getObject(_objectPath: string): Promise<MetadataObject | null> {
    return null;
  }

  async getFields(_objectPath: string): Promise<MetadataField[]> {
    return [];
  }

  async getVirtualTables(_objectPath: string): Promise<VirtualTableInfo[]> {
    return [];
  }

  async exists(_objectPath: string): Promise<boolean> {
    return false;
  }
}

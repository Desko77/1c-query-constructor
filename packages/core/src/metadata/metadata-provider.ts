// MetadataProvider — abstract interface (ТЗ §3.1)
// Core Library depends ONLY on this interface.

export interface MetadataTypeGroup {
  name: string;
  displayName: string;
  children: string[];
}

export interface MetadataObject {
  path: string;
  name: string;
  displayName?: string;
  type: string;
}

export interface MetadataField {
  name: string;
  type: string;
  displayName?: string;
  nullable?: boolean;
}

export interface VirtualTableInfo {
  name: string;
  displayName?: string;
  params: { name: string; type: string; required?: boolean }[];
}

export interface MetadataProvider {
  getRootTypes(): Promise<MetadataTypeGroup[]>;
  getObject(objectPath: string): Promise<MetadataObject | null>;
  getFields(objectPath: string): Promise<MetadataField[]>;
  getVirtualTables(objectPath: string): Promise<VirtualTableInfo[]>;
  exists(objectPath: string): Promise<boolean>;
}

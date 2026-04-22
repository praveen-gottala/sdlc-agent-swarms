export interface PageEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status: string;
  designStatus?: string;
  correctionIteration?: number;
  chatIteration?: number;
  designScore?: number | null;
  components?: string[];
}

export interface PagesFile {
  pages: PageEntry[];
}

export interface DesignTokensFile {
  version?: string;
  componentLibrary?: string;
  colorScheme?: string;
  tokens?: {
    colors?: Record<string, string>;
    typography?: {
      fontFamily?: string;
      scale?: Record<string, string>;
    };
    spacing?: { unit?: string };
    borderRadius?: Record<string, string>;
  };
}

export type Report = {
  id: string;
  content: string;
  charts?: any[];
  query?: string;
  timestamp?: number;
  editedContent?: string;
};

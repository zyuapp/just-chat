export type FactCandidate = {
  key: string;
  value: string;
  confidence: number;
  sourceExcerpt: string;
};

export type FactRecord = {
  id: string;
  key: string;
  value: string;
  confidence: number;
  sourceRequestId: string;
  sourceExcerpt: string;
  createdAt: number;
  updatedAt: number;
};

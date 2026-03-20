export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Tag {
  name: string;
  count: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

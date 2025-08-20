export interface CodeTask {
  id: string;
  repoPath: string;
  prompt: string;
  context?: any;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}

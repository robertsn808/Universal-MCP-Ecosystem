export interface ConfirmationRequest {
  taskId: string;
  operation: string;
  details: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  timeout: number; // seconds
}

export interface ConfirmationResponse {
  approved: boolean;
  reason?: string;
  modifiedInstructions?: string;
}

export class ConfirmationHandler {
  private pendingConfirmations = new Map<string, {
    request: ConfirmationRequest;
    resolver: (response: ConfirmationResponse) => void;
    timer: NodeJS.Timeout;
  }>();

  async requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationResponse> {
    return new Promise((resolve) => {
      console.log(`\n🚨 CONFIRMATION REQUIRED - Task ${request.taskId}`);
      console.log(`Operation: ${request.operation}`);
      console.log(`Risk Level: ${request.riskLevel.toUpperCase()}`);
      console.log(`Details: ${request.details}`);
      console.log(`\nWaiting for confirmation via /confirm/${request.taskId} endpoint...`);
      console.log(`This request will timeout in ${request.timeout} seconds`);

      const timer = setTimeout(() => {
        this.pendingConfirmations.delete(request.taskId);
        resolve({
          approved: false,
          reason: 'Confirmation request timed out'
        });
      }, request.timeout * 1000);

      this.pendingConfirmations.set(request.taskId, {
        request,
        resolver: resolve,
        timer
      });
    });
  }

  handleConfirmationResponse(taskId: string, approved: boolean, reason?: string, modifiedInstructions?: string): boolean {
    const pending = this.pendingConfirmations.get(taskId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingConfirmations.delete(taskId);

    pending.resolver({
      approved,
      reason,
      modifiedInstructions
    });

    return true;
  }

  getPendingConfirmations(): ConfirmationRequest[] {
    return Array.from(this.pendingConfirmations.values()).map(pending => pending.request);
  }

  cancelConfirmation(taskId: string): boolean {
    const pending = this.pendingConfirmations.get(taskId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingConfirmations.delete(taskId);

    pending.resolver({
      approved: false,
      reason: 'Confirmation cancelled by user'
    });

    return true;
  }
}
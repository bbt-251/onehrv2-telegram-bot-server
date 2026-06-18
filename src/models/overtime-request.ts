export interface OvertimeRequestModel {
    id: string;
    timestamp: string;
    overtimeId: string;
    overtimeDate: string;
    overtimeStartTime: string;
    overtimeEndTime: string;
    duration:number; //hours
    overtimeType: string;
    employeeUids: string[];
    overtimeGoal: string;
    overtimeJustification: string;
    status: "pending" | "approved" | "rejected";
    requestedBy: string; //manager employee's uid
    // Tracks where in the approval workflow this request is.
    // undefined means legacy requests that go directly to HR.
    approvalStage?: "manager" | "hr" | "completed";
    reviewedDate: string | null;
    reviewedBy: string | null;
    hrComments: string | null;
}

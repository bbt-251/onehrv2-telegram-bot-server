export interface EmployeeModel {
    id: string;
    timestamp: string;
    uid: string;

    /// employee information
    firstName: string;
    middleName: string | null;
    surname: string;
    birthDate: string;
    birthPlace: string;
    levelOfEducation: string;
    educationDetail: EducationDetailModel[];
    yearsOfExperience: string;
    experienceDetail: ExperienceDetailModel[];
    gender: string;
    maritalStatus: string;
    personalPhoneNumber: string;
    personalEmail: string;
    telegramChatID: string | null;

    // Current geolocation (Telegram live/static location)
    currentLocation: EmployeeCurrentLocation | null;

    bankAccount: string;
    providentFundAccount: string;
    hourlyWage: number;
    tinNumber: string;
    passportNumber: string;
    nationalIDNumber: string;
    employeeID: string;
    password: string;
    lastChanged: string;
    passwordRecovery: PasswordRecovery;
    signature: string;
    signedDocuments: string[];
    profilePicture: string;

    /// contract information
    company: string;
    contractType: string;
    contractHour: number | "Custom";
    hoursPerWeek: number;
    contractStatus: string;
    contractStartingDate: string;
    contractTerminationDate: string;
    contractDuration: number[];
    hireDate: string;
    contractDocument: string;
    probationPeriodEndDate: string;
    lastDateOfProbation: string;
    reasonOfLeaving: string;
    salary: number;
    currency: string;
    eligibleLeaveDays: number;
    companyEmail: string;
    companyPhoneNumber: string;
    associatedTax: string;
    pensionApplication: boolean;

    /// position information
    employmentPosition: string;
    positionLevel: string;
    section: string;
    department: string;
    workingLocation: string;
    workingArea: string; // JSON stringified [ [[lng, lat],[lng,lat],...] ,... ]
    homeLocation: string;
    timezone: string | null; // e.g., "Africa/Nairobi", "Europe/Paris"
    managerPosition: boolean;
    reportees: string[];
    reportingLineManagerPosition: string;
    reportingLineManager: string;
    gradeLevel: string;
    step: number;
    shiftType: string;
    role: string[];
    performanceScore: number;
    successorInformation: SuccessorInformationModel[];
    unit: string;

    // emergency information
    emergencyContactName: string;
    relationshipToEmployee: string;
    phoneNumber1: string;
    phoneNumber2: string;
    emailAddress1: string;
    emailAddress2: string;
    physicalAddress1: string;
    physicalAddress2: string;

    starredTrainingMaterials: string[];
    trainingMaterialsProgress: ProgressModel[];
    trainingMaterialStatus: trainingMaterialStatusModel[];
    certificationsAcquired: string[];
    announcements: announcementModel[];
    notifications: notificationModel[];
    checklistItems: string[];
    checklistItemRemark: checklistRemarkModel[];
    performance: PastPerformanceModel[];
    claimedOvertimes: string[];

    // promotion interview
    promotionInterviews: PromotionInterviewsModel[];
    promotionInterviewResults: PromotionInterviewResultModel[];

    // custom fields
    "customFields-1": { id: string; field: string; value: string; }[]; //customFields-1, here the number corresponds to the step in the form
    "customFields-2": { id: string; field: string; value: string; }[];
    "customFields-3": { id: string; field: string; value: string; }[];
    "customFields-4": { id: string; field: string; value: string; }[];

    // balance leave days
    balanceLeaveDays: number;
    accrualLeaveDays: number;
    lastELDUpdate: string;

    // document
    documentRequests: { [documentID: string]: boolean };
    associatedRestrictedDocuments: string[];
};

export interface EducationDetailModel {
    id: string;
    startDate: string;
    endDate: string;
    title: string;
    educationalLevel: string;
    school: string;
    schoolNotListed: boolean;
}

export interface EmployeeCurrentLocation {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    heading: number | null;
    speed: number | null;
    source: 'telegram' | 'telegram_live';
    isLive: boolean;
    updatedAt: string;
    liveMessageId: string | null;
    liveChatId: string | null;
    liveUntil: string | null;
    endedAt: string | null;
}

export interface ExperienceDetailModel {
    id: string;
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    mainActivities: string;
    reference: string;
}

export interface announcementModel {
    id: string;
    announcementID: string;
    title: string;
}

export interface PromotionInterviewsModel {
    id: string;
    interviewID: string;
    campaignID: string;
    selected: boolean;
}

export interface PromotionInterviewResultModel {
    id: string;
    promotionInstanceID: string;
    campaignID: string;
    evaluationScore: number;
    evaluationResult: "Pass" | "Fail" | "Not Evaluated";
    interviewID: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evaluation: any;
}

export interface trainingMaterialStatusModel {
    trainingMaterialID: string;
    status: "Set" | "In progress" | "Completed";
    completionDate?: string;
}

export interface checklistRemarkModel {
    itemID: string
    remark: string
}

export interface ProgressModel {
    trainingMaterial: string;
    progress: number;
}

export interface PastPerformanceModel {
    id: string;
    campaignId: string;
    period: string;
    round: string;
    campaignName: string;
    startDate: string;
    endDate: string;
    objectiveScore: number;
    competencyScore: number;
    performanceScore: number;
}

export interface SuccessorInformationModel {
    planningID: string;
    successor: 'Yes' | 'No' | 'N/A';
    rank: 'Top 1' | 'Top 2' | 'Top 3' | 'N/A';
}

export interface PasswordRecovery {
    timestamp: string;
    token: string;
}

export interface notificationModel {
    id: string
    title: string
    message: string
    type: "approval" | "reminder" | "info" | "warning" | "success"
    timestamp: string
    isRead: boolean
    actionRequired: boolean
}

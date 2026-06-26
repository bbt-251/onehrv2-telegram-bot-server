// Firebase Client SDK configurations for different projects
// These configurations are used by the mini app to initialize Firebase client SDK

export interface FirebaseProjectConfig {
    projectId: string;
    apiKey: string;
    authDomain: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
}

// Map project names to their Firebase client configurations
// You'll need to replace these with your actual Firebase project configurations
export const firebaseProjectConfigs: Record<string, FirebaseProjectConfig> = {
    development: {
        projectId: 'your-development-project-id',
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_DEVELOPMENT || 'your-dev-api-key',
        authDomain: 'your-development-project-id.firebaseapp.com',
        storageBucket: 'your-development-project-id.appspot.com',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_DEVELOPMENT || 'your-dev-messaging-sender-id',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_DEVELOPMENT || 'your-dev-app-id',
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_DEVELOPMENT || 'your-dev-measurement-id'
    },
    dev: {
        projectId: 'your-dev-project-id',
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_DEV || 'your-dev-api-key',
        authDomain: 'your-dev-project-id.firebaseapp.com',
        storageBucket: 'your-dev-project-id.appspot.com',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_DEV || 'your-dev-messaging-sender-id',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_DEV || 'your-dev-app-id',
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_DEV || 'your-dev-measurement-id'
    },
    int: {
        projectId: 'your-integration-project-id',
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_INT || 'your-int-api-key',
        authDomain: 'your-integration-project-id.firebaseapp.com',
        storageBucket: 'your-integration-project-id.appspot.com',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_INT || 'your-int-messaging-sender-id',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_INT || 'your-int-app-id',
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_INT || 'your-int-measurement-id'
    },
    // validation: {
    //     projectId: 'your-validation-project-id',
    //     apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_VALIDATION || 'your-val-api-key',
    //     authDomain: 'your-validation-project-id.firebaseapp.com',
    //     storageBucket: 'your-validation-project-id.appspot.com',
    //     messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_VALIDATION || 'your-val-messaging-sender-id',
    //     appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_VALIDATION || 'your-val-app-id',
    //     measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_VALIDATION || 'your-val-measurement-id'
    // },
    // cargolink_dev: {
    //     projectId: 'your-cargolink-dev-project-id',
    //     apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_CARGOLINK_DEV || 'your-cargolink-dev-api-key',
    //     authDomain: 'your-cargolink-dev-project-id.firebaseapp.com',
    //     storageBucket: 'your-cargolink-dev-project-id.appspot.com',
    //     messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_CARGOLINK_DEV || 'your-cargolink-dev-messaging-sender-id',
    //     appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_CARGOLINK_DEV || 'your-cargolink-dev-app-id',
    //     measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_CARGOLINK_DEV || 'your-cargolink-dev-measurement-id'
    // },
    cargolink_int: {
        projectId: 'your-cargolink-int-project-id',
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_CARGOLINK_INT || 'your-cargolink-int-api-key',
        authDomain: 'your-cargolink-int-project-id.firebaseapp.com',
        storageBucket: 'your-cargolink-int-project-id.appspot.com',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_CARGOLINK_INT || 'your-cargolink-int-messaging-sender-id',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_CARGOLINK_INT || 'your-cargolink-int-app-id',
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_CARGOLINK_INT || 'your-cargolink-int-measurement-id'
    },
    cargolink_prod: {
        projectId: 'your-cargolink-prod-project-id',
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_CARGOLINK_PROD || 'your-cargolink-prod-api-key',
        authDomain: 'your-cargolink-prod-project-id.firebaseapp.com',
        storageBucket: 'your-cargolink-prod-project-id.appspot.com',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_CARGOLINK_PROD || 'your-cargolink-prod-messaging-sender-id',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_CARGOLINK_PROD || 'your-cargolink-prod-app-id',
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_CARGOLINK_PROD || 'your-cargolink-prod-measurement-id'
    },
    komari: {
        projectId: 'your-komari-project-id',
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY_KOMARI || 'your-komari-api-key',
        authDomain: 'your-komari-project-id.firebaseapp.com',
        storageBucket: 'your-komari-project-id.appspot.com',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_KOMARI || 'your-komari-messaging-sender-id',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID_KOMARI || 'your-komari-app-id',
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_KOMARI || 'your-komari-measurement-id'
    },

};

/**
 * Get Firebase client configuration for a specific project
 * @param projectName - Name of the Firebase project
 * @returns FirebaseProjectConfig - Client SDK configuration
 */
export function getFirebaseProjectConfig(projectName: string): FirebaseProjectConfig {
    const config = firebaseProjectConfigs[projectName];
    if (!config) {
        throw new Error(`Firebase project configuration not found for project: ${projectName}`);
    }
    return config;
}

/**
 * Get all available project names
 * @returns string[] - Array of project names
 */
export function getAvailableProjectNames(): string[] {
    return Object.keys(firebaseProjectConfigs);
}

/**
 * Check if a project configuration exists
 * @param projectName - Name of the project to check
 * @returns boolean - True if configuration exists
 */
export function hasProjectConfig(projectName: string): boolean {
    return projectName in firebaseProjectConfigs;
}
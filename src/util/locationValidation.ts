/**
 * Location validation utilities for clock in/out functionality
 * Uses employee currentLocation from database instead of requesting location
 */

import dayjs from 'dayjs';
import { EmployeeCurrentLocation } from '../models/employee';
import { formatTimestamp, timestampFormat } from './dayjs_format';

export interface LocationValidationResult {
    isValid: boolean;
    error?: string;
    accuracy?: number | null;
    coordinates?: [number, number] | null; // [longitude, latitude]
    locationAge?: number | null; // Age in minutes
    isLive?: boolean | null;
}

/**
 * Validate employee's current location from database for clock in/out
 * @param employeeLocation - Employee's current location from database
 * @param maxAgeMinutes - Maximum age of location in minutes (default: 30)
 * @returns LocationValidationResult
 */
export function validateEmployeeLocation(
    employeeLocation: EmployeeCurrentLocation | null,
    maxAgeMinutes: number = 30
): LocationValidationResult {
    // Check if location exists
    if (!employeeLocation) {
        return {
            isValid: false,
            error: 'No location data available. Please share your location first.',
            accuracy: null,
            coordinates: null,
            locationAge: null,
            isLive: null,
        };
    }

    // Check if location has ended (for live locations)
    if (employeeLocation.endedAt) {
        return {
            isValid: false,
            error: 'Location sharing has ended. Please share your location again.',
            accuracy: null,
            coordinates: null,
            locationAge: null,
            isLive: null,
        };
    }

    // Check location age
    const locationTime = dayjs.utc(employeeLocation.updatedAt);
    const now = dayjs.utc();
    const ageMinutes = now.diff(locationTime, 'minute');
    console.log("updatedAt: ", locationTime.format(timestampFormat), " now: ", now.format(timestampFormat), " diff: ", ageMinutes);

    if (ageMinutes > maxAgeMinutes) {
        return {
            isValid: false,
            error: `Location data is too old (${ageMinutes} minutes). Please update your location.`,
            accuracy: null,
            coordinates: null,
            locationAge: ageMinutes,
            isLive: employeeLocation.isLive ? employeeLocation.isLive : null,
        };
    }

    // For live locations, check if they're still active
    if (employeeLocation.isLive) {
        if (employeeLocation.liveUntil) {
            const liveUntil = dayjs.utc(employeeLocation.liveUntil);
            if (now.isAfter(liveUntil)) {
                return {
                    isValid: false,
                    error: 'Live location sharing has expired. Please share your location again.',
                    locationAge: ageMinutes,
                    isLive: false,
                    accuracy: null,
                    coordinates: null,
                };
            }
        }
    }

    return {
        isValid: true,
        accuracy: employeeLocation.accuracy || 0,
        coordinates: [employeeLocation.longitude, employeeLocation.latitude],
        locationAge: ageMinutes,
        isLive: employeeLocation.isLive ? employeeLocation.isLive : null,
    };
}

/**
 * Parse working area string into coordinate arrays
 * @param workingArea - JSON stringified array of polygon coordinates
 * @returns Array of polygons, each containing coordinate pairs [lng, lat]
 */
export function parseWorkingArea(workingArea: string): number[][][][] | null {
    try {
        const parsed = JSON.parse(workingArea);

        // Validate structure: should be array of polygons or single polygon
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return null;
        }

        let polygons: number[][][][];

        // Check if it's a single polygon (wrapped in array) or multi-polygon
        if (parsed.length === 1 && Array.isArray(parsed[0]) && parsed[0].length > 0 && Array.isArray(parsed[0][0])) {
            // Single polygon case: [[[coords]]] -> wrap in another array to make it [[[[coords]]]]
            polygons = [parsed as number[][][]];
        } else {
            // Multi-polygon case: [[[[coords1]]], [[[coords2]]]]
            polygons = parsed as number[][][][];
        }

        // Validate each polygon
        for (const polygon of polygons) {
            if (!Array.isArray(polygon) || polygon.length === 0) {
                return null;
            }
            // Each polygon should be an array of coordinate pairs
            for (const ring of polygon) {
                if (!Array.isArray(ring) || ring.length < 3) { // Minimum 3 points for a polygon
                    return null;
                }
                for (const coord of ring) {
                    if (!Array.isArray(coord) || coord.length !== 2 ||
                        typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
                        return null;
                    }
                }
            }
        }

        return polygons;
    } catch (error) {
        console.error('Failed to parse working area:', error);
        return null;
    }
}

/**
 * Check if a point is inside a polygon using ray-casting algorithm
 * @param point - [longitude, latitude] coordinates
 * @param polygon - Array of [longitude, latitude] coordinate pairs
 * @returns true if point is inside polygon
 */
export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const coordI = polygon[i];
        const coordJ = polygon[j];

        if (!coordI || !coordJ) continue;

        const [xi, yi] = coordI;
        const [xj, yj] = coordJ;

        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Check if a point is inside any of the polygons in a multi-polygon
 * @param point - [longitude, latitude] coordinates
 * @param multiPolygon - Array of polygons
 * @returns true if point is inside any polygon
 */
export function isPointInMultiPolygon(point: [number, number], multiPolygon: number[][][][]): boolean {
    for (const polygon of multiPolygon) {
        // For simplicity, we'll use the first ring of each polygon (outer boundary)
        // In GeoJSON, the first ring is the outer boundary, subsequent rings are holes
        const outerRing = polygon[0];
        if (outerRing && Array.isArray(outerRing) && outerRing.length > 0) {
            // Validate that outerRing contains coordinate pairs
            const validatedRing: [number, number][] = [];
            for (const coord of outerRing) {
                if (Array.isArray(coord) && coord.length === 2 &&
                    typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                    validatedRing.push([coord[0], coord[1]]);
                } else {
                    console.warn('Invalid coordinate in polygon ring:', coord);
                    return false;
                }
            }
            if (isPointInPolygon(point, validatedRing)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Validate if user location is within their defined working area
 * @param userLocation - User's current unified location object
 * @param workingArea - JSON stringified working area definition
 * @param minAccuracy - Minimum required accuracy in meters (default: 100)
 * @returns LocationValidationResult
 */
/**
 * Validate employee's location against working area using database location data
 * @param employeeLocation - Employee's current location from database
 * @param workingArea - JSON stringified working area definition
 * @param maxAgeMinutes - Maximum age of location in minutes (default: 30)
 * @returns LocationValidationResult
 */
export function validateEmployeeLocationAndArea(
    employeeLocation: EmployeeCurrentLocation | null,
    workingArea: string,
    maxAgeMinutes: number = 30,
    employeeTimezone?: string | null
): LocationValidationResult {
    console.log(`******* employee location: `, employeeLocation);
    // Check if location exists at all
    if (!employeeLocation) {
        return {
            isValid: false,
            error: 'No location data available. Please share your location first.',
            accuracy: null,
            coordinates: null,
            locationAge: null,
            isLive: null,
        };
    }

    // Check if location has ended (for live locations)
    if (employeeLocation.endedAt) {
        return {
            isValid: false,
            error: 'Location sharing has ended. Please share your location again.',
            accuracy: null,
            coordinates: null,
            locationAge: null,
            isLive: null,
        };
    }

    // Get location age for reference
    const locationTime = dayjs.utc(employeeLocation.updatedAt);
    const now = dayjs.utc();
    const ageMinutes = now.diff(locationTime, 'minute');

    const tz = employeeTimezone || 'Africa/Nairobi';
    console.log(`locationTime: ${formatTimestamp(locationTime, tz)} now: ${formatTimestamp(now, tz)} diff: ${ageMinutes}`);

    // Check if location is live
    const isLive = employeeLocation.isLive && (!employeeLocation.liveUntil || now.isBefore(dayjs.utc(employeeLocation.liveUntil)));

    if (isLive) {
        // Location is live - check if within working area
        const coordinates: [number, number] = [employeeLocation.longitude, employeeLocation.latitude];

        // Parse working area
        const parsedArea = parseWorkingArea(workingArea);
        if (!parsedArea) {
            return {
                isValid: false,
                error: 'Invalid working area configuration. Please contact your administrator.',
                accuracy: employeeLocation.accuracy || 0,
                coordinates,
                locationAge: ageMinutes,
                isLive: true,
            };
        }

        // Check if point is within working area
        const isInside = isPointInMultiPolygon(coordinates, parsedArea);

        if (!isInside) {
            return {
                isValid: false,
                error: 'You are outside your designated working area. Clock in/out is only allowed within your assigned work location.',
                accuracy: employeeLocation.accuracy || 0,
                coordinates,
                locationAge: ageMinutes,
                isLive: true,
            };
        }

        // Live location is within working area - valid
        return {
            isValid: true,
            accuracy: employeeLocation.accuracy || 0,
            coordinates,
            locationAge: ageMinutes,
            isLive: true,
        };
    } else {
        // Location is not live (expired, never was live, or age check failed)
        // Check if it's too old
        if (ageMinutes > maxAgeMinutes) {
            return {
                isValid: false,
                error: `Location data is too old (${ageMinutes} minutes). Please update your location.`,
                accuracy: null,
                coordinates: null,
                locationAge: ageMinutes,
                isLive: false,
            };
        }

        // Location exists but is not live - should trigger auto clock-out
        return {
            isValid: false,
            error: 'Location sharing is not active. Please share your live location.',
            accuracy: employeeLocation.accuracy || 0,
            coordinates: [employeeLocation.longitude, employeeLocation.latitude],
            locationAge: ageMinutes,
            isLive: false,
        };
    }
}

/**
 * Check if employee has valid location data for clock in/out
 * @param employeeLocation - Employee's current location from database
 * @param maxAgeMinutes - Maximum age of location in minutes (default: 30)
 * @returns boolean indicating if location is available and valid
 */
export function hasValidLocation(
    employeeLocation: EmployeeCurrentLocation | null,
    maxAgeMinutes: number = 30
): boolean {
    if (!employeeLocation) {
        return false;
    }

    // Check if location has ended
    if (employeeLocation.endedAt) {
        return false;
    }

    // Check location age
    const locationTime = dayjs.utc(employeeLocation.updatedAt);
    const now = dayjs.utc();
    const ageMinutes = now.diff(locationTime, 'minute');

    if (ageMinutes > maxAgeMinutes) {
        return false;
    }

    // For live locations, check if they're still active
    if (employeeLocation.isLive && employeeLocation.liveUntil) {
        const liveUntil = dayjs.utc(employeeLocation.liveUntil);
        if (now.isAfter(liveUntil)) {
            return false;
        }
    }

    return true;
}

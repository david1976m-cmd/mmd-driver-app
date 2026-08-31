import type { ApiErrorPayload, BidRequest, BidResult, Driver, DriverSession, RideAssignment } from "@/types/matchmydriver";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://matchmydriver.com"
).replace(/\/+$/, "");

const endpointCandidates = {
 login: [
   "/api/login",
   "/wp-json/matchmydriver/v1/driver/login",
   "/wp-json/mmd/v1/auth/login",
   "/api/driver/login",
 ],
 rides: [
   "/api/rides",
   "/wp-json/matchmydriver/v1/driver/rides",
   "/wp-json/mmd/v1/driver/rides",
   "/api/driver/rides",
 ],
 bid: (rideId: string): string[] => [
   `/api/rides/${rideId}/bid`,
   `/wp-json/matchmydriver/v1/driver/rides/${rideId}/bid`,
   `/wp-json/mmd/v1/driver/rides/${rideId}/bid`,
 ],
 pushToken: [
   "/wp-json/matchmydriver/v1/driver/push-token",
   "/wp-json/mmd/v1/driver/push-token",
   "/api/driver/push-token",
 ],
} as const;

/** Thrown when the server rejects an authenticated session token (HTTP 401). */
export class UnauthorizedError extends Error {
 constructor() {
   super("Uw sessie is verlopen. Log opnieuw in als chauffeur.");
   this.name = "UnauthorizedError";
 }
}

/**
* Registered by the auth layer so any 401 on an authenticated request
* automatically clears the stored session and forces re-authentication.
*/
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
 unauthorizedHandler = handler;
}

/**
* Error from a single endpoint attempt. `retryable` tells requestFirst whether
* to try the next candidate endpoint: network failures, 404 and 5xx are
* retryable; a 401 (bad credentials) or 409 (conflict) is terminal.
*/
class ApiRequestError extends Error {
 retryable: boolean;
 constructor(message: string, retryable: boolean) {
   super(message);
   this.name = "ApiRequestError";
   this.retryable = retryable;
 }
}

type RequestOptions = {
 method?: "GET" | "POST";
 token?: string;
 body?: unknown;
};

/** Bekende Engelstalige serverfouten vertaald naar het Nederlands. */
const ERROR_TRANSLATIONS: Record<string, string> = {
 "Invalid email or password.": "Ongeldig e-mailadres of wachtwoord.",
 "Invalid or missing token.": "Uw sessie is verlopen. Log opnieuw in.",
 "This ride assignment is no longer open for bidding.": "Deze ritopdracht is niet meer open voor biedingen.",
 "You have already responded to this assignment.": "U heeft al gereageerd op deze opdracht.",
};

async function readError(response: Response): Promise<string> {
 try {
   const payload = (await response.json()) as ApiErrorPayload;
   const raw = payload.message ?? payload.error ?? `Verzoek mislukt (${response.status})`;
   return ERROR_TRANSLATIONS[raw] ?? raw;
 } catch {
   return `Verzoek mislukt (${response.status})`;
 }
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
 const headers: HeadersInit = {
   Accept: "application/json",
   "Content-Type": "application/json",
 };

 if (options.token) {
   headers.Authorization = `Bearer ${options.token}`;
 }

 const fullUrl = `${API_BASE_URL}${path}`;
 const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

 console.log(`[MMD-API] → ${options.method ?? "GET"} ${fullUrl}`);
 console.log(`[MMD-API]   Headers:`, JSON.stringify({
   ...headers,
   Authorization: options.token ? "Bearer ***" : undefined,
 }));
 let response: Response;
 try {
   response = await fetch(fullUrl, {
     method: options.method ?? "GET",
     headers,
     body: bodyStr,
     redirect: "follow",
   });
   console.log(`[MMD-API] ← ${response.status} ${response.statusText} (${fullUrl})`);
   console.log(`[MMD-API]   Response URL after redirects: ${response.url}`);
   console.log(`[MMD-API]   Response headers: content-type=${response.headers.get("content-type")}`);
 } catch (networkError) {
   console.error(`[MMD-API] ✖ NETWORK ERROR on ${fullUrl}:`, networkError instanceof Error ? networkError.message : String(networkError));
   if (networkError instanceof Error && networkError.stack) {
     console.error(`[MMD-API]   Stack:`, networkError.stack);
   }
   // Network failure (no connectivity, DNS, timeout) — try the next endpoint.
   throw new ApiRequestError("Geen verbinding met MatchMyDriver.", true);
 }

 if (response.status === 401) {
   // A 401 on a token-bearing request means the session is no longer valid —
   // tear it down so the driver returns to login instead of retrying blindly.
   if (options.token) {
     unauthorizedHandler?.();
     throw new UnauthorizedError();
   }
   // A 401 on login (no token) is bad credentials — surface the server message
   // (e.g. "Invalid email or password."). Not retryable: trying other
   // endpoints would only mask the real cause.
   const err401 = await readError(response);
   console.log(`[MMD-API]   401 error message: ${err401}`);
   throw new ApiRequestError(err401, false);
 }

 if (response.status === 409) {
   // De rit is niet meer open voor biedingen, of de chauffeur heeft al
   // gereageerd — direct tonen, niet via fallback verbergen.
   throw new ApiRequestError(await readError(response), false);
 }

 if (response.status === 404) {
   console.log(`[MMD-API]   404 — trying next endpoint candidate`);
   // Endpoint niet gevonden op dit pad — probeer het volgende kandidaat-endpoint.
   throw new ApiRequestError("Endpoint niet gevonden.", true);
 }

 if (response.status >= 500) {
   console.log(`[MMD-API]   ${response.status} server error — trying next endpoint`);
   // Serverfout — misschien tijdelijk, probeer het volgende endpoint.
   throw new ApiRequestError(`Serverfout (${response.status}).`, true);
 }

 if (!response.ok) {
   const errMsg = await readError(response);
   console.log(`[MMD-API]   ${response.status} error: ${errMsg}`);
   throw new ApiRequestError(errMsg, false);
 }

 const rawText = await response.text();
 try {
   return JSON.parse(rawText) as T;
 } catch (parseError) {
   console.error(`[MMD-API]   JSON parse failed:`, parseError instanceof Error ? parseError.message : String(parseError));
   throw new ApiRequestError("Ongeldig antwoord van MatchMyDriver.", false);
 }
}

async function requestFirst<T>(paths: readonly string[], options: RequestOptions = {}): Promise<T> {
 let lastError: Error | undefined;
 console.log(`[MMD-API] requestFirst — ${paths.length} endpoint candidates: ${JSON.stringify(paths)}`);

 for (let i = 0; i < paths.length; i++) {
   const path = paths[i];
   console.log(`[MMD-API] Trying endpoint ${i + 1}/${paths.length}: ${path}`);
   try {
     const result = await requestJson<T>(path, options);
     console.log(`[MMD-API] ✓ Success on endpoint: ${path}`);
     return result;
   } catch (error) {
     lastError = error instanceof Error ? error : new Error("Onbekende fout");
     console.log(`[MMD-API] ✗ Failed on ${path}: ${lastError.message} (retryable: ${error instanceof ApiRequestError ? error.retryable : "N/A"})`);
     // A 401 (bad credentials) or 409 (conflict) is terminal — do not try
     // fallback endpoints, since that would hide the real server response.
     // UnauthorizedError (expired token) is also terminal.
     if (error instanceof ApiRequestError && !error.retryable) {
       throw error;
     }
     if (error instanceof UnauthorizedError) {
       throw error;
     }
   }
 }

 console.error(`[MMD-API] All ${paths.length} endpoints failed. Last error: ${lastError?.message}`);
 throw lastError ?? new Error("De MatchMyDriver API is niet bereikbaar.");
}

type DriverFields = Partial<Driver> & {
 first_name?: string;
 last_name?: string;
 driver_number?: string;
 company_name?: string;
};

type RawDriver = DriverFields & {
 driver?: DriverFields;
 user?: DriverFields;
 token?: string;
 access_token?: string;
};

type RawRide = Partial<RideAssignment> & {
 // Live API field names (GET /api/rides contract)
 assignment_number?: string;
 pickup_location?: string;
 dropoff_location?: string;
 ride_date?: string;
 ride_time?: string;
 passengers?: number | string;
 // Student transport / service type
 is_student_transport?: boolean | number | string;
 student_transport?: boolean | number | string;
 ride_type?: string;
 service_type?: string;
 category?: string;
 // Luggage details
 luggage?: string[] | string;
 luggage_items?: string[] | string;
 luggage_details?: string[] | string;
 baggage?: string[] | string;
 no_luggage?: boolean | number | string;
 // Preferences / requirements
 preferences?: string[] | string;
 driver_preferences?: string[] | string;
 requirements?: string[] | string;
 ride_preferences?: string[] | string;
 // Travel duration & distance
 travel_duration?: string;
 travel_time?: string;
 duration?: string;
 estimated_duration?: string;
 trip_duration?: string;
 duration_min?: number | string;
 distance?: number | string;
 distance_km?: number | string;
 // Timestamps
 created_at?: string;
 published_at?: string;
 posted_at?: string;
 // Legacy / alternate field aliases
 ride_id?: string | number;
 opdracht_id?: string | number;
 pickup_address?: string;
 pickup?: string;
 from?: string;
 destination_address?: string;
 destination?: string;
 to?: string;
 pickup_at?: string;
 date?: string;
 time?: string;
 is_fixed_price?: boolean | number | string;
 fixed_price?: number | string;
 price?: number | string;
 customer_type?: string;
 bids_count?: number;
 deadline?: string;
 already_responded?: boolean | number | string;
 is_urgent?: boolean | number | string;
 bidding_closes_at?: string;
 has_responded?: boolean | number | string;
 responded?: boolean | number | string;
 urgent?: boolean | number | string;
};

type LoginPayload = RawDriver & {
 data?: RawDriver;
};

type RidesPayload = {
 data?: RawRide[];
 rides?: RawRide[];
 assignments?: RawRide[];
};

function toDriver(payload: LoginPayload): DriverSession {
 const root = payload.data ?? payload;
 const driverSource = root.driver ?? root.user ?? root;
 const token = root.token ?? root.access_token;

 if (!token) {
   throw new Error("Geen sessietoken ontvangen van MatchMyDriver.");
 }

 // POST /api/login returns first_name + last_name separately — combine them.
 // Fall back to a flat "name" field for legacy/alternate auth shapes.
 const firstName = driverSource.first_name ?? root.first_name;
 const lastName = driverSource.last_name ?? root.last_name;
 const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

 return {
   token,
   driver: {
     id: String(driverSource.id ?? "driver"),
     name: fullName || (driverSource.name ?? "Chauffeur"),
     email: driverSource.email ?? "",
     phone: driverSource.phone,
     companyName: driverSource.companyName ?? driverSource.company_name ?? root.company_name,
     driverNumber: driverSource.driver_number ?? root.driver_number,
     verified: driverSource.verified ?? true,
   },
 };
}

function toNumber(value: unknown): number | undefined {
 if (typeof value === "number") return value;
 if (typeof value === "string") {
   const parsed = Number(value.replace(",", "."));
   return Number.isFinite(parsed) ? parsed : undefined;
 }
 return undefined;
}

function toBool(value: unknown): boolean {
 if (typeof value === "boolean") return value;
 if (typeof value === "number") return value !== 0;
 if (typeof value === "string") {
   const normalized = value.trim().toLowerCase();
   return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "ja";
 }
 return false;
}

function toStringArray(value: unknown): string[] | undefined {
 if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
 if (typeof value === "string") {
   const trimmed = value.trim();
   if (!trimmed) return undefined;
   return trimmed.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
 }
 return undefined;
}

function toRide(raw: RawRide): RideAssignment {
 const fixedPrice = toNumber(raw.fixedPrice ?? raw.fixed_price ?? raw.price);
 const rawId = raw.id ?? raw.ride_id ?? raw.opdracht_id ?? raw.reference;

 // Combine ride_date + ride_time (e.g. "2026-07-12" + "14:00") into a
 // single datetime string; fall back to legacy aliases if present.
 const datePart = raw.ride_date ?? raw.date;
 const timePart = raw.ride_time ?? raw.time;
 const combinedDateTime = [datePart, timePart].filter(Boolean).join(" ") || undefined;
 const pickupAt = raw.pickupAt ?? raw.pickup_at ?? combinedDateTime ?? new Date().toISOString();

 // Lees is_fixed_price (snake_case) uit de API; val terug op camelCase en
 // daarna op de aanwezigheid van een vaste prijs.
 const isFixedPrice = raw.is_fixed_price !== undefined
   ? toBool(raw.is_fixed_price)
   : raw.isFixedPrice !== undefined
     ? toBool(raw.isFixedPrice)
     : Boolean(fixedPrice);

 // Leerlingenvervoer kan als expliciet boolean of als service_type/ride_type/category komen.
 const studentTransportBool = toBool(
   raw.is_student_transport ?? raw.student_transport ?? raw.isStudentTransport,
 );
 const serviceType = (raw.service_type ?? raw.ride_type ?? raw.category ?? "").toLowerCase();
 const isStudentTransport = studentTransportBool || serviceType.includes("leerling") || serviceType.includes("student");

 const customerType = raw.customerType ?? raw.customer_type ?? (isStudentTransport ? "Leerlingenvervoer" : "Zakelijke klant");

 return {
   id: String(rawId ?? Math.random()),
   reference: raw.reference ?? raw.assignment_number ?? `RA-${String(rawId ?? "")}`,
   pickupAddress: raw.pickupAddress ?? raw.pickup_address ?? raw.pickup_location ?? raw.pickup ?? raw.from ?? "Vertreklocatie onbekend",
   destinationAddress: raw.destinationAddress ?? raw.destination_address ?? raw.dropoff_location ?? raw.destination ?? raw.to ?? "Bestemming onbekend",
   pickupAt,
   customerType,
   pricingType: isFixedPrice ? "fixed" : (raw.pricingType ?? "bid"),
   isFixedPrice,
   fixedPrice,
   distanceKm: toNumber(raw.distanceKm ?? raw.distance_km ?? raw.distance),
   travelDuration: raw.travelDuration ?? raw.travel_duration ?? raw.travel_time ?? raw.duration ?? raw.estimated_duration ?? raw.trip_duration,
   durationMin: toNumber(raw.durationMin ?? raw.duration_min),
   passengerCount: toNumber(raw.passengerCount ?? raw.passengers),
   luggageCount: toNumber(raw.luggageCount),
   luggageItems: toStringArray(raw.luggageItems ?? raw.luggage ?? raw.luggage_items ?? raw.luggage_details ?? raw.baggage),
   noLuggage: toBool(raw.noLuggage ?? raw.no_luggage),
   notes: raw.notes ?? undefined,
   status: raw.status ?? "open",
   bidsCount: raw.bidsCount ?? raw.bids_count,
   responseDeadline: raw.responseDeadline ?? raw.deadline,
   alreadyResponded: toBool(raw.alreadyResponded ?? raw.has_responded ?? raw.responded ?? raw.already_responded),
   isUrgent: toBool(raw.isUrgent ?? raw.urgent ?? raw.is_urgent),
   isStudentTransport,
   preferences: toStringArray(raw.preferences ?? raw.driver_preferences ?? raw.requirements ?? raw.ride_preferences),
   biddingClosesAt: raw.biddingClosesAt ?? raw.bidding_closes_at ?? raw.responseDeadline ?? raw.deadline,
   createdAt: raw.createdAt ?? raw.created_at ?? raw.published_at ?? raw.posted_at,
 };
}

export const MatchMyDriverApi = {
 async login(email: string, password: string): Promise<DriverSession> {
   const payload = await requestFirst<LoginPayload>(endpointCandidates.login, {
     method: "POST",
     body: { email, password },
   });
   const session = toDriver(payload);
   return session;
 },

 async getOpenRides(token: string): Promise<RideAssignment[]> {
   const payload = await requestFirst<RidesPayload | RawRide[]>(endpointCandidates.rides, { token });
   const rawRides = Array.isArray(payload) ? payload : payload.data ?? payload.rides ?? payload.assignments ?? [];
   return rawRides.map(toRide);
 },

 async bidOnRide(token: string, rideId: string, bid: BidRequest): Promise<BidResult> {
   return requestFirst<BidResult>(endpointCandidates.bid(rideId), {
     method: "POST",
     token,
     body: bid,
   });
 },

 async registerPushToken(token: string, pushToken: string): Promise<void> {
   await requestFirst(endpointCandidates.pushToken, {
     method: "POST",
     token,
     body: { pushToken, platform: "expo" },
   });
 },

 async unregisterPushToken(token: string): Promise<void> {
   await requestFirst(endpointCandidates.pushToken, {
     method: "POST",
     token,
     body: { pushToken: "", platform: "expo" },
   });
 },
};
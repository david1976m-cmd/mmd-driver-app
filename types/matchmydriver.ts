export type Driver = {
id: string;
name: string;
email: string;
phone?: string;
companyName?: string;
driverNumber?: string;
verified?: boolean;
};

export type DriverSession = {
token: string;
driver: Driver;
};

export type RidePricingType = "bid" | "fixed";

export type RideAssignment = {
id: string;
reference: string;
pickupAddress: string;
destinationAddress: string;
pickupAt: string;
customerType: string;
pricingType: RidePricingType;
isFixedPrice: boolean;
fixedPrice?: number;
distanceKm?: number;
travelDuration?: string;
durationMin?: number;
passengerCount?: number;
luggageCount?: number;
luggageItems?: string[];
noLuggage?: boolean;
notes?: string;
status: "open" | "closingSoon" | "responded" | "closed";
bidsCount?: number;
responseDeadline?: string;
alreadyResponded: boolean;
isUrgent: boolean;
isStudentTransport: boolean;
preferences?: string[];
biddingClosesAt?: string;
createdAt?: string;
};

export type BidRequest = {
bid_amount?: number;
message?: string;
};

export type BidResult = {
success: boolean;
bid_id: number;
is_interest: boolean;
bid_amount: number | null;
};

export type ApiErrorPayload = {
message?: string;
error?: string;
code?: string | number;
};
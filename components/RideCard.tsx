import * as Haptics from "expo-haptics";
import { BriefcaseBusiness, CheckCircle2, Clock3, Euro, Eye, GraduationCap, MapPin, Users, Zap } from "lucide-react-native";
import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import CountdownTimer from "@/components/CountdownTimer";
import { palette } from "@/constants/colors";
import type { RideAssignment } from "@/types/matchmydriver";
import { formatDurationMinutes, formatEuro, formatRideDate } from "@/utils/formatting";

type RideCardProps = {
  ride: RideAssignment;
  isResponding: boolean;
  onView: (ride: RideAssignment) => void;
  onRespond: (ride: RideAssignment) => void;
};

function RideCardComponent({ ride, isResponding, onView, onRespond }: RideCardProps) {
  const primaryAction = ride.isFixedPrice ? "Interesse tonen" : "Bod plaatsen";
  const priceLabel = ride.isFixedPrice ? formatEuro(ride.fixedPrice) : "Bied nu";
  const hasDeadline = Boolean(ride.biddingClosesAt);

  const travelDurationLabel = ride.travelDuration ?? formatDurationMinutes(ride.durationMin);

  const meta = useMemo(
    () => [
      ride.distanceKm ? `${ride.distanceKm} km` : undefined,
      travelDurationLabel ? `${travelDurationLabel}` : undefined,
      ride.passengerCount ? `${ride.passengerCount} passagier${ride.passengerCount === 1 ? "" : "s"}` : undefined,
      ride.bidsCount !== undefined ? `${ride.bidsCount} reacties` : undefined,
    ].filter(Boolean),
    [ride.bidsCount, ride.distanceKm, ride.passengerCount, travelDurationLabel],
  );

  const handleView = (): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onView(ride);
  };

  const handleRespond = (): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onRespond(ride);
  };

  return (
    <View style={[styles.card, ride.alreadyResponded && styles.cardResponded]}>
      <View style={styles.topRow}>
        <View style={styles.referencePill}>
          <BriefcaseBusiness size={14} color={palette.primary} />
          <Text style={styles.referenceText}>{ride.reference}</Text>
        </View>
        <View style={styles.badgeRow}>
          {ride.isUrgent ? (
            <View style={styles.urgentPill}>
              <Zap size={12} color={palette.accent} fill={palette.accent} />
              <Text style={styles.urgentText}>SPOED</Text>
            </View>
          ) : null}
          {ride.isStudentTransport ? (
            <View style={styles.studentPill}>
              <GraduationCap size={12} color={palette.white} />
              <Text style={styles.studentText}>Leerlingenvervoer</Text>
            </View>
          ) : null}
          {ride.isFixedPrice ? (
            <View style={styles.fixedPill}>
              <Text style={styles.fixedText}>Vaste prijs</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeIconWrap}>
          <View style={styles.pinDot} />
          <View style={styles.routeLine} />
          <View style={styles.pinDotDest} />
        </View>
        <View style={styles.routeTextWrap}>
          <View style={styles.addressRow}>
            <MapPin size={15} color={palette.primary} />
            <Text style={styles.address} numberOfLines={1}>{ride.pickupAddress}</Text>
          </View>
          <View style={styles.addressRow}>
            <MapPin size={15} color={palette.success} />
            <Text style={styles.destination} numberOfLines={1}>{ride.destinationAddress}</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Clock3 size={15} color={palette.gray} />
          <Text style={styles.infoText}>{formatRideDate(ride.pickupAt)}</Text>
        </View>
        <View style={styles.infoItem}>
          <Euro size={15} color={palette.gray} />
          <Text style={styles.infoText}>{priceLabel}</Text>
        </View>
        <View style={styles.infoItem}>
          <Users size={15} color={palette.gray} />
          <Text style={styles.infoText}>{ride.customerType}</Text>
        </View>
        {hasDeadline ? <CountdownTimer deadline={ride.biddingClosesAt as string} compact /> : null}
      </View>

      {ride.notes ? <Text style={styles.notes} numberOfLines={2}>{ride.notes}</Text> : null}

      <View style={styles.footerRow}>
        <Text style={styles.metaText}>{meta.join(" · ")}</Text>
        {ride.alreadyResponded ? (
          <View style={styles.respondedButton}>
            <CheckCircle2 size={16} color={palette.success} />
            <Text style={styles.respondedText}>Al gereageerd</Text>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Bekijk opdracht ${ride.reference}`}
              onPress={handleView}
              style={({ pressed }) => [styles.viewButton, pressed && styles.viewButtonPressed]}
            >
              <Eye size={16} color={palette.primary} />
              <Text style={styles.viewButtonText}>Bekijken</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${primaryAction} voor opdracht ${ride.reference}`}
              disabled={isResponding}
              onPress={handleRespond}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed, isResponding && styles.disabled]}
            >
              {isResponding ? (
                <Text style={styles.actionText}>Versturen...</Text>
              ) : (
                <Text style={styles.actionText}>{primaryAction}</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export const RideCard = memo(RideCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 14,
    shadowColor: "#1e3a8a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardResponded: {
    opacity: 0.75,
    borderColor: "#d1fae5",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  referencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef4ff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 1,
  },
  referenceText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  urgentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  urgentText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  fixedPill: {
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  fixedText: {
    color: palette.success,
    fontSize: 11,
    fontWeight: "800",
  },
  routeBlock: {
    flexDirection: "row",
    gap: 12,
  },
  routeIconWrap: {
    width: 22,
    alignItems: "center",
    paddingTop: 3,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.primary,
  },
  routeLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: palette.border,
    marginVertical: 2,
  },
  pinDotDest: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.success,
  },
  routeTextWrap: {
    flex: 1,
    gap: 10,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  address: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  destination: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: "600",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "600",
  },
  notes: {
    color: palette.gray,
    fontSize: 14,
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metaText: {
    color: palette.gray,
    fontSize: 12,
    flex: 1,
  },
  actionButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: palette.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: palette.primaryDeep,
  },
  disabled: {
    opacity: 0.55,
  },
  actionText: {
    color: palette.white,
    fontSize: 14,
    fontWeight: "700",
  },
  respondedButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
  },
  respondedText: {
    color: palette.success,
    fontSize: 14,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  viewButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: "#eef4ff",
    borderColor: palette.primary,
  },
  viewButtonText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  studentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: palette.primary,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  studentText: {
    color: palette.white,
    fontSize: 11,
    fontWeight: "800",
  },
});

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "@/constants/colors";

type CountdownTimerProps = {
  /** ISO-8601 deadline. */
  deadline: string;
  /** Compact variant for inside badges/pills. */
  compact?: boolean;
};

type Remaining = {
  expired: boolean;
  text: string;
  critical: boolean;
};

function computeRemaining(deadline: string): Remaining {
  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return { expired: false, text: "", critical: false };

  const diff = target - Date.now();
  if (diff <= 0) return { expired: true, text: "Gesloten", critical: false };

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const critical = diff < 60 * 60 * 1000; // < 1 uur

  let text: string;
  if (days > 0) {
    text = `${days}d ${hours}u`;
  } else if (hours > 0) {
    text = `${hours}u ${String(minutes).padStart(2, "0")}m`;
  } else {
    text = `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return { expired: false, text, critical };
}

/**
 * Live aftel-timer voor een bieddeadline. Tikt elke seconde door en
 * kleurt rood zodra er minder dan één uur resteert.
 *
 * Wanneer de deadline volgens de lokale klok verstreken is, tonen we
 * niets. De backend bepaalt of een rit nog open staat; als die hem in
 * de lijst met open ritten retourneert, mag de app niet labelen als
 * 'gesloten'.
 */
function CountdownTimer({ deadline, compact = false }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<Remaining>(() => computeRemaining(deadline));

  useEffect(() => {
    setRemaining(computeRemaining(deadline));
    const interval = setInterval(() => {
      setRemaining(computeRemaining(deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (remaining.expired) {
    return null;
  }

  return (
    <View style={[styles.wrap, remaining.critical && styles.criticalWrap, compact && styles.wrapCompact]}>
      <Text style={[styles.text, remaining.critical && styles.criticalText]}>{remaining.text}</Text>
    </View>
  );
}

export default React.memo(CountdownTimer);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#eef4ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#dbe7ff",
  },
  wrapCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  criticalWrap: {
    backgroundColor: "#fff7ed",
    borderColor: "#fcd9b6",
  },
  text: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  criticalText: {
    color: palette.danger,
  },
});

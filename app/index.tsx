import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import {
  Backpack,
  Bell,
  Building2,
  CarFront,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  X,
  Zap,
} from "lucide-react-native";
import CountdownTimer from "@/components/CountdownTimer";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
  PanGestureHandlerStateChangeEvent,
  State,
} from "react-native-gesture-handler";

import { MatchMyDriverApi } from "@/api/matchmydriver";
import { RideCard } from "@/components/RideCard";
import { palette } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useNotificationPreferences } from "@/contexts/notifications-context";
import {
  usePushRegistration,
  type PushRegistrationState,
} from "@/hooks/usePushRegistration";

import type { BidResult, RideAssignment } from "@/types/matchmydriver";
import { formatDurationMinutes, formatEuro, formatRideDate } from "@/utils/formatting";

type ConfirmationData = {
  reference: string;
  amount: number | undefined;
  type: "bid" | "fixed";
};

export default function DriverAppScreen() {
  const { session, isLoadingSession, login, logout, loginError, clearLoginError } = useAuth();
  const { state: pushState, errorDetail: pushErrorDetail, retry: retryPushRegistration } =
    usePushRegistration(session);

  if (isLoadingSession) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginScreen login={login} loginError={loginError} clearLoginError={clearLoginError} />;
  }

  return (
    <MarketplaceScreen
      onLogout={logout}
      pushState={pushState}
      pushErrorDetail={pushErrorDetail}
      retryPushRegistration={retryPushRegistration}
    />
  );
}

type LoginScreenProps = {
  login: (email: string, password: string) => Promise<void>;
  loginError: string | null;
  clearLoginError: () => void;
};

function LoginScreen({ login, loginError, clearLoginError }: LoginScreenProps) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const canSubmit = email.includes("@") && password.length >= 6 && !isSubmitting;

  const handleLogin = async (): Promise<void> => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      await login(email, password);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.loginScreen}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardWrap}
        >
          <ScrollView
            contentContainerStyle={styles.loginContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoWrap}>
              <Image
                accessibilityLabel="MatchMyDriver logo"
                resizeMode="contain"
                source={require("../assets/images/logo.jpg")}
                style={styles.logoImage}
              />
            </View>

            <View style={styles.loginHeader}>
              <Text style={styles.loginTitle}>MatchMyDriver</Text>
              <Text style={styles.loginSubtitle}>
                Log in met uw bestaande chauffeursaccount om openstaande ritopdrachten te bekijken.
              </Text>
            </View>

            <View style={styles.loginPanel}>
              <View style={styles.fieldWrap}>
                <Mail size={19} color={palette.gray} />
                <TextInput
                  accessibilityLabel="E-mailadres"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={(value: string) => {
                    clearLoginError();
                    setEmail(value);
                  }}
                  placeholder="E-mailadres"
                  placeholderTextColor={palette.textMuted}
                  style={styles.input}
                  value={email}
                />
              </View>

              <View style={styles.fieldWrap}>
                <LockIcon color={palette.gray} />
                <TextInput
                  accessibilityLabel="Wachtwoord"
                  autoCapitalize="none"
                  onChangeText={(value: string) => {
                    clearLoginError();
                    setPassword(value);
                  }}
                  onSubmitEditing={handleLogin}
                  placeholder="Wachtwoord"
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry={!isPasswordVisible}
                  style={styles.input}
                  value={password}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsPasswordVisible((current: boolean) => !current)}
                  style={styles.eyeButton}
                >
                  {isPasswordVisible ? (
                    <EyeOff size={20} color={palette.gray} />
                  ) : (
                    <Eye size={20} color={palette.gray} />
                  )}
                </Pressable>
              </View>

              {loginError ? (
                <View style={styles.errorBox}>
                  <X size={16} color={palette.danger} />
                  <Text style={styles.errorText}>{loginError}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={handleLogin}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryPressed,
                  !canSubmit && styles.primaryDisabled,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={palette.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Inloggen</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.helpBox}>
              <Text style={styles.helpTitle}>Geen account of wachtwoord vergeten?</Text>
              <Text style={styles.helpText}>
                Chauffeurs worden aangemaakt door MatchMyDriver. Neem contact op met het platform
                of stel uw wachtwoord in via de link die u per e-mail heeft ontvangen.
              </Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function LockIcon({ color }: { color: string }) {
  return <ShieldCheck size={19} color={color} />;
}

type MarketplaceScreenProps = {
  onLogout: () => Promise<void>;
  pushState: PushRegistrationState;
  pushErrorDetail: string | null;
  retryPushRegistration: () => void;
};

function MarketplaceScreen({
  onLogout,
  pushState,
  pushErrorDetail,
  retryPushRegistration,
}: MarketplaceScreenProps) {
  const { session } = useAuth();
  const { pushEnabled } = useNotificationPreferences();
  const queryClient = useQueryClient();
  const [selectedRide, setSelectedRide] = useState<RideAssignment | null>(null);
  const [bidAmount, setBidAmount] = useState<string>("");
  const [responseMessage, setResponseMessage] = useState<string>(
    "Beschikbaar voor deze opdracht. Mijn gegevens zijn bekend via MatchMyDriver.",
  );
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);
  const [profileVisible, setProfileVisible] = useState<boolean>(false);

  const ridesQuery = useQuery({
    queryKey: ["driver-rides", session?.driver.id],
    queryFn: async (): Promise<RideAssignment[]> => {
      if (!session) return [];
      return MatchMyDriverApi.getOpenRides(session.token);
    },
    enabled: Boolean(session),
    retry: 1,
    refetchInterval: pushEnabled ? 60_000 : false,
  });



  const rides = useMemo<RideAssignment[]>(() => {
    const source = ridesQuery.data ?? [];
    return [...source].sort((a, b) => {
      if (a.alreadyResponded === b.alreadyResponded) return 0;
      return a.alreadyResponded ? 1 : -1;
    });
  }, [ridesQuery.data]);

  const bidMutation = useMutation({
    mutationFn: async (params: { rideId: string; isFixedPrice: boolean; amount: number | undefined; message: string }): Promise<BidResult> => {
      if (!session) throw new Error("Geen actieve chauffeurssessie.");
      // Voor vaste-prijsritten sturen we alleen een bericht (bid_amount wordt
      // door de server genegeerd). Voor biedritten sturen we bid_amount mee.
      const body: { bid_amount?: number; message?: string } = {};
      if (!params.isFixedPrice && params.amount !== undefined) {
        body.bid_amount = params.amount;
      }
      if (params.message.trim()) {
        body.message = params.message.trim();
      }
      return MatchMyDriverApi.bidOnRide(session.token, params.rideId, body);
    },
    onSuccess: async (result: BidResult): Promise<void> => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (selectedRide) {
        setConfirmation({
          reference: selectedRide.reference,
          // Gebruik het bedrag uit het API-antwoord; voor vaste-prijsritten
          // is dat null, dan tonen we het vaste tarief uit de rit zelf.
          amount: result.bid_amount !== null ? result.bid_amount : selectedRide.fixedPrice,
          type: result.is_interest ? "fixed" : "bid",
        });
      }
      setSelectedRide(null);
      setBidAmount("");
      await queryClient.invalidateQueries({ queryKey: ["driver-rides", session?.driver.id] });
    },
    onError: (error: Error): void => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Alert.alert("Bod niet geplaatst", error.message || "Er is een fout opgetreden. Probeer het opnieuw.");
    },
  });

  const openRide = useCallback((ride: RideAssignment): void => {
    setSelectedRide(ride);
    setBidAmount(ride.fixedPrice ? String(ride.fixedPrice) : "");
  }, []);

  const submitRideResponse = (): void => {
    if (!selectedRide) return;
    const normalizedAmount = Number(bidAmount.replace(",", "."));
    let amount: number | undefined = undefined;

    if (!selectedRide.isFixedPrice) {
      if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        Alert.alert("Bedrag nodig", "Vul een geldig biedbedrag in voor deze rit.");
        return;
      }
      amount = normalizedAmount;
    }

    bidMutation.mutate({
      rideId: selectedRide.id,
      isFixedPrice: selectedRide.isFixedPrice,
      amount,
      message: responseMessage,
    });
  };

  const notificationBadge = useMemo(() => {
    if (pushEnabled) {
      return { label: "Pushmeldingen aan", color: palette.success, bg: "#ecfdf5" };
    }
    return { label: "Pushmeldingen uit", color: palette.gray, bg: "#f3f4f6" };
  }, [pushEnabled]);

  return (
    <View style={styles.marketScreen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.marketContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={ridesQuery.isRefetching && !ridesQuery.isLoading}
              onRefresh={() => ridesQuery.refetch()}
              tintColor={palette.primary}
              colors={[palette.primary]}
            />
          }
        >
          <View style={styles.marketHeader}>
            <Pressable
              accessibilityRole="button"
              style={styles.profileButton}
              onPress={() => setProfileVisible(true)}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {(session?.driver.name ?? "C").charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.driverIntro}>
                <Text style={styles.kicker}>Welkom terug</Text>
                <Text style={styles.driverName} numberOfLines={1}>
                  {session?.driver.name ?? "Chauffeur"}
                </Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setProfileVisible(true)} style={styles.bellButton}>
              <Bell size={20} color={palette.primary} />
            </Pressable>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.livePill}>
                <Sparkles size={15} color={palette.primary} />
                <Text style={styles.livePillText}>Rittenmarktplaats</Text>
              </View>
              <View style={[styles.notificationPill, { backgroundColor: notificationBadge.bg }]}>
                <Bell size={14} color={notificationBadge.color} />
                <Text style={[styles.notificationText, { color: notificationBadge.color }]}>
                  {notificationBadge.label}
                </Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>{rides.length} openstaande opdrachten</Text>
            <Text style={styles.heroSubtitle}>
              Bied met één druk op de knop. MatchMyDriver gebruikt uw bestaande chauffeursprofiel,
              dus u vult geen contactgegevens opnieuw in.
            </Text>
          </View>

          {ridesQuery.isError ? (
            <View style={styles.apiNotice}>
              <Text style={styles.apiNoticeTitle}>Ritopdrachten niet bereikbaar</Text>
              <Text style={styles.apiNoticeText}>
                Er kon geen verbinding worden gemaakt met MatchMyDriver. Controleer uw
                internetverbinding en trek de lijst naar beneden om het opnieuw te proberen.
              </Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Beschikbare ritopdrachten</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => ridesQuery.refetch()}
              style={styles.refreshButton}
            >
              <RefreshCw size={15} color={palette.primary} />
              <Text style={styles.refreshText}>Vernieuwen</Text>
            </Pressable>
          </View>

          {ridesQuery.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>Ritopdrachten ophalen...</Text>
            </View>
          ) : rides.length === 0 ? (
            <View style={styles.emptyBox}>
              <CarFront size={36} color={palette.gray} />
              <Text style={styles.emptyTitle}>Op dit moment geen openstaande ritten</Text>
              <Text style={styles.emptyText}>
                Zodra er een nieuwe ritopdracht wordt geplaatst, verschijnt deze hier en ontvangt u
                een melding.
              </Text>
            </View>
          ) : (
            <View style={styles.rideList}>
              {rides.map((ride: RideAssignment) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  isResponding={bidMutation.isPending && selectedRide?.id === ride.id}
                  onView={openRide}
                  onRespond={openRide}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <RideDetailSheet
          ride={selectedRide}
          bidAmount={bidAmount}
          setBidAmount={setBidAmount}
          responseMessage={responseMessage}
          setResponseMessage={setResponseMessage}
          isSubmitting={bidMutation.isPending}
          onSubmit={submitRideResponse}
          onClose={() => setSelectedRide(null)}
        />

        <ConfirmationOverlay
          confirmation={confirmation}
          onClose={() => setConfirmation(null)}
        />

        <ProfileSheet
          visible={profileVisible}
          name={session?.driver.name ?? "Chauffeur"}
          email={session?.driver.email ?? ""}
          phone={session?.driver.phone}
          companyName={session?.driver.companyName}
          driverNumber={session?.driver.driverNumber}
          pushState={pushState}
          pushErrorDetail={pushErrorDetail}
          retryPushRegistration={retryPushRegistration}
          onLogout={onLogout}
          onClose={() => setProfileVisible(false)}
        />
      </SafeAreaView>
    </View>
  );
}

type RideDetailSheetProps = {
  ride: RideAssignment | null;
  bidAmount: string;
  setBidAmount: (value: string) => void;
  responseMessage: string;
  setResponseMessage: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
};

function RideDetailSheet({
  ride,
  bidAmount,
  setBidAmount,
  responseMessage,
  setResponseMessage,
  isSubmitting,
  onSubmit,
  onClose,
}: RideDetailSheetProps) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={ride !== null}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        {ride ? (
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.referencePill}>
                <Text style={styles.referenceText}>{ride.reference}</Text>
              </View>
              <View style={styles.sheetBadgeRow}>
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
              </View>
            </View>

            <Text style={styles.sheetTitle}>
              {ride.isFixedPrice ? "Interesse tonen" : "Bod plaatsen"}
            </Text>
            <Text style={styles.sheetSubtitle}>
              Uw naam, e-mail en telefoonnummer worden automatisch uit uw chauffeursaccount
              meegestuurd.
            </Text>

            <View style={styles.detailRouteBlock}>
              <View style={styles.detailRouteIconWrap}>
                <View style={styles.pinDot} />
                <View style={styles.routeLine} />
                <View style={styles.pinDotDest} />
              </View>
              <View style={styles.detailRouteTextWrap}>
                <View style={styles.addressRow}>
                  <MapPin size={15} color={palette.primary} />
                  <Text style={styles.detailAddress} numberOfLines={2}>{ride.pickupAddress}</Text>
                </View>
                <View style={styles.addressRow}>
                  <MapPin size={15} color={palette.success} />
                  <Text style={styles.detailAddress} numberOfLines={2}>{ride.destinationAddress}</Text>
                </View>
              </View>
            </View>

            <View style={styles.detailMetaGrid}>
              <View style={styles.detailMetaItem}>
                <Clock3 size={15} color={palette.gray} />
                <View>
                  <Text style={styles.detailMetaLabel}>Datum & tijd</Text>
                  <Text style={styles.detailMetaText}>{formatRideDate(ride.pickupAt)}</Text>
                </View>
              </View>
              {ride.passengerCount ? (
                <View style={styles.detailMetaItem}>
                  <User size={15} color={palette.gray} />
                  <View>
                    <Text style={styles.detailMetaLabel}>Passagiers</Text>
                    <Text style={styles.detailMetaText}>
                      {ride.passengerCount} passagier{ride.passengerCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
              ) : null}
              {ride.distanceKm ? (
                <View style={styles.detailMetaItem}>
                  <MapPin size={15} color={palette.gray} />
                  <View>
                    <Text style={styles.detailMetaLabel}>Afstand</Text>
                    <Text style={styles.detailMetaText}>{ride.distanceKm} km</Text>
                  </View>
                </View>
              ) : null}
              {ride.travelDuration || ride.durationMin ? (
                <View style={styles.detailMetaItem}>
                  <Clock3 size={15} color={palette.gray} />
                  <View>
                    <Text style={styles.detailMetaLabel}>Reistijd</Text>
                    <Text style={styles.detailMetaText}>
                      {ride.travelDuration ?? formatDurationMinutes(ride.durationMin)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {ride.biddingClosesAt ? (
              <View style={styles.sheetDeadlineRow}>
                <Clock3 size={15} color={palette.gray} />
                <Text style={styles.sheetDeadlineLabel}>Bieddeadline</Text>
                <CountdownTimer deadline={ride.biddingClosesAt} compact />
              </View>
            ) : null}

            {ride.luggageItems && ride.luggageItems.length > 0 ? (
              <View style={styles.notesBox}>
                <View style={styles.sectionLabelRow}>
                  <Backpack size={14} color={palette.gray} />
                  <Text style={styles.notesLabel}>Bagage</Text>
                </View>
                <View style={styles.chipRow}>
                  {ride.luggageItems.map((item, index) => (
                    <View key={`luggage-${index}`} style={styles.chip}>
                      <Text style={styles.chipText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : ride.noLuggage ? (
              <View style={styles.notesBox}>
                <View style={styles.sectionLabelRow}>
                  <Backpack size={14} color={palette.gray} />
                  <Text style={styles.notesLabel}>Bagage</Text>
                </View>
                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>Geen bagage</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {ride.notes ? (
              <View style={styles.notesBox}>
                <View style={styles.sectionLabelRow}>
                  <Check size={14} color={palette.gray} />
                  <Text style={styles.notesLabel}>Opmerkingen</Text>
                </View>
                <Text style={styles.notesText}>{ride.notes}</Text>
              </View>
            ) : null}

            {ride.preferences && ride.preferences.length > 0 ? (
              <View style={styles.notesBox}>
                <View style={styles.sectionLabelRow}>
                  <Star size={14} color={palette.gray} />
                  <Text style={styles.notesLabel}>Voorkeuren</Text>
                </View>
                <View style={styles.chipRow}>
                  {ride.preferences.map((pref, index) => (
                    <View key={`pref-${index}`} style={styles.preferenceChip}>
                      <Text style={styles.preferenceChipText}>{pref}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {ride.createdAt ? (
              <Text style={styles.postedText}>
                Geplaatst op {new Intl.DateTimeFormat("nl-NL", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(ride.createdAt))}
              </Text>
            ) : null}

            {ride.isFixedPrice ? (
              <View style={styles.fixedPriceBox}>
                <Text style={styles.fixedPriceLabel}>Vast tarief</Text>
                <Text style={styles.fixedPriceValue}>{formatEuro(ride.fixedPrice)}</Text>
              </View>
            ) : (
              <View style={styles.bidField}>
                <Text style={styles.bidCurrency}>€</Text>
                <TextInput
                  accessibilityLabel="Biedbedrag"
                  keyboardType="decimal-pad"
                  onChangeText={setBidAmount}
                  placeholder="Uw bod in euro's"
                  placeholderTextColor={palette.textMuted}
                  style={styles.bidInput}
                  value={bidAmount}
                />
              </View>
            )}

            <TextInput
              accessibilityLabel="Bericht aan klant"
              multiline
              onChangeText={setResponseMessage}
              placeholder="Kort bericht (optioneel)"
              placeholderTextColor={palette.textMuted}
              style={styles.messageInput}
              value={responseMessage}
            />

            <View style={styles.sheetActions}>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Annuleren</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onSubmit}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.sheetPrimaryButton,
                  pressed && styles.sheetPrimaryPressed,
                  isSubmitting && styles.disabled,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={palette.white} />
                ) : (
                  <Text style={styles.sheetPrimaryText}>
                    {ride.isFixedPrice ? "Interesse tonen" : "Bod plaatsen"}
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

type ConfirmationOverlayProps = {
  confirmation: ConfirmationData | null;
  onClose: () => void;
};

function ConfirmationOverlay({ confirmation, onClose }: ConfirmationOverlayProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.85));

  useEffect(() => {
    if (confirmation) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        onClose();
      }, 3500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmation]);

  if (!confirmation) return null;

  const successTitle = confirmation.type === "fixed" ? "Interesse Geregistreerd" : "Bod Succesvol Geplaatst";

  return (
    <Modal animationType="none" transparent visible={confirmation !== null} onRequestClose={onClose}>
      <Pressable style={styles.confirmBackdrop} onPress={onClose}>
        <Animated.View
          style={[styles.confirmCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.confirmHeaderBar}>
            <CheckCircle2 size={52} color={palette.white} />
          </View>
          <View style={styles.confirmBody}>
            <Text style={styles.confirmTitle}>{successTitle}</Text>
            {confirmation.amount !== undefined ? (
              <Text style={styles.confirmAmount}>{formatEuro(confirmation.amount)}</Text>
            ) : null}
            <Text style={styles.confirmReference}>
              Opdrachtnummer: {confirmation.reference}
            </Text>
            <Text style={styles.confirmSubtext}>
              Uw reactie is verzonden met de gegevens uit uw chauffeursaccount. MatchMyDriver
              neemt contact met u op bij een match.
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

type ProfileSheetProps = {
  visible: boolean;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  driverNumber?: string;
  pushState: PushRegistrationState;
  pushErrorDetail: string | null;
  retryPushRegistration: () => void;
  onLogout: () => Promise<void>;
  onClose: () => void;
};

function ProfileSheet({
  visible,
  name,
  email,
  phone,
  companyName,
  driverNumber,
  pushState,
  pushErrorDetail,
  retryPushRegistration,
  onLogout,
  onClose,
}: ProfileSheetProps) {
  const {
    pushEnabled,
    soundEnabled,
    vibrationEnabled,
    setPushEnabled,
    setSoundEnabled,
    setVibrationEnabled,
  } = useNotificationPreferences();

  const translateY = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);

  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [translateY]);

  const onGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { translationY } = event.nativeEvent;
      // Only allow dragging down; ignore upward swipes.
      if (translationY > 0 && scrollY.current <= 0) {
        translateY.setValue(translationY);
      }
    },
    [translateY],
  );

  const onHandlerStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationY, velocityY } = event.nativeEvent;
      if (state !== State.END) return;

      const dismissThreshold = 120;
      const velocityThreshold = 500;
      const shouldDismiss = translationY > dismissThreshold || velocityY > velocityThreshold;

      if (shouldDismiss && scrollY.current <= 0) {
        Animated.timing(translateY, {
          toValue: 800,
          useNativeDriver: true,
          duration: 200,
        }).start(() => {
          translateY.setValue(0);
          onClose();
        });
      } else {
        resetPosition();
      }
    },
    [onClose, resetPosition, translateY],
  );

  const pushStateLabel = useMemo(() => {
    switch (pushState) {
      case "registered":
        return "Geregistreerd voor push";
      case "denied":
        return "Pushmeldingen geweigerd";
      case "disabled":
        return "Pushmeldingen uitgeschakeld";
      case "unavailable":
        return Platform.OS === "web"
          ? "Niet beschikbaar in web-preview"
          : "Push-token niet beschikbaar";
      case "failed":
        return "Registratie mislukt";
      default:
        return "Pushmeldingen laden...";
    }
  }, [pushState]);

  const pushStateColor = useMemo(() => {
    switch (pushState) {
      case "registered":
        return palette.success;
      case "denied":
      case "failed":
      case "unavailable":
        return palette.danger;
      default:
        return palette.gray;
    }
  }, [pushState]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetY={[-10, 10]}
        failOffsetX={[-40, 40]}
      >
        <Animated.View
          style={[
            styles.profileSheet,
            { transform: [{ translateY: translateY }] },
          ]}
        >
          <View style={styles.sheetHandle} />
          <ScrollView
            contentContainerStyle={styles.profileScrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
        <Text style={styles.profileTitle}>Mijn profiel</Text>

        <View style={styles.profileAvatarWrap}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileName}>{name}</Text>
          {driverNumber ? (
            <View style={styles.driverNumberBadge}>
              <Text style={styles.driverNumberText}>{driverNumber}</Text>
            </View>
          ) : null}
          {companyName ? (
            <View style={styles.companyRow}>
              <Building2 size={14} color={palette.gray} />
              <Text style={styles.companyText}>{companyName}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.profileInfoList}>
          <View style={styles.profileInfoItem}>
            <Mail size={18} color={palette.primary} />
            <Text style={styles.profileInfoText}>{email}</Text>
          </View>
          {phone ? (
            <View style={styles.profileInfoItem}>
              <Phone size={18} color={palette.primary} />
              <Text style={styles.profileInfoText}>{phone}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.notificationSection}>
          <Text style={styles.notificationSectionTitle}>Meldingen</Text>
          <View style={styles.notificationToggle}>
            <View style={styles.notificationToggleTextWrap}>
              <Text style={styles.notificationToggleTitle}>Pushmeldingen</Text>
              <Text style={styles.notificationToggleSubtitle}>
                Ontvang meldingen bij nieuwe ritopdrachten
              </Text>
            </View>
            <Switch
              accessibilityLabel="Pushmeldingen aan of uit"
              onValueChange={setPushEnabled}
              thumbColor={pushEnabled ? palette.primary : palette.textMuted}
              trackColor={{ false: palette.border, true: "#dbe7ff" }}
              value={pushEnabled}
            />
          </View>
          <View style={[styles.notificationToggle, !pushEnabled && styles.notificationToggleMuted]}>
            <View style={styles.notificationToggleTextWrap}>
              <Text style={styles.notificationToggleTitle}>Geluid</Text>
              <Text style={styles.notificationToggleSubtitle}>Speel een geluid af bij meldingen</Text>
            </View>
            <Switch
              accessibilityLabel="Geluid bij meldingen aan of uit"
              disabled={!pushEnabled}
              onValueChange={setSoundEnabled}
              thumbColor={soundEnabled ? palette.primary : palette.textMuted}
              trackColor={{ false: palette.border, true: "#dbe7ff" }}
              value={soundEnabled && pushEnabled}
            />
          </View>
          <View style={[styles.notificationToggle, !pushEnabled && styles.notificationToggleMuted]}>
            <View style={styles.notificationToggleTextWrap}>
              <Text style={styles.notificationToggleTitle}>Trilling</Text>
              <Text style={styles.notificationToggleSubtitle}>Tril bij meldingen (Android)</Text>
            </View>
            <Switch
              accessibilityLabel="Trilling bij meldingen aan of uit"
              disabled={!pushEnabled}
              onValueChange={setVibrationEnabled}
              thumbColor={vibrationEnabled ? palette.primary : palette.textMuted}
              trackColor={{ false: palette.border, true: "#dbe7ff" }}
              value={vibrationEnabled && pushEnabled}
            />
          </View>
          <Text style={styles.notificationHint}>
            U kunt pushmeldingen ook volledig uitschakelen via de instellingen van uw telefoon.
          </Text>

          <View style={styles.pushStatusRow}>
            <View style={[styles.pushStatusDot, { backgroundColor: pushStateColor }]} />
            <Text style={styles.pushStatusText}>{pushStateLabel}</Text>
          </View>

          {pushState === "failed" && pushErrorDetail ? (
            <View style={styles.pushErrorBox}>
              <Text style={styles.pushErrorTitle}>Foutdetail:</Text>
              <Text style={styles.pushErrorText}>{pushErrorDetail}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  retryPushRegistration();
                }}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && styles.retryButtonPressed,
                ]}
              >
                <Text style={styles.retryButtonText}>Opnieuw proberen</Text>
              </Pressable>
            </View>
          ) : null}

          {pushState === "registered" ? (
            <Text style={styles.pushSuccessHint}>
              ✓ Backend polling actief — u ontvangt meldingen bij nieuwe ritten, ook als de app gesloten is.
            </Text>
          ) : null}

        </View>

        <View style={styles.versionRow}>
          <Text style={styles.versionText}>
            Versie {Constants.expoConfig?.version ?? "?"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await onLogout();
            onClose();
          }}
          style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
        >
          <LogOut size={19} color={palette.danger} />
          <Text style={styles.logoutText}>Uitloggen</Text>
        </Pressable>
          </ScrollView>
        </Animated.View>
      </PanGestureHandler>
    </Modal>
  );
}

function LoadingScreen() {
  return (
    <View style={[styles.loadingScreen, styles.loadingCenter]}>
      <StatusBarLight />
      <ActivityIndicator color={palette.primary} size="large" />
      <Text style={styles.loadingText}>Chauffeursessie laden...</Text>
    </View>
  );
}

function StatusBarLight() {
  return null;
}



const styles = StyleSheet.create({
  loginScreen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: { flex: 1 },
  keyboardWrap: { flex: 1 },
  loginContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: "center",
    gap: 28,
  },
  logoWrap: { alignSelf: "center" },
  logoImage: {
    width: 112,
    height: 112,
    borderRadius: 24,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  loginHeader: { gap: 10, alignItems: "center" },
  loginTitle: {
    color: palette.primary,
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  loginSubtitle: {
    color: palette.gray,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
  },
  loginPanel: {
    backgroundColor: palette.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 14,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  fieldWrap: {
    minHeight: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: "500",
    minHeight: 48,
  },
  eyeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: palette.dangerSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: palette.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: { transform: [{ scale: 0.98 }], backgroundColor: palette.primaryDeep },
  primaryDisabled: { opacity: 0.4 },
  primaryButtonText: { color: palette.white, fontWeight: "700", fontSize: 16 },
  helpBox: {
    backgroundColor: "#eef4ff",
    borderRadius: 10,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "#dbe7ff",
  },
  helpTitle: { color: palette.primary, fontSize: 14, fontWeight: "700" },
  helpText: { color: palette.gray, fontSize: 13, lineHeight: 19, fontWeight: "500" },
    marketScreen: { flex: 1, backgroundColor: palette.background },
  marketContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 },
  marketHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  profileButton: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.white, fontSize: 18, fontWeight: "700" },
  driverIntro: { gap: 2, flex: 1 },
  kicker: { color: palette.gray, fontSize: 12, fontWeight: "600" },
  driverName: { color: palette.text, fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#eef4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    borderRadius: 14,
    padding: 18,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  heroTopRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  livePill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#eef4ff",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  livePillText: { color: palette.primary, fontSize: 12, fontWeight: "700" },
  notificationPill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  notificationText: { color: palette.success, fontSize: 12, fontWeight: "700" },
  heroTitle: { color: palette.text, fontSize: 26, fontWeight: "800", letterSpacing: -0.6 },
  heroSubtitle: { color: palette.gray, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  apiNotice: {
    borderRadius: 10,
    padding: 14,
    backgroundColor: "#eef4ff",
    borderWidth: 1,
    borderColor: "#dbe7ff",
    gap: 4,
  },
  apiNoticeTitle: { color: palette.primary, fontWeight: "700", fontSize: 14 },
  apiNoticeText: { color: palette.gray, fontWeight: "500", fontSize: 13, lineHeight: 19 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionTitle: { color: palette.text, fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  refreshButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#eef4ff",
  },
  refreshText: { color: palette.primary, fontSize: 13, fontWeight: "600" },
  rideList: { gap: 12 },
  loadingBox: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingScreen: { flex: 1, backgroundColor: palette.background },
  loadingCenter: { alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: palette.gray, fontSize: 15, fontWeight: "500" },
  emptyBox: {
    borderRadius: 14,
    padding: 28,
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: { color: palette.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptyText: { color: palette.gray, textAlign: "center", lineHeight: 21, fontSize: 14, fontWeight: "500" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    maxHeight: "90%",
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 34,
    gap: 14,
  },
  sheetBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  studentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: palette.primary,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  studentText: { color: palette.white, fontSize: 11, fontWeight: "800" },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: palette.border,
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  referencePill: {
    backgroundColor: "#eef4ff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  referenceText: { color: palette.primary, fontSize: 12, fontWeight: "700" },
  urgentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  urgentText: { color: palette.accent, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  sheetTitle: { color: palette.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  sheetSubtitle: { color: palette.gray, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  detailRouteBlock: { flexDirection: "row", gap: 12 },
  detailRouteIconWrap: { width: 22, alignItems: "center", paddingTop: 3 },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary },
  routeLine: { width: 2, flex: 1, minHeight: 24, backgroundColor: palette.border, marginVertical: 2 },
  pinDotDest: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.success },
  detailRouteTextWrap: { flex: 1, gap: 10 },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  detailAddress: { flex: 1, color: palette.text, fontSize: 15, fontWeight: "600", lineHeight: 21 },
  detailMetaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailMetaItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: palette.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 140,
    flex: 1,
  },
  detailMetaLabel: { color: palette.gray, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  detailMetaText: { color: palette.text, fontSize: 14, fontWeight: "600" },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: "#0369a1", fontSize: 13, fontWeight: "600" },
  preferenceChip: {
    backgroundColor: palette.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  preferenceChipText: { color: palette.white, fontSize: 13, fontWeight: "600" },
  postedText: { color: palette.gray, fontSize: 12, fontWeight: "500", textAlign: "right" },
  sheetDeadlineRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sheetDeadlineLabel: { color: palette.gray, fontSize: 13, fontWeight: "600", marginRight: 4 },
  notesBox: {
    backgroundColor: palette.background,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  notesLabel: { color: palette.gray, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  notesText: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  fixedPriceBox: {
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
    padding: 16,
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  fixedPriceLabel: { color: palette.success, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  fixedPriceValue: { color: palette.text, fontSize: 30, fontWeight: "800" },
  bidField: {
    minHeight: 60,
    borderRadius: 10,
    borderColor: palette.border,
    borderWidth: 1,
    backgroundColor: palette.background,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  bidCurrency: { color: palette.primary, fontSize: 26, fontWeight: "800" },
  bidInput: { flex: 1, color: palette.text, fontSize: 26, fontWeight: "800" },
  messageInput: {
    minHeight: 84,
    textAlignVertical: "top",
    borderRadius: 10,
    borderColor: palette.border,
    borderWidth: 1,
    backgroundColor: palette.background,
    color: palette.text,
    padding: 14,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryButtonText: { color: palette.text, fontSize: 15, fontWeight: "700" },
  sheetPrimaryButton: {
    flex: 1.4,
    minHeight: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  sheetPrimaryPressed: { transform: [{ scale: 0.98 }], backgroundColor: palette.primaryDeep },
  disabled: { opacity: 0.55 },
  sheetPrimaryText: { color: palette.white, fontSize: 15, fontWeight: "700" },

  // Confirmation overlay
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  confirmCard: {
    backgroundColor: palette.white,
    borderRadius: 18,
    overflow: "hidden",
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 10,
  },
  confirmHeaderBar: {
    backgroundColor: palette.success,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBody: { padding: 22, gap: 8, alignItems: "center" },
  confirmTitle: { color: palette.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  confirmAmount: { color: palette.success, fontSize: 32, fontWeight: "800" },
  confirmReference: { color: palette.gray, fontSize: 14, fontWeight: "600" },
  confirmSubtext: {
    color: palette.gray,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontWeight: "500",
    marginTop: 4,
  },

  // Profile sheet
  profileSheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 34,
    maxHeight: "90%",
    overflow: "hidden",
  },
  profileScrollContent: {
    paddingHorizontal: 20,
    gap: 18,
    paddingBottom: 20,
  },
  profileTitle: { color: palette.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  profileAvatarWrap: { alignItems: "center", gap: 8 },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { color: palette.white, fontSize: 30, fontWeight: "700" },
  profileName: { color: palette.text, fontSize: 22, fontWeight: "700" },
  driverNumberBadge: {
    backgroundColor: palette.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  driverNumberText: {
    color: palette.white,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  companyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  companyText: { color: palette.gray, fontSize: 14, fontWeight: "600" },
  profileInfoList: { gap: 10 },
  profileInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  profileInfoText: { color: palette.text, fontSize: 15, fontWeight: "600" },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  logoutPressed: { transform: [{ scale: 0.98 }] },
  logoutText: { color: palette.danger, fontSize: 16, fontWeight: "700" },
  notificationSection: { gap: 10 },
  notificationSectionTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
  notificationToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: palette.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notificationToggleMuted: { opacity: 0.6 },
  notificationToggleTextWrap: { flex: 1, gap: 2 },
  notificationToggleTitle: { color: palette.text, fontSize: 15, fontWeight: "600" },
  notificationToggleSubtitle: { color: palette.gray, fontSize: 13, fontWeight: "500" },
  notificationHint: { color: palette.gray, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  pushStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  pushStatusDot: { width: 8, height: 8, borderRadius: 4 },
  pushStatusText: { color: palette.text, fontSize: 13, fontWeight: "600" },
  retryButtonPressed: { transform: [{ scale: 0.98 }] },
  pushErrorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: palette.danger,
    gap: 6,
  },
  pushErrorTitle: { color: palette.danger, fontSize: 13, fontWeight: "700" },
  pushErrorText: { color: "#7f1d1d", fontSize: 12, fontWeight: "500", lineHeight: 17 },
  retryButton: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: palette.danger,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  retryButtonText: { color: palette.white, fontSize: 13, fontWeight: "700" },
  pushSuccessHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: palette.success,
    lineHeight: 17,
  },
  versionRow: { alignItems: "center", paddingVertical: 8 },
  versionText: { color: palette.gray, fontSize: 12, fontWeight: "600" },
});

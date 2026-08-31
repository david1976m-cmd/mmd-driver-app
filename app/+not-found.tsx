import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Niet gevonden" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Deze pagina bestaat niet.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Terug naar ritten</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: palette.background },
  title: { fontSize: 20, fontWeight: "700", color: palette.text },
  link: { marginTop: 15, paddingVertical: 15 },
  linkText: { fontSize: 14, color: palette.primary, fontWeight: "700" },
});

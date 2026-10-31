import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { ToastProvider } from '@/components/Toast'
import { DialogProvider } from '@/components/ActionDialog'
import { PendingCountsProvider } from '@/hooks/usePendingCounts'
import { PhoneAlerts } from '@/components/PhoneAlerts'
import { colors } from '@/theme'

/**
 * The navigation shell.
 *
 * The session decides which half of the tree exists at all: while signed out the
 * only registered route is `login`, and once signed in the tabs and detail
 * screens replace it. `Stack.Protected` is what Expo Router provides for exactly
 * this, so there is no redirect flash and no way to deep-link into a staff screen
 * without a session.
 */
function RootNavigator() {
  const { ready, token } = useAuth()

  // While a saved sign-in is being checked: the app's mark and a spinner, nothing that
  // looks like a form, so opening the app never seems to log out and back in again.
  if (!ready) {
    return (
      <View style={styles.splash} accessibilityRole="progressbar" accessibilityLabel="Opening Chess Admin">
        <View style={styles.logo} />
        <Text style={styles.title}>Chess Admin</Text>
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text }
      }}
    >
      <Stack.Protected guard={token !== null}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="matches" options={{ headerShown: true, title: 'Matches' }} />
        <Stack.Screen name="match/[id]" options={{ headerShown: true, title: 'Match' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="fraud" options={{ headerShown: true, title: 'Fraud and ledger' }} />
        <Stack.Screen name="audit" options={{ headerShown: true, title: 'Admin audit log' }} />
        <Stack.Screen name="support/[id]" options={{ headerShown: true, title: 'Conversation' }} />
        <Stack.Screen name="announcements" options={{ headerShown: true, title: 'Announcements' }} />
      </Stack.Protected>
      <Stack.Protected guard={token === null}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PendingCountsProvider>
        <ToastProvider>
          <DialogProvider>
            <StatusBar style="light" />
            <RootNavigator />
            <PhoneAlerts />
          </DialogProvider>
        </ToastProvider>
      </PendingCountsProvider>
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, borderWidth: 6, borderColor: colors.background },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  spinner: { marginTop: 8 }
})

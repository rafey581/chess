import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { login } from '@/lib/adminAuth'
import { apiBaseUrl } from '@/lib/config'
import { useAuth } from '@/auth/AuthContext'
import { Button, Field } from '@/components/ui'
import { colors, radius, spacing } from '@/theme'

/**
 * The staff sign-in.
 *
 * One step: email + password. There is no authenticator code - a correct password
 * gets a revocable server-side session immediately, protected by the per-account
 * and per-IP lockout and recorded in the admin audit trail.
 */
export default function LoginScreen(): ReactNode {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (!result.token || !result.user) {
        setError('Sign-in did not return a session. Try again.')
        return
      }
      await signIn(result.token, result.user)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo} />
            <Text style={styles.title}>Chess Arena</Text>
            <Text style={styles.subtitle}>Staff access</Text>
          </View>

          <View style={styles.card}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              textContentType="username"
              placeholder="admin@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="Your password"
            />
            <Button label="Sign in" variant="primary" onPress={submit} loading={busy} />
          </View>

          <Text style={styles.endpoint}>API: {apiBaseUrl()}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, justifyContent: 'center', flexGrow: 1 },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, borderWidth: 6, borderColor: colors.background },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md
  },
  error: { color: colors.negative, fontSize: 13 },
  endpoint: { color: colors.muted, fontSize: 11, textAlign: 'center' }
})

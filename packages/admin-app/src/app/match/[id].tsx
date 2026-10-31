import { Stack, useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text } from 'react-native'
import { api } from '@/lib/api'
import { useAsync } from '@/hooks/useAsync'
import { formatAmount, formatDateTime, humanize, jsonSummary } from '@/lib/format'
import type { AdminGameEvent, AdminMatch } from '@/lib/types'
import type { ReplayEvent } from '@/lib/replay'
import { Card, Empty, ErrorState, Loading, Pill, Row, Screen, SectionTitle } from '@/components/ui'
import { ReplayPanel } from '@/components/ReplayPanel'
import { colors, spacing } from '@/theme'

/**
 * One match: who played, what it paid, and the full replay.
 *
 * The event log is the authoritative record - the same events the server wrote
 * while the frame was live - so the replay is reconstructed rather than
 * remembered, and a disputed pot can be stepped through stroke by stroke.
 */
export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const matchId = typeof id === 'string' ? id : ''

  const matchState = useAsync(async () => {
    const matches = await api<AdminMatch[]>('/admin/matches')
    return matches.find((match) => match.id === matchId) ?? null
  }, [matchId])

  const eventsState = useAsync(
    () => api<AdminGameEvent[]>(`/admin/matches/${matchId}/events`),
    [matchId]
  )

  const match = matchState.data
  const events: ReplayEvent[] = (eventsState.data ?? []).map((event) => ({
    seq: event.seq,
    type: event.type,
    data: event.data
  }))

  const title = match ? match.players.map((player) => player.user.username).join(' vs ') || 'Match' : 'Match'

  return (
    <Screen refreshing={eventsState.refreshing} onRefresh={eventsState.reload}>
      <Stack.Screen options={{ title }} />

      {matchState.loading && !match ? <Loading /> : null}
      {matchState.error && !match ? <ErrorState message={matchState.error} onRetry={matchState.reload} /> : null}

      {match ? (
        <Card>
          <Pill label={humanize(match.status)} tone={match.status} />
          <Row label="Mode" value={`${humanize(match.matchType)} - ${match.format}`} />
          <Row label="Stake per player" value={`${formatAmount(match.stakePerPlayer)} USDT`} />
          <Row label="Reds" value={String(match.reds ?? 15)} />
          <Row
            label="Winner"
            value={match.players.find((player) => player.userId === match.winnerId)?.user.username ?? 'undecided'}
          />
          <Row label="Created" value={formatDateTime(match.createdAt)} />
          <Row label="Started" value={formatDateTime(match.startedAt)} />
          <Row label="Finished" value={formatDateTime(match.finishedAt)} />
          {match.resultJson ? <Row label="Result" value={jsonSummary(match.resultJson, 220)} /> : null}
        </Card>
      ) : null}

      <SectionTitle>Replay</SectionTitle>
      {eventsState.loading && events.length === 0 ? <Loading label="Loading events..." /> : null}
      {eventsState.error && events.length === 0 ? (
        <ErrorState message={eventsState.error} onRetry={eventsState.reload} />
      ) : null}
      {!eventsState.loading && !eventsState.error && events.length === 0 ? (
        <Empty label="No events recorded for this match." />
      ) : null}
      {events.length > 0 ? <ReplayPanel events={events} /> : null}

      <Text style={styles.footnote}>
        Replays are reconstructed with the same engine that ran the match, from the recorded events only.
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  footnote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: spacing.md }
})

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/theme'
import { Button, Card } from './ui'
import { ReplayTable, ReplayTablePlaceholder } from './ReplayTable'
import { collectMoves, eventLabel, stepAt, type ReplayEvent } from '@/lib/replay'

const PLAY_INTERVAL_MS = 650
const MAX_WINDOW_EVENTS = 12

/**
 * A scrubber over the recorded events.
 *
 * No slider: React Native has no built-in one and the community slider is another
 * native dependency. Step and play controls cover the job, and the event list
 * shows only the window the current stroke covers rather than thousands of rows.
 */
export function ReplayPanel({ events }: { events: ReplayEvent[] }): ReactNode {
  const moves = useMemo(() => collectMoves(events), [events])
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const total = moves.length + 1
  const snapshot = useMemo(() => stepAt(events, step), [events, step])

  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setStep((current) => {
        if (current >= total - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, PLAY_INTERVAL_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [playing, total])

  const atEnd = step >= total - 1
  const jump = (next: number): void => setStep(Math.min(Math.max(0, next), total - 1))

  const windowEvents = snapshot.move
    ? events.filter((event) => event.seq >= snapshot.startSeq && event.seq <= snapshot.endSeq).slice(0, MAX_WINDOW_EVENTS)
    : []

  return (
    <View style={styles.wrap}>
      {moves.length > 0 ? (
        <ReplayTable board={snapshot.board} lastMove={snapshot.lastMove} />
      ) : (
        <ReplayTablePlaceholder label="No moves were recorded for this match." />
      )}

      <Card style={styles.controls}>
        <Text style={styles.status}>
          {snapshot.move
            ? `game ${snapshot.game} - move ${snapshot.index}/${snapshot.total - 1}: ${snapshot.move.san}`
            : `start position - ${snapshot.total - 1} moves`}
        </Text>
        <View style={styles.buttonRow}>
          <Button label="|<" onPress={() => jump(0)} style={styles.stepButton} />
          <Button label="<" onPress={() => jump(step - 1)} style={styles.stepButton} />
          <Button
            label={playing ? 'Pause' : 'Play'}
            variant="primary"
            onPress={() => {
              if (atEnd) jump(0)
              setPlaying((current) => !current)
            }}
            style={styles.playButton}
          />
          <Button label=">" onPress={() => jump(step + 1)} style={styles.stepButton} />
          <Button label=">|" onPress={() => jump(total - 1)} style={styles.stepButton} />
        </View>
        <Text style={styles.summary}>
          {events.length} events - {moves.length} moves
        </Text>
      </Card>

      {windowEvents.length > 0 ? (
        <Card>
          <Text style={styles.windowTitle}>This move</Text>
          {windowEvents.map((event) => (
            <View key={event.seq} style={styles.eventRow}>
              <Text style={styles.eventSeq}>{event.seq}</Text>
              <Text style={styles.eventLabel}>{eventLabel(event)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  controls: { gap: spacing.sm },
  status: { color: colors.text, fontSize: 13, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  stepButton: { flex: 1, paddingHorizontal: spacing.sm, minHeight: 40 },
  playButton: { flex: 2 },
  summary: { color: colors.muted, fontSize: 12 },
  windowTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  eventRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: 2 },
  eventSeq: { color: colors.muted, fontSize: 12, width: 52 },
  eventLabel: { color: colors.text, fontSize: 12, flexShrink: 1 }
})

import { useState, type ReactNode } from 'react'
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native'
import { squareIndex } from '@snooker/shared'
import type { Piece } from '@snooker/shared'
import { colors, radius, spacing } from '@/theme'

/**
 * Draws a chess position with plain Views and text glyphs: no canvas, Skia or SVG
 * dependency. White is at the bottom.
 */
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const LIGHT = '#ecd9b6'
const DARK = '#b07a4f'
const LAST = '#e8c860'

export function ReplayTable({ board, lastMove }: { board: Array<Piece | null>; lastMove: { from: string; to: string } | null }): ReactNode {
  const [width, setWidth] = useState(0)
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width)
  const size = Math.max(0, width - 12)
  const cell = size / 8
  const highlighted = new Set(lastMove ? [squareIndex(lastMove.from), squareIndex(lastMove.to)] : [])

  const rows: ReactNode[] = []
  for (let rank = 7; rank >= 0; rank--) {
    const cells: ReactNode[] = []
    for (let file = 0; file < 8; file++) {
      const idx = rank * 8 + file
      const piece = board[idx]
      const white = piece ? piece === piece.toUpperCase() : false
      cells.push(
        <View
          key={idx}
          style={[styles.cell, { width: cell, height: cell, backgroundColor: highlighted.has(idx) ? LAST : (rank + file) % 2 ? LIGHT : DARK }]}
        >
          {piece ? (
            <Text style={[styles.piece, { fontSize: cell * 0.78, lineHeight: cell }, white ? styles.white : styles.black]}>
              {GLYPH[piece.toLowerCase()]}
            </Text>
          ) : null}
        </View>
      )
    }
    rows.push(
      <View key={rank} style={styles.row}>
        {cells}
      </View>
    )
  }

  return (
    <View style={styles.frame} onLayout={onLayout}>
      {size > 0 ? rows : null}
    </View>
  )
}

export function ReplayTablePlaceholder({ label }: { label: string }): ReactNode {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#3b2516', borderRadius: radius.md, padding: 6, alignItems: 'center' },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  piece: { textAlign: 'center' },
  white: { color: '#fdfcf8', textShadowColor: '#000', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } },
  black: { color: '#1c1c1f' },
  placeholder: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md
  },
  placeholderText: { color: colors.muted, fontSize: 13, paddingHorizontal: spacing.lg, textAlign: 'center' }
})

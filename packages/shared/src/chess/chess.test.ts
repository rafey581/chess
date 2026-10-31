import { describe, expect, it } from 'vitest'
import {
  findLegalMove,
  gameResult,
  initialPosition,
  legalMoves,
  makeMove,
  parseFen,
  positionKey,
  toFen,
  toSan,
  START_FEN
} from './engine.js'
import type { ChessPosition } from './engine.js'
import {
  applyChessMove,
  applyGameWinner,
  applyTimeout,
  chessSnapshot,
  createChessMatch,
  matchWinnerIndex,
  nextGame,
  turnSeat
} from './match.js'
import { chooseAiMove } from './ai.js'

function perft(pos: ChessPosition, depth: number): number {
  if (depth === 0) return 1
  let n = 0
  for (const m of legalMoves(pos)) n += perft(makeMove(pos, m), depth - 1)
  return n
}

describe('move generation (perft)', () => {
  it('matches the known counts from the start position', () => {
    const pos = initialPosition()
    expect(perft(pos, 1)).toBe(20)
    expect(perft(pos, 2)).toBe(400)
    expect(perft(pos, 3)).toBe(8902)
  })

  it('matches "Kiwipete" (castling, en passant, promotions, pins)', () => {
    const pos = parseFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1')
    expect(perft(pos, 1)).toBe(48)
    expect(perft(pos, 2)).toBe(2039)
  })

  it('matches position 3 (en passant discovered checks)', () => {
    const pos = parseFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1')
    expect(perft(pos, 1)).toBe(14)
    expect(perft(pos, 2)).toBe(191)
    expect(perft(pos, 3)).toBe(2812)
  })

  it('matches position 4 (promotion and castling under attack)', () => {
    const pos = parseFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1')
    expect(perft(pos, 1)).toBe(6)
    expect(perft(pos, 2)).toBe(264)
    expect(perft(pos, 3)).toBe(9467)
  })
})

describe('FEN and notation', () => {
  it('round-trips the start position', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN)
  })

  it('writes SAN with captures, castling, checks and mate', () => {
    let pos = initialPosition()
    const play = (from: string, to: string): string => {
      const m = findLegalMove(pos, { from, to })!
      const san = toSan(pos, m)
      pos = makeMove(pos, m)
      return san
    }
    // Scholar's mate.
    expect(play('e2', 'e4')).toBe('e4')
    expect(play('e7', 'e5')).toBe('e5')
    expect(play('d1', 'h5')).toBe('Qh5')
    expect(play('b8', 'c6')).toBe('Nc6')
    expect(play('f1', 'c4')).toBe('Bc4')
    expect(play('g8', 'f6')).toBe('Nf6')
    expect(play('h5', 'f7')).toBe('Qxf7#')
    expect(gameResult(pos)).toBe('CHECKMATE')
  })

  it('castles and moves the rook', () => {
    let pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    const m = findLegalMove(pos, { from: 'e1', to: 'g1' })!
    expect(toSan(pos, m)).toBe('O-O')
    pos = makeMove(pos, m)
    expect(pos.board[5]).toBe('R')
    expect(pos.board[7]).toBeNull()
    expect(pos.castling).toBe('kq')
  })

  it('refuses to castle through check', () => {
    const pos = parseFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1')
    expect(findLegalMove(pos, { from: 'e1', to: 'g1' })).toBeNull()
  })

  it('captures en passant', () => {
    let pos = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1')
    const m = findLegalMove(pos, { from: 'e5', to: 'd6' })!
    expect(m.enPassant).toBe(true)
    expect(toSan(pos, m)).toBe('exd6')
    pos = makeMove(pos, m)
    expect(pos.board[35]).toBeNull()
  })

  it('promotes, defaulting to a queen', () => {
    const pos = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    expect(findLegalMove(pos, { from: 'a7', to: 'a8' })!.promotion).toBe('q')
    const knight = findLegalMove(pos, { from: 'a7', to: 'a8', promotion: 'n' })!
    expect(toSan(pos, knight)).toBe('a8=N')
  })
})

describe('game results', () => {
  it('detects stalemate', () => {
    expect(gameResult(parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBe('STALEMATE')
  })
  it('detects insufficient material', () => {
    expect(gameResult(parseFen('8/8/4k3/8/8/3NK3/8/8 w - - 0 1'))).toBe('DRAW_MATERIAL')
    expect(gameResult(parseFen('8/8/4k3/8/8/3RK3/8/8 w - - 0 1'))).toBe('PLAYING')
  })
  it('detects the fifty-move rule', () => {
    expect(gameResult(parseFen('8/8/4k3/8/8/3RK3/8/8 w - - 100 80'))).toBe('DRAW_FIFTY_MOVE')
  })
  it('detects threefold repetition', () => {
    const match = createChessMatch('m', 'PRACTICE', 'BO1')
    const game = match.currentGame!
    const shuffle = [
      ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'],
      ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']
    ] as const
    shuffle.forEach(([from, to], i) => {
      const out = applyChessMove(game, turnSeat(game), { from, to })
      expect(out.ok).toBe(true)
      if (i < shuffle.length - 1) expect(out.ended).toBe(false)
    })
    expect(game.result).toBe('DRAW_REPETITION')
    expect(game.winnerSeat).toBeNull()
    expect(positionKey(game.position)).toBe(game.history[0])
  })
})

describe('match flow', () => {
  it('refuses moves out of turn and illegal moves', () => {
    const match = createChessMatch('m', 'ONE_V_ONE', 'BO3')
    const game = match.currentGame!
    expect(applyChessMove(game, 1, { from: 'e7', to: 'e5' }).error).toBe('not your turn')
    expect(applyChessMove(game, 0, { from: 'e2', to: 'e5' }).error).toBe('illegal move')
    expect(applyChessMove(game, 0, { from: 'e2', to: 'e4' }).ok).toBe(true)
  })

  it('charges the clock and adds the increment', () => {
    const match = createChessMatch('m', 'ONE_V_ONE', 'BO1')
    const game = match.currentGame!
    const before = game.clocksMs[0]
    applyChessMove(game, 0, { from: 'e2', to: 'e4' }, 10_000, 2_000)
    expect(game.clocksMs[0]).toBe(before - 8_000)
  })

  it('counts games, alternates colours, and replays draws', () => {
    const match = createChessMatch('m', 'ONE_V_ONE', 'BO3')
    expect(match.currentGame!.whiteSeat).toBe(0)
    expect(applyGameWinner(match, 0)).toBe(false)
    expect(nextGame(match).whiteSeat).toBe(1)
    expect(applyGameWinner(match, null)).toBe(false)
    expect(match.framesWon).toEqual([1, 0])
    expect(nextGame(match).whiteSeat).toBe(0)
    expect(applyGameWinner(match, 0)).toBe(true)
    expect(matchWinnerIndex(match)).toBe(0)
  })

  it('a flag fall loses the game', () => {
    const match = createChessMatch('m', 'ONE_V_ONE', 'BO1')
    applyTimeout(match.currentGame!, 0)
    const snap = chessSnapshot(match.currentGame!)
    expect(snap.result).toBe('TIMEOUT')
    expect(snap.winnerSeat).toBe(1)
  })
})

describe('robot', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  it('always plays a legal move', () => {
    let pos = initialPosition()
    const rand = seeded(7)
    for (let i = 0; i < 12; i++) {
      const move = chooseAiMove(pos, 'MEDIUM', rand)!
      const legal = findLegalMove(pos, move)
      expect(legal).not.toBeNull()
      pos = makeMove(pos, legal!)
    }
  })
  it('finds a mate in one on HARD', () => {
    const pos = parseFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
    expect(chooseAiMove(pos, 'HARD', seeded(1))).toEqual({ from: 'a1', to: 'a8' })
  })
  it('takes a free queen', () => {
    const pos = parseFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1')
    expect(chooseAiMove(pos, 'MEDIUM', () => 0.5)).toEqual({ from: 'e4', to: 'd5' })
  })
})

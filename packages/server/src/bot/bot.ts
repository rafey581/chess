/**
 * The practice robot. Thin wrapper over the shared chess AI so the room does not need
 * to know how moves are chosen, and so the robot's randomness can be seeded per match.
 */
import { chooseAiMove, seededRandom } from '@snooker/shared'
import type { ChessGameState, ChessMoveInput, PracticeAiLevel } from '@snooker/shared'

export function computeBotMove(game: ChessGameState, level: PracticeAiLevel, seed: string): ChessMoveInput | null {
  const rand = seededRandom(`${seed}:${game.moves.length}`)
  return chooseAiMove(game.position, level, rand, game.history)
}

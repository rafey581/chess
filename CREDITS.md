# Credits

## Background music

Chess Stake does not ship recorded music. The Piano, Guitar, Violin, Flute, and Mix
tracks are short looping melodies generated in the browser with the Web Audio API
(oscillators, a low-pass filter, and a light vibrato on violin and flute).

The phrase is original to this project. No samples, stems, or third-party recordings
are bundled, so no external music license applies and the Android package does not
grow by the size of audio files.

Source: `packages/client/src/game/music.ts`

## Chess pieces and board

Pieces are drawn with the standard Unicode chess symbols (U+265A–U+265F) in the
system font; the board is plain CSS. Move and capture sounds are synthesised in the
browser (`packages/client/src/chess/sound.ts`). The lobby artwork in
`packages/client/public` was generated for this project. No third-party assets are
bundled for the game.

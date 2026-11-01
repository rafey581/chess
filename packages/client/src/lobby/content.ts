/**
 * Lobby copy and static help text — presentation only.
 * Controls match the in-game help overlay + input/placement behaviour.
 * Rules match the shared chess engine (packages/shared/src/chess).
 */

export const BG_IMAGE = '/lobby-pic-blurred.jpg'

export const HOME_COPY = {
  eyebrow: 'board ready',
  headline: 'PICK YOUR MATCH',
  heroTag: 'ONLINE CHESS / 5+3 BLITZ',
  heroTitle: 'PLAY CHESS',
  heroSubtitle: 'Real opponents, real clocks, server-checked moves.',
  heroCta: 'choose your opponent',
  statsEmpty: 'no completed matches yet',
  footerMode: 'Lobby · free practice & online tables'
} as const

export const SETUP_COPY = {
  back: 'back to lobby',
  eyebrow: 'match options',
  headline: 'SET THE BOARD',
  step: '01 / MODE',
  titleAi: 'Who are you\nplaying?',
  vsAiTitle: 'VS AI',
  vsAiDesc: 'play against the computer',
  onlineTitle: 'ONLINE',
  onlineDesc: 'play against a real opponent',
  difficultyLabel: 'AI DIFFICULTY',
  lengthLabel: 'GAME TYPE',
  stakeLabel: 'STAKE',
  tableLabel: 'TABLE',
  tableOpen: 'OPEN TABLE',
  tableOpenHint: '1 – 100 USDT',
  tableMaster: 'MASTER MATCH',
  tableMasterHint: '500 – 5000 USDT',
  opponentLabel: 'OPPONENT',
  opponentAnyone: 'ANYONE',
  opponentAnyoneHint: 'broadcast to online players',
  opponentFriend: 'A FRIEND',
  opponentFriendHint: 'invite one friend',
  friendPickLabel: 'WHICH FRIEND',
  friendEmpty: 'no friends yet — add one from the FRIENDS screen first',
  // The time control leads the list (setup.ts).
  facts: ['FIDE rules', 'colours by lot, then alternate', '\u00bd point for a draw'] as const,
  panelBrand: 'CHESS STAKE',
  panelBadge: 'LIVE BOARD',
  panelTitle: 'Ready when you are',
  panelBody: 'Confirm the mode and start when you are ready to play.',
  start: 'START MATCH',
  formats: {
    BO1: { label: 'SINGLE GAME', hint: 'one game decides it' },
    BO3: { label: 'BEST OF 3', hint: 'first to 2 points (\u00bd per draw)' },
    BO5: { label: 'BEST OF 5', hint: '5 games, 3 points wins' }
  } as const
}

export const STATS_COPY = {
  pageName: 'Statistics',
  eyebrow: 'completed matches',
  title: 'YOUR RECORD',
  emptyRecent: 'no completed matches yet, your record begins at the board',
  returnLobby: 'RETURN TO LOBBY',
  yourPanel: 'Your record',
  recentPanel: 'Recent matches',
  oppPanel: 'Opponent record'
} as const

export const INFO_COPY = {
  back: 'back to lobby',
  eyebrow: 'learn the table',
  headline: 'HOW TO PLAY',
  panelTitle: 'Stay sharp at the baulk end',
  panelBody: 'Controls and rules in one place — written for the way this table actually plays.',
  chips: ['Aim & power', 'Spin & camera', 'Fouls 4–7'] as const
} as const

export const SETTINGS_COPY = {
  eyebrow: 'preferences',
  headline: 'SETTINGS',
  accountLabel: 'Account',
  accountHint: (username: string) => `Signed in as ${username}.`,
  signOut: 'Log out',
  signOutConfirm: 'Log out of this device?',
  soundLabel: 'Table sounds',
  soundHint: 'Move sounds, clicks and music share one mute.',
  qualityLabel: 'Graphics quality',
  qualityHint: 'Auto picks for this device and adjusts while you play. A fixed level stays exactly as chosen.',
  qualityApplied: 'Applies from your next match.',
  qualityOptions: [
    { value: 'auto', label: 'Auto', hint: 'Recommended' },
    { value: 'low', label: 'Low', hint: 'Fastest' },
    { value: 'medium', label: 'Medium', hint: 'Balanced' },
    { value: 'high', label: 'High', hint: 'Sharpest' }
  ],
  musicLabel: 'Music',
  musicHint: 'Slow background music. It lowers during a shot and pauses when you leave the app.',
  musicVolume: 'Volume',
  musicTracks: [
    { value: 'piano', label: 'Piano' },
    { value: 'guitar', label: 'Guitar' },
    { value: 'violin', label: 'Violin' },
    { value: 'flute', label: 'Flute' },
    { value: 'mix', label: 'Mix', hint: 'Rotates' }
  ]
} as const

export interface NumberedSection {
  title: string
  body: string
}

export const CONTROLS_SECTIONS: readonly NumberedSection[] = [
  {
    title: 'Moving a piece',
    body: 'Tap or click one of your pieces to see where it can go, then tap a highlighted square. You can also drag the piece onto its square.'
  },
  {
    title: 'Legal moves only',
    body: 'Dots mark empty squares the piece can reach and rings mark captures. A move the rules do not allow is simply not offered.'
  },
  {
    title: 'Promotion',
    body: 'When a pawn reaches the last rank, choose a queen, rook, bishop or knight from the picker.'
  },
  {
    title: 'Clocks',
    body: 'Each player has 5 minutes per game, plus 3 seconds added after every move. Your clock only runs on your turn, and keeps running if you disconnect.'
  },
  {
    title: 'Board orientation',
    body: 'Your pieces are always at the bottom. When you play black the board is turned round for you.'
  },
  {
    title: 'Resign, draws, chat and leave',
    body: 'The flag resigns the game (in a longer match you can also forfeit the whole match). The \u00bd button offers a draw; a claim button appears when you may claim one. The speech bubble is quick chat and the door returns to the lobby.'
  }
]

export const RULES_SECTIONS: readonly NumberedSection[] = [
  {
    title: 'FIDE Laws of Chess',
    body: 'Every game follows the FIDE Laws of Chess. Moves the Laws do not allow cannot be played. White moves first; colours for the first game are decided by lot and then alternate.'
  },
  {
    title: 'Winning a game',
    body: 'Checkmate the opposing king, or win when your opponent resigns or runs out of time. If your opponent\'s flag falls but you could not possibly checkmate with any series of legal moves, the game is a draw.'
  },
  {
    title: 'Special moves',
    body: 'Castling (not out of, through or into check), en passant and promotion to a queen, rook, bishop or knight.'
  },
  {
    title: 'Draws',
    body: 'Automatic: stalemate, dead positions, fivefold repetition and 75 moves each without a capture or pawn move. On claim by the player to move: threefold repetition and the fifty-move rule. By agreement: either player may offer a draw; making a move declines it.'
  },
  {
    title: 'Match scoring',
    body: 'A win scores 1 point, a draw \u00bd, a loss 0. A single game, best of 3 or best of 5: the match ends as soon as one player has more than half the points. A level match is decided by one Armageddon game: white has 5 minutes, black 4 and draw odds, so a draw counts as a win for black.'
  },
  {
    title: 'Clock and disconnects',
    body: 'The clock keeps running if you disconnect. If you are away longer than the reconnect grace period, the match is awarded to your opponent.'
  }
]

/**
 * Friends screen copy: search by the player's unique username and manage
 * incoming requests.
 */
export const FRIENDS_COPY = {
  eyebrow: 'social',
  headline: 'FRIENDS',
  back: 'back to lobby',
  searchHint:
    'Type part of a player’s unique username and search. Only players with an ' +
    'active account appear, and you cannot add yourself.',
  searchLabel: 'FIND A PLAYER',
  searchPlaceholder: 'their unique username',
  search: 'search',
  searching: 'searching…',
  noResults: 'no players found with that username',
  addFriend: 'add friend',
  requestSent: 'request sent',
  alreadyFriends: 'already friends',
  theyAskedYou: 'they asked you first — accept it below',
  incomingTitle: 'INCOMING',
  outgoingTitle: 'SENT',
  requestsTitle: 'FRIEND REQUESTS',
  incomingEmpty: 'no incoming requests',
  outgoingEmpty: 'no requests you sent',
  waiting: 'waiting for them to accept',
  friendsTitle: 'YOUR FRIENDS',
  friendsEmpty: 'no friends yet — search for a username above to add someone',
  friendsSince: (iso: string) => `friends since ${new Date(iso).toISOString().slice(0, 10)}`,
  challenge: 'challenge',
  challengeHint: 'invite this friend to a staked table',
  accept: 'accept',
  decline: 'decline',
  added: 'Friend request sent.',
  accepted: 'You are now friends.',
  declined: 'Request declined.'
} as const

/**
 * Invite screen copy. Every account has one shareable code; the inviter earns
 * `bonusUsdt` once the invited player finishes a first match.
 */
export const INVITE_COPY = {
  eyebrow: 'earn',
  headline: 'INVITE & EARN',
  back: 'back to lobby',
  intro:
    'Share your invite code or link. Every player you bring in gets the normal ' +
    'welcome balance — and you earn USDT the moment they finish their first match.',
  codeLabel: 'YOUR INVITE CODE',
  linkLabel: 'INVITE LINK',
  copyCode: 'copy code',
  copyLink: 'copy link',
  share: 'share',
  copied: 'copied to clipboard',
  copyFailed: 'could not copy — select it and copy manually',
  shareText: (bonus: number) => `Join me on Chess Stake. Sign up and play — I earn ${bonus} USDT when you finish your first match.`,
  statInvited: 'INVITED',
  statPlayed: 'PLAYED',
  statEarned: 'EARNED',
  earnedSuffix: 'USDT',
  peopleTitle: 'PLAYERS YOU INVITED',
  empty: 'no one yet — share your code to get started',
  statusPlayed: 'first match played — bonus paid',
  statusWaiting: 'signed up — bonus pending their first match',
  disabled: 'The invite programme is currently paused.',
  joinedOn: (iso: string) => `joined ${new Date(iso).toISOString().slice(0, 10)}`
} as const

/**
 * Deposit screen copy. `amountHint` becomes a sentence, so it is a function of
 * the live min/max rather than a string constant.
 */
export const DEPOSIT_COPY = {
  eyebrow: 'wallet',
  headline: 'FUND YOUR BALANCE',
  back: 'back to lobby',
  intro:
    'Send USDT or USDC on the Solana network to the address below, then submit the transaction id ' +
    'and a screenshot of the payment. An admin verifies the transaction and credits your balance ' +
    '1:1 (1 USDC = 1 USDT).',
  networkWarning:
    'Solana network only. USDT or USDC only. Coins sent on any other network (Ethereum, BNB, Tron…) ' +
    'or any other token cannot be recovered.',
  coinLabel: 'COIN YOU SENT',
  addressLabel: 'PLATFORM ADDRESS — SOLANA NETWORK (USDT / USDC)',
  copyAddress: 'copy',
  copied: 'address copied',
  amountLabel: 'AMOUNT SENT',
  txLabel: 'TRANSACTION ID',
  txPlaceholder: 'the solana signature of your transfer',
  proofLabel: 'PROOF SCREENSHOT',
  proofHint: 'upload a screenshot of the sent transaction — an admin checks it against the transaction id',
  chooseFile: 'choose image',
  changeFile: 'change image',
  submit: 'send deposit request',
  submitting: 'submitting…',
  notConfigured: 'Deposits are not configured yet. Please check back later.',
  disabled: 'Deposits are currently disabled.',
  historyTitle: 'YOUR DEPOSITS',
  empty: 'no deposits yet',
  statusPending: 'PENDING',
  statusApproved: 'APPROVED',
  statusRejected: 'REJECTED',
  credited: (n: number) => `${n} USDT credited`,
  rejectedPrefix: 'reason: ',
  submitted: 'Deposit request sent. An admin will verify it shortly.',
  amountHint: (min: number, max: number) => `min ${min} · max ${max} (USDT or USDC)`
} as const

/**
 * Withdraw screen copy. Like deposits, the hints are functions of the live
 * limits so they never drift from the server config.
 */
export const WITHDRAW_COPY = {
  eyebrow: 'wallet',
  headline: 'WITHDRAW TO USDT',
  back: 'back to lobby',
  intro:
    'Request a cash-out. Enter the USDT amount you want and your own Solana address. ' +
    'The amount is set aside from your balance right away, so it cannot be staked while ' +
    'an admin verifies your account (including your recent matches) and sends the USDT. ' +
    'If the request is rejected, or you cancel it, the amount comes straight back.',
  addressLabel: 'YOUR USDT ADDRESS — SOLANA NETWORK',
  addressPlaceholder: 'the solana address that should receive the funds',
  balanceLabel: 'AVAILABLE TO WITHDRAW',
  amountLabel: 'AMOUNT (USDT)',
  submit: 'send withdraw request',
  submitting: 'submitting…',
  disabled: 'Withdrawals are currently disabled.',
  insufficient: 'You do not have enough balance for this amount.',
  historyTitle: 'YOUR REQUESTS',
  empty: 'no withdrawal requests yet',
  statusPending: 'PENDING',
  statusApproved: 'APPROVED',
  statusRejected: 'REJECTED',
  deducted: (n: number) => `${n} USDT paid out`,
  held: (n: number) => `${n} USDT set aside while this is reviewed`,
  cancel: 'cancel request',
  cancelling: 'cancelling…',
  cancelConfirm: 'Cancel this withdrawal request? The amount goes back to your balance.',
  cancelled: 'Request cancelled. The amount is back in your balance.',
  cancelledNote: 'cancelled by you, amount returned',
  rejectedReturned: 'the amount was returned to your balance',
  rejectedPrefix: 'reason: ',
  submitted: 'Withdraw request sent. An admin will verify it and pay out shortly.',
  amountHint: (min: number, max: number) => `min ${min} · max ${max} USDT`
} as const

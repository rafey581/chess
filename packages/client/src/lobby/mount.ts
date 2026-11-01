import './lobby.css'
import { HOME_COPY } from './content.js'
import { clear } from './dom.js'
import { renderHome } from './home.js'
import { renderInfo } from './info.js'
import { renderSettings } from './settingsView.js'
import { renderDeposit, type DepositViewData } from './deposit.js'
import { renderWithdraw, type WithdrawViewData } from './withdraw.js'
import { renderFriends } from './friends.js'
import { renderInvite } from './invite.js'
import { api } from '../game/network.js'
import { emitSfx } from '../sfx/sfxEvents.js'
import { requestLandscape } from '../game/hudMenu.js'
import { createShell, syncTabIndicator, tabToView, viewToTab } from './shell.js'
import { createCasinoShell, renderCasinoHome, wantsCasinoLobby, type CasinoDestination } from './casino.js'
import { defaultSetupState, renderSetup, tiersForTable } from './setup.js'
import { renderStatistics } from './stats.js'
import { fillLevelChip } from './progress.js'
import type {
  InfoSection,
  LobbyBridge,
  LobbyHistoryMatch,
  LobbyProfileStats,
  LobbyProgress,
  LobbyTab,
  LobbyView,
  PlayMode,
  SetupState,
  StatsMode
} from './types.js'

export interface LobbySession {
  destroy: () => void
  /** Re-reads level, rank and badges (after a level-up or a new badge arrives). */
  refreshProgress: () => Promise<void>
}

interface SessionState {
  view: LobbyView
  setup: SetupState
  infoSection: InfoSection
  statsMode: StatsMode
  profile: LobbyProfileStats | null
  history: LobbyHistoryMatch[]
  progress: LobbyProgress | null
  statsStatus: string
  starting: boolean
  deposit: DepositViewData | null
  withdraw: WithdrawViewData | null
  /** Friend usernames for the online opponent picker. */
  friends: string[]
  friendsLoaded: boolean
}

/**
 * Mounts the gaming lobby into `host`. All navigation between lobby screens stays here;
 * match start and audio call through `bridge` into existing main.ts handlers.
 */
export function mountGamingLobby(host: HTMLElement, bridge: LobbyBridge): LobbySession {
  const state: SessionState = {
    view: 'home',
    setup: defaultSetupState(bridge, null),
    infoSection: 'controls',
    statsMode: 'online',
    profile: null,
    history: [],
    progress: null,
    statsStatus: HOME_COPY.statsEmpty,
    starting: false,
    deposit: null,
    withdraw: null,
    friends: [],
    friendsLoaded: false
  }

  let root: HTMLElement | null = null
  let escHandler: ((e: KeyboardEvent) => void) | null = null
  let fullscreenHandler: (() => void) | null = null
  let resizeHandler: (() => void) | null = null

  /** The shell is rebuilt on every paint, so the tab indicator is placed after insert. */
  const scheduleIndicator = (): void => {
    const node = root
    if (!node) return
    requestAnimationFrame(() => {
      if (node.isConnected) syncTabIndicator(node)
    })
  }

  // A soft click for the lobby's buttons, tabs, tiles and chips. One listener on the host,
  // so nothing in the lobby is rebuilt or rewired for it; it says a sound may play and
  // has no part in what the click does. Silent unless the new sounds are on.
  const onLobbyClick = (event: Event): void => {
    const target = event.target as Element | null
    if (target?.closest?.('button, [role="button"], [role="tab"], [role="radio"], a')) emitSfx({ type: 'aux', sound: 'uiClick' })
  }
  host.addEventListener('click', onLobbyClick)

  /** Which lobby is up: the desktop hall, or the compact one for phones and narrow windows. */
  let casino = wantsCasinoLobby()

  /** Where the desktop lobby's sidebar and top bar send the player. */
  const goCasino = (where: CasinoDestination): void => {
    switch (where) {
      case 'home':
        state.view = 'home'
        paint()
        return
      case 'play':
        openSetup(null)
        return
      case 'tournaments':
        bridge.openTournaments()
        return
      case 'games':
        state.view = 'statistics'
        void loadStats().then(paint)
        paint()
        return
      case 'wallet':
        state.view = 'deposit'
        state.deposit = null
        void loadDepositView().then(paint)
        paint()
        return
      case 'leaderboard':
        bridge.toast('The leaderboard is coming soon.', 'info')
        return
      case 'friends':
        state.view = 'friends'
        paint()
        return
      case 'invite':
        state.view = 'invite'
        paint()
        return
      case 'rules':
        state.infoSection = 'rules'
        state.view = 'info'
        paint()
        return
      case 'settings':
        state.view = 'settings'
        paint()
        return
      case 'support':
        bridge.openSupport()
        return
    }
  }

  const paint = (): void => {
    clear(host)
    casino = wantsCasinoLobby()
    if (casino) {
      const shell = createCasinoShell(bridge, state.view, {
        go: goCasino,
        onSoundToggle: () => {
          bridge.setSoundMuted(!bridge.getSoundMuted())
          paint()
        },
        onFullscreen: toggleFullscreen,
        onProfile: () => {
          bridge.onProfileActivate()
          state.view = 'settings'
          paint()
        }
      }, state.progress)
      root = shell.root
      host.appendChild(root)
      shell.main.appendChild(buildScreen())
      return
    }
    const shell = createShell(bridge, state.view, {
      onTab: (tab) => goTab(tab),
      onSoundToggle: () => {
        bridge.setSoundMuted(!bridge.getSoundMuted())
        paint()
      },
      onFullscreen: toggleFullscreen,
      onSettingsIcon: () => {
        state.view = 'settings'
        paint()
      },
      onProfile: () => {
        // There is no separate profile screen in this lobby: the profile chip opens the
        // player's own settings, which is where their preferences live.
        bridge.onProfileActivate()
        state.view = 'settings'
        paint()
      }
    })
    root = shell.root
    host.appendChild(root)
    shell.main.appendChild(buildScreen())
    scheduleIndicator()
  }

  /**
   * The wallet's two screens share one switch, so a deposit and a withdrawal are each one
   * tap from the other in either lobby. The screens themselves, and what they send, are
   * exactly the existing deposit and withdraw views.
   */
  const withWalletTabs = (active: 'deposit' | 'withdraw', screen: HTMLElement): HTMLElement => {
    const tabs = document.createElement('div')
    tabs.className = 'gl-wallet-tabs'
    tabs.setAttribute('role', 'tablist')
    const tab = (view: 'deposit' | 'withdraw', label: string): HTMLButtonElement => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'gl-wallet-tab'
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-selected', String(view === active))
      button.textContent = label
      button.onclick = () => {
        if (state.view === view) return
        state.view = view
        if (view === 'deposit') {
          state.deposit = null
          void loadDepositView().then(paint)
        } else {
          state.withdraw = null
          void loadWithdrawView().then(paint)
        }
        paint()
      }
      return button
    }
    tabs.append(tab('deposit', 'Deposit'), tab('withdraw', 'Withdraw'))
    const head = screen.firstElementChild
    if (head) head.after(tabs)
    else screen.prepend(tabs)
    return screen
  }

  const buildScreen = (): HTMLElement => {
    if (state.view === 'home' && casino) {
      return renderCasinoHome(bridge, {
        playNow: () => openSetup(null),
        quickPlay: () => openSetup('online'),
        practice: () => openSetup('ai'),
        // A private room is a table for a friend, which is what the friends screen opens.
        createRoom: () => {
          state.view = 'friends'
          paint()
        },
        tournaments: () => {
          bridge.openTournaments()
        },
        masterMatch: () => openSetup('online', undefined, 'master'),
        openGames: () => goCasino('games'),
        history: state.history,
        userId: bridge.userId
      })
    }
    if (state.view === 'home') {
      return renderHome(bridge, {
        openSetup: (mode) => openSetup(mode),
        openStats: () => {
          state.view = 'statistics'
          void loadStats().then(paint)
          paint()
        },
        openInfo: (section) => {
          state.infoSection = section
          state.view = 'info'
          paint()
        },
        openTournaments: () => {
          bridge.openTournaments()
        },
        openDeposit: () => {
          state.view = 'deposit'
          state.deposit = null
          void loadDepositView().then(paint)
          paint()
        },
        openFriends: () => {
          state.view = 'friends'
          paint()
        },
        openInvite: () => {
          state.view = 'invite'
          paint()
        },
        openWithdraw: () => {
          state.view = 'withdraw'
          state.withdraw = null
          void loadWithdrawView().then(paint)
          paint()
        },
        statsStatusLine: state.statsStatus
      })
    }
    if (state.view === 'setup') {
      return renderSetup(bridge, state.setup, {
        onBack: () => {
          state.view = 'home'
          paint()
        },
        onChange: (next) => {
          state.setup = next
          if (next.mode === 'online' && !state.friendsLoaded) void loadFriends().then(paint)
          paint()
        },
        onStart: () => void startMatch(),
        starting: state.starting
      }, state.friends)
    }
    if (state.view === 'statistics') {
      return renderStatistics(bridge, state.statsMode, state.profile, state.history, {
        onBack: () => {
          state.view = 'home'
          paint()
        },
        onMode: (mode) => {
          state.statsMode = mode
          paint()
        }
      }, state.progress)
    }
    if (state.view === 'info') {
      return renderInfo(state.infoSection, {
        onBack: () => {
          state.view = 'home'
          paint()
        },
        onSection: (section) => {
          state.infoSection = section
          paint()
        }
      })
    }
    if (state.view === 'deposit') {
      return withWalletTabs('deposit', renderDeposit(state.deposit, {
        onBack: () => {
          state.view = 'home'
          paint()
        },
        onSubmitted: () => {
          void bridge.refreshWallet()
          void loadDepositView().then(paint)
        },
        toast: (message, kind) => bridge.toast(message, kind)
      }))
    }
    if (state.view === 'withdraw') {
      return withWalletTabs('withdraw', renderWithdraw(state.withdraw, {
        walletBalance: bridge.walletBalance,
        onBack: () => {
          state.view = 'home'
          paint()
        },
        onSubmitted: () => {
          // Both before the repaint: the balance shown must already include the hold.
          void Promise.all([bridge.refreshWallet(), loadWithdrawView()]).then(paint)
        },
        toast: (message, kind) => bridge.toast(message, kind)
      }))
    }
    if (state.view === 'friends') {
      return renderFriends({
        onBack: () => {
          state.view = 'home'
          paint()
        },
        toast: (message, kind) => bridge.toast(message, kind),
        onChallenge: (username) => openSetup('online', username)
      })
    }
    if (state.view === 'invite') {
      return renderInvite({
        onBack: () => {
          state.view = 'home'
          paint()
        },
        toast: (message, kind) => bridge.toast(message, kind)
      })
    }
    return renderSettings(bridge, {
      onToggleSound: () => {
        bridge.setSoundMuted(!bridge.getSoundMuted())
        paint()
      },
      onQualityChange: () => paint(),
      onSignOut: () => bridge.signOut()
    })
  }

  const goTab = (tab: LobbyTab): void => {
    if (tab === 'statistics') {
      state.view = 'statistics'
      void loadStats().then(paint)
    } else {
      state.view = tabToView(tab)
    }
    paint()
  }

  const openSetup = (mode: PlayMode | null, friendUsername?: string, table: 'open' | 'master' = 'open'): void => {
    state.setup = defaultSetupState(bridge, mode)
    if (table === 'master') {
      state.setup.table = 'master'
      state.setup.mode = mode ?? 'online'
      const masterTiers = tiersForTable(bridge.getStakeTiers(), 'master')
      state.setup.stakeTierId = masterTiers[0]?.id ?? state.setup.stakeTierId
    }
    if (mode === 'ai') state.setup.difficulty = bridge.practiceDifficulty
    if (mode === 'online') {
      void loadFriends().then(paint)
      if (friendUsername) {
        state.setup.opponent = 'friend'
        state.setup.friendUsername = friendUsername
      }
    }
    state.view = 'setup'
    paint()
  }

  const loadFriends = async (): Promise<void> => {
    try {
      const data = await api<{ friends: Array<{ username: string }> }>('/friends')
      state.friends = data.friends.map((friend) => friend.username)
    } catch {
      state.friends = []
    }
    state.friendsLoaded = true
  }

  const startMatch = async (): Promise<void> => {
    const { mode, difficulty, format, opponent, friendUsername } = state.setup
    let { stakeTierId } = state.setup
    if (!mode || state.starting) return
    if (mode === 'online') {
      const allowed = tiersForTable(bridge.getStakeTiers(), state.setup.table ?? 'open')
      if (!allowed.some((tier) => tier.id === stakeTierId)) stakeTierId = allowed[0]?.id ?? null
      state.setup.stakeTierId = stakeTierId
    }
    // Still inside the tap, before anything is awaited: the only moment a phone may be
    // turned sideways for the table.
    requestLandscape()
    state.starting = true
    paint()
    try {
      if (mode === 'ai') {
        bridge.setPracticeDifficulty(difficulty)
        await bridge.startPractice(difficulty, format)
      } else {
        const tier = stakeTierId ?? bridge.getDefaultStakeTierId()
        if (!tier) {
          bridge.toast('Stake tiers unavailable. Try again shortly.', 'error')
          return
        }
        if (opponent === 'friend' && !friendUsername) {
          bridge.toast('Choose a friend to invite.', 'error')
          return
        }
        await bridge.startOnlineChallenge({
          stakeTier: tier,
          format,
          targetUsername: opponent === 'friend' && friendUsername ? friendUsername : undefined
        })
      }
    } catch (error) {
      bridge.toast((error as Error).message, 'error')
    } finally {
      state.starting = false
      // If we are still in the lobby (start failed), repaint; success leaves via enterMatch.
      if (host.contains(root)) paint()
    }
  }

  const loadStats = async (): Promise<void> => {
    try {
      const [profile, history, progress] = await Promise.all([
        bridge.fetchProfileStats(),
        bridge.fetchMatchHistory(),
        bridge.fetchProgress()
      ])
      state.profile = profile
      state.history = history
      state.progress = progress
      state.statsStatus =
        profile && profile.matches > 0 ? `${profile.wins}W · ${profile.losses}L` : HOME_COPY.statsEmpty
    } catch {
      state.profile = null
      state.history = []
      state.statsStatus = HOME_COPY.statsEmpty
    }
  }

  const loadDepositView = async (): Promise<void> => {
    try {
      const [info, history] = await Promise.all([
        api<DepositViewData['info']>('/deposit/info'),
        api<{ items: DepositViewData['history'] }>('/deposits')
      ])
      state.deposit = { info, history: history.items }
    } catch {
      state.deposit = null
    }
  }

  const loadWithdrawView = async (): Promise<void> => {
    try {
      const [info, history] = await Promise.all([
        api<WithdrawViewData['info']>('/withdraw/info'),
        api<{ items: WithdrawViewData['history'] }>('/withdrawals')
      ])
      state.withdraw = { info, history: history.items }
    } catch {
      state.withdraw = null
    }
  }

  escHandler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    if (state.view === 'home') return
    if (
      state.view === 'setup' ||
      state.view === 'info' ||
      state.view === 'settings' ||
      state.view === 'statistics' ||
      state.view === 'deposit' ||
      state.view === 'withdraw' ||
      state.view === 'friends' ||
      state.view === 'invite'
    ) {
      e.preventDefault()
      state.view = 'home'
      paint()
    }
  }
  document.addEventListener('keydown', escHandler)

  // The fullscreen button swaps to its exit glyph, so repaint on the state change.
  fullscreenHandler = (): void => {
    if (host.contains(root)) paint()
  }
  document.addEventListener('fullscreenchange', fullscreenHandler)

  // The indicator is measured, not derived: re-measure when the bar changes size.
  resizeHandler = (): void => {
    // Crossing between the desktop lobby and the compact one rebuilds the page.
    if (wantsCasinoLobby() !== casino) {
      if (host.contains(root)) paint()
      return
    }
    if (root) syncTabIndicator(root)
  }
  window.addEventListener('resize', resizeHandler)

  void bridge.refreshWallet()
  void loadStats().then(() => {
    if (host.contains(root)) paint()
  })
  paint()

  const refreshProgress = async (): Promise<void> => {
    state.progress = await bridge.fetchProgress()
    if (!root || !host.contains(root)) return
    // Repainting would throw away a half-filled form, so only My Games (which draws the
    // whole panel) is repainted; elsewhere the chip in the top bar is patched in place.
    if (state.view === 'statistics') {
      paint()
      return
    }
    for (const node of root.querySelectorAll<HTMLElement>('.cx-profile__level')) fillLevelChip(node, state.progress)
  }

  return {
    refreshProgress,
    destroy: () => {
      if (escHandler) document.removeEventListener('keydown', escHandler)
      if (fullscreenHandler) document.removeEventListener('fullscreenchange', fullscreenHandler)
      if (resizeHandler) window.removeEventListener('resize', resizeHandler)
      clear(host)
      root = null
    }
  }
}

function toggleFullscreen(): void {
  const doc = document
  if (doc.fullscreenElement) {
    void doc.exitFullscreen?.()
  } else {
    void doc.documentElement.requestFullscreen?.()
  }
}

export { viewToTab }

import { CONTROLS_SECTIONS, INFO_COPY, RULES_SECTIONS } from './content.js'
import { accentHeadline, el } from './dom.js'
import { ICONS } from './icons.js'
import type { InfoSection } from './types.js'

export interface InfoActions {
  onBack: () => void
  onSection: (section: InfoSection) => void
}

export function renderInfo(section: InfoSection, actions: InfoActions): HTMLElement {
  const screen = el('div', 'gl-screen')
  screen.dataset.view = 'info'

  const top = el('div', 'gl-info-top')
  const back = el('button', 'gl-link-back') as HTMLButtonElement
  back.type = 'button'
  const backIcon = el('span')
  backIcon.innerHTML = ICONS.back
  back.append(backIcon, document.createTextNode(INFO_COPY.back))
  back.onclick = () => actions.onBack()
  const right = el('div', 'gl-setup-top__right')
  right.append(el('div', 'gl-label', INFO_COPY.eyebrow), accentHeadline(INFO_COPY.headline, 2))
  top.append(back, right)
  screen.appendChild(top)

  const grid = el('div', 'gl-info')
  const left = el('div', 'gl-panel gl-info__left')
  left.appendChild(el('div', 'gl-label', '02 / GUIDE'))

  const sw = el('div', 'gl-switch')
  for (const [id, label] of [
    ['controls', 'CONTROLS'],
    ['rules', 'CHESS RULES']
  ] as const) {
    const btn = el('button', 'gl-chip', label) as HTMLButtonElement
    btn.type = 'button'
    btn.setAttribute('aria-pressed', String(section === id))
    btn.onclick = () => actions.onSection(id)
    sw.appendChild(btn)
  }
  left.appendChild(sw)

  const sections = section === 'controls' ? CONTROLS_SECTIONS : RULES_SECTIONS
  const list = el('div', 'gl-sections gl-scroll')
  sections.forEach((item, index) => {
    const row = el('div', 'gl-section')
    row.appendChild(el('div', 'gl-section__num', String(index + 1).padStart(2, '0')))
    const copy = el('div')
    copy.append(el('h3', 'gl-section__title', item.title), el('p', 'gl-section__body', item.body))
    row.appendChild(copy)
    list.appendChild(row)
  })
  left.appendChild(list)

  const rightPanel = el('div', 'gl-panel gl-info__right')
  const img = document.createElement('img')
  img.className = 'gl-info__right-img'
  img.src = '/lobby-pic-blurred.jpg'
  img.alt = ''
  img.decoding = 'async'
  const body = el('div', 'gl-info__right-body')
  body.append(
    el('h3', 'gl-headline gl-info__right-title', INFO_COPY.panelTitle),
    el('p', undefined, INFO_COPY.panelBody)
  )
  const chips = el('div', 'gl-info-chips')
  for (const chip of INFO_COPY.chips) chips.appendChild(el('span', 'gl-fact', chip))
  body.appendChild(chips)
  rightPanel.append(img, el('div', 'gl-info__right-shade'), body)

  grid.append(left, rightPanel)
  screen.appendChild(grid)
  return screen
}

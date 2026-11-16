// The lamp: daylight or UV. UV is the dark theme, and it shows what daylight
// hides. Every page of the site has a lamp; this is the whole of it.

import { reduceMotion } from './motion.js';

const PAPER = { daylight: '#f5f7f4', uv: '#0c0820' };
const KEY = 'cc-light';

/**
 * Wire the page's lamp buttons.
 * @param {object} lamp
 * @param {HTMLElement[]} lamp.buttons  every control that switches the light
 * @param {(theme: 'daylight' | 'uv', how: { instant: boolean }) => void} [lamp.onChange]
 *   called after the light has changed. `instant` is true when the page is
 *   being photographed for the spreading-light transition, so anything that
 *   fades between the lights should jump to the new one.
 */
export function startLamp({ buttons, onChange = () => {} }) {
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  /** Put the page in a light. `chosen` says the reader picked it, so it is kept for next time. */
  function apply(theme, { chosen }) {
    root.dataset.theme = theme;
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(theme === 'uv')));
    if (themeMeta) themeMeta.setAttribute('content', PAPER[theme]);
    // A light nobody picked is not kept: such a reader goes on following their system's light or dark setting.
    if (!chosen) return;
    try {
      localStorage.setItem(KEY, theme);
    } catch (error) {
      // Storage is blocked (private window, strict settings). The lamp still
      // works for this visit; it just will not be remembered next time.
      console.info('The light setting could not be saved on this device:', error.name);
    }
  }

  function press(button) {
    const next = root.dataset.theme === 'uv' ? 'daylight' : 'uv';

    if (!document.startViewTransition || reduceMotion.matches) {
      apply(next, { chosen: true });
      onChange(next, { instant: false });
      return;
    }

    // The new light spreads out from the lamp that was pressed.
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => {
      apply(next, { chosen: true });
      onChange(next, { instant: true });
    });
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
          { duration: 640, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch((error) => {
        // The browser skipped the transition (for example the tab went to the
        // background). The light has still changed; only the spread was skipped.
        console.info('Lamp transition skipped:', error.name);
      });
  }

  apply(root.dataset.theme === 'uv' ? 'uv' : 'daylight', { chosen: false });
  buttons.forEach((button) => button.addEventListener('click', () => press(button)));
}

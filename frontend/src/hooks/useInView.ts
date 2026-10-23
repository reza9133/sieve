import { useEffect, useState, type RefObject } from 'react';

/** True while the element is on screen and the tab is visible. Used to pause 3D rendering. */
export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(!document.hidden);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), {
      threshold: 0.01,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return visible && tabVisible;
}

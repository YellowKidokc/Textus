/** Links scroll fractions only; it makes no claim that paragraph numbers correspond. */
export function linkScroll(
  first: HTMLElement,
  second: HTMLElement,
): () => void {
  let locked = false;
  let frame = 0;
  const sync = (from: HTMLElement, to: HTMLElement) => {
    if (locked) return;
    const extent = from.scrollHeight - from.clientHeight;
    if (extent <= 0) return;
    locked = true;
    to.scrollTop =
      (from.scrollTop / extent) *
      Math.max(0, to.scrollHeight - to.clientHeight);
    frame = requestAnimationFrame(() => {
      locked = false;
    });
  };
  const a = () => sync(first, second),
    b = () => sync(second, first);
  first.addEventListener("scroll", a);
  second.addEventListener("scroll", b);
  return () => {
    cancelAnimationFrame(frame);
    first.removeEventListener("scroll", a);
    second.removeEventListener("scroll", b);
  };
}

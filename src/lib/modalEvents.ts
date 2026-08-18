/**
 * A modal backdrop should close only when the backdrop itself was tapped.
 *
 * React events from portal children still travel through the parent component
 * tree. Without this check, clicking a hidden camera input rendered in a portal
 * can look like a backdrop click and dismiss the form while the camera is open.
 */
export function isDirectBackdropEvent(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  return target === currentTarget;
}

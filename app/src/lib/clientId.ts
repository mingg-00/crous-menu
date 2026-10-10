import './localStorage';
import { randomUUID } from 'expo-crypto';

const KEY = 'crous.clientId';
let memory: string | null = null;

/** Random per-device id for anonymous reactions; never linked to an account. Falls back to a per-session id when
 * storage is blocked (some private windows / in-app browsers). */
export function clientId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return (memory ??= randomUUID());
  }
}

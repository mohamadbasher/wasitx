import type { Locale } from "../enums";
import { ar } from "./ar";
import { en, type Messages } from "./en";
import { he } from "./he";

export type { Messages };
export const messages: Record<Locale, Messages> = { ar, he, en };
export { ar, en, he };

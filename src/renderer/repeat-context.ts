import { createContext } from 'react';

/**
 * The current row/item provided by a `Repeat`. Value-references whose path starts
 * with `item` (e.g. `@item.name`) resolve against this. `undefined` outside a Repeat.
 */
export const RepeatItemContext = createContext<unknown>(undefined);

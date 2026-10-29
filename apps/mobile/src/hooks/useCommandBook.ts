import { commandReducer, createCommandBook } from '@touchline/planning';
import { useReducer } from 'react';

/** Local command book driven by the pure planning reducer. Commands are stored, not executed. */
export function useCommandBook() {
  return useReducer(commandReducer, undefined, createCommandBook);
}

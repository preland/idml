export interface DataBindingDef {
  prop: string;
  methodId: string;
  /**
   * How the binding is wired:
   * - 'handler' (default): the method function is passed as the prop (e.g. onClick).
   * - 'value': the method is called during render and its return value becomes the
   *   prop. If the method is a hook (e.g. wraps useQuery/useState) the component
   *   re-renders reactively when that value changes.
   * - 'model': two-way binding to a form-state cell named by `methodId` — sets the
   *   prop to the current value AND an `onChange` that writes it back.
   */
  kind?: 'handler' | 'value' | 'model';
  /**
   * Only meaningful for `kind:'model'`. When true, `methodId` is NOT the form-state
   * key itself but a value-ref path (e.g. `item.key`) resolved at render to PRODUCE
   * the key — so a Repeat-generated input can two-way-bind to `values[item.key]`.
   * Authored as `~@path` (vs the static `~name`). See useBoundProps.
   */
  dynamicKey?: boolean;
}

export interface VisibilityDef {
  methodId: string;
  negate?: boolean;
}

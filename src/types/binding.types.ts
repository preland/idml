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
}

export interface VisibilityDef {
  methodId: string;
  negate?: boolean;
}

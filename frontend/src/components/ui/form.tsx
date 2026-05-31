import * as React from 'react';
import { Input } from './input';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const EMPTY_VALUE = '__empty__';

type NativeSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  value?: string | number;
  onChange?: (event: { target: { value: string } }) => void;
};

function NativeSelect({ value, onChange, children, disabled, className }: NativeSelectProps) {
  const options = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>[];
  const normalized = value === '' || value === undefined || value === null ? EMPTY_VALUE : String(value);
  return <Select value={normalized} disabled={disabled} onValueChange={(next) => onChange?.({ target: { value: next === EMPTY_VALUE ? '' : next } })}><SelectTrigger className={className}><SelectValue /></SelectTrigger><SelectContent>{options.map((option, index) => { const raw = option.props.value ?? String(option.props.children ?? ''); const itemValue = raw === '' ? EMPTY_VALUE : String(raw); return <SelectItem key={`${itemValue}-${index}`} value={itemValue} disabled={option.props.disabled}>{option.props.children}</SelectItem>; })}</SelectContent></Select>;
}

export { Input, Label, NativeSelect };

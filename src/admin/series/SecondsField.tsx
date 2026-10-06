import { useState } from 'react';

import { AdminField } from '@/admin/ui';

const parse = (text: string) => {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const format = (value: number) => value > 0 ? String(Number(value.toFixed(2))) : '';

/**
 * Decimal seconds input that keeps what the admin is typing ("12.") while
 * still following values set elsewhere (e.g. the intro player).
 */
export function SecondsField({ label, value, onChange, help }: { label: string; value: number; onChange: (value: number) => void; help?: string }) {
  const [text, setText] = useState(() => format(value));
  const shown = parse(text) === value ? text : format(value);
  return <AdminField label={label} value={shown} help={help} keyboardType="decimal-pad" autoCapitalize="none" onChangeText={(next) => { setText(next); onChange(parse(next)); }} />;
}

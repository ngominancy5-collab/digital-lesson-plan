/** Normalize Zambian MSISDN to local 9-digit (7xxxxxxxx / 9xxxxxxxx) and E.164 without +. */
export function normalizeZmMsisdn(input) {
  const digits = String(input || '').replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('260')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);
  if (!/^[79]\d{8}$/.test(local)) {
    return { ok: false, error: 'Enter a valid Zambian mobile number (e.g. 097xxxxxxx or 077xxxxxxx).' };
  }
  return {
    ok: true,
    local,
    international: `260${local}`,
  };
}

export function amountMajorUnits(cents) {
  return (Number(cents) / 100).toFixed(2);
}

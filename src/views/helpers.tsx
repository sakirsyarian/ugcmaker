export const safeJson = (data: unknown) =>
  JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

export const durationOptions = (suffix = 's', selected = 10) => {
  const items = [];
  for (let i = 4; i <= 15; i++) {
    const value = suffix ? `${i}${suffix}` : String(i);
    items.push(
      <option value={value} selected={i === selected}>
        {`${i}s`}
      </option>
    );
  }
  return items;
};

export const createDurationSelectOptions = () => {
  const items = [];
  for (let i = 4; i <= 15; i++) {
    items.push(
      <option value={String(i)} selected={i === 10}>
        {i}s
      </option>
    );
  }
  return items;
};

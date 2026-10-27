/** Per-game bet controls. Returns the `selection` the API expects for each slug. */
export default function GameControls({ slug, selection, onChange, config }) {
  if (slug === 'coinflip') {
    return (
      <fieldset>
        <legend>Call it</legend>
        {(config?.sides ?? ['heads', 'tails']).map((side) => (
          <label key={side} className="radio">
            <input
              type="radio"
              name="side"
              value={side}
              checked={selection.side === side}
              onChange={() => onChange({ side })}
            />
            {side}
          </label>
        ))}
      </fieldset>
    );
  }

  if (slug === 'dice') {
    const target = selection.target ?? 50;
    return (
      <fieldset>
        <legend>Roll under {target}.00</legend>
        <input
          type="range"
          min={config?.minTarget ?? 2}
          max={config?.maxTarget ?? 98}
          value={target}
          onChange={(event) => onChange({ target: Number(event.target.value) })}
        />
        <p className="muted">Pays {(99 / target).toFixed(2)}× — the lower the target, the bigger the win.</p>
      </fieldset>
    );
  }

  if (slug === 'roulette') {
    const betType = selection.betType ?? 'red';
    const meta = config?.betTypes?.[betType];
    return (
      <fieldset>
        <legend>Place your bet</legend>
        <label>
          Bet type
          <select value={betType} onChange={(event) => onChange({ betType: event.target.value, value: 1 })}>
            {Object.keys(config?.betTypes ?? { red: {}, black: {} }).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        {meta?.needsValue && (
          <label>
            Number
            <input
              type="number"
              min={betType === 'straight' ? 0 : 1}
              max={betType === 'straight' ? 36 : 3}
              value={selection.value ?? (betType === 'straight' ? 0 : 1)}
              onChange={(event) => onChange({ betType, value: Number(event.target.value) })}
            />
          </label>
        )}
        {meta && <p className="muted">Pays {meta.multiplier}× your stake.</p>}
      </fieldset>
    );
  }

  return <p className="muted">Set your stake and spin.</p>;
}

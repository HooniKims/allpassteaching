export function FlowSequence({ label, items, ordered = true }) {
    return <span className="flow-sequence">{label}: {items.map((item, index) => <span className="flow-sequence__step" key={item}>{index > 0 ? `${ordered ? '→' : '·'} ${item}` : item}{' '}</span>)}</span>;
}
